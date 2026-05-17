/**
 * Jobs Routes — Unified content generation
 * POST   /api/jobs           — Create a generation job
 * GET    /api/jobs            — List jobs (paginated)
 * GET    /api/jobs/:id        — Job detail
 * GET    /api/jobs/:id/stream — SSE progress stream
 * DELETE /api/jobs/:id        — Soft delete
 * GET    /api/jobs/:id/download — Download audio
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { eq, and, desc, sql, ne } from 'drizzle-orm';
import type { Env, Variables, JobResponse, ContentType } from '../types';
import { createDb, jobs, type Database } from '../db';
import { generateId, generateShortId } from '../utils/id';
import { success, created } from '../utils/response';
import { errors } from '../middleware/error';
import { CreateJobSchema, UpdateScriptSchema } from '../schemas';

interface AgentDispatchPayload {
  jobId: string;
  source: { type: 'text' | 'url'; content: string };
  contentType: 'auto' | 'podcast' | 'audiobook' | 'voiceover' | 'education' | 'tts';
  settings: Record<string, unknown>;
  title?: string | null;
  callbackUrl?: string;
  resumeStage?: 'synthesizing';
}

/**
 * Dispatch a job to the agent service.
 * Fire-and-forget at the request level (we return immediately to the user),
 * but a dispatch failure marks the job as failed so the UI can surface it
 * instead of leaving the user staring at a permanently `pending` job.
 */
async function dispatchToAgent(
  db: Database,
  env: Env,
  payload: AgentDispatchPayload
): Promise<void> {
  const markFailed = async (errorMessage: string) => {
    console.error(`[jobs] dispatch failed for ${payload.jobId}: ${errorMessage}`);
    await db
      .update(jobs)
      .set({
        status: 'failed',
        errorCode: 'AGENT_UNAVAILABLE',
        errorMessage: 'Agent service is unreachable. Please try again later.',
        updatedAt: new Date().toISOString(),
      })
      .where(eq(jobs.id, payload.jobId));
  };

  if (!env.AGENT_SERVICE_URL || !env.INTERNAL_API_SECRET) {
    await markFailed('AGENT_SERVICE_URL or INTERNAL_API_SECRET is not configured');
    return;
  }

  try {
    const response = await fetch(`${env.AGENT_SERVICE_URL}/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': env.INTERNAL_API_SECRET,
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => 'unknown');
      await markFailed(`Agent dispatch returned ${response.status}: ${text}`);
    }
  } catch (err) {
    await markFailed(err instanceof Error ? err.message : 'Agent dispatch failed');
  }
}

const jobsRouter = new Hono<{ Bindings: Env; Variables: Variables }>();

// POST /api/jobs — Create a generation job
jobsRouter.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();

  // Zod validation
  const parsed = CreateJobSchema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0];
    throw errors.validation(firstError?.message || '请求参数错误', parsed.error.format());
  }

  const data = parsed.data;

  // Quota check
  const remaining = user.quotaLimit - user.quotaUsed;
  if (remaining <= 0) {
    throw errors.quotaExceeded('配额不足，请升级套餐');
  }

  // Resolve content type
  const contentType: ContentType = data.contentType === 'auto' ? 'podcast' : data.contentType;

  const db = createDb(c.env.DB);
  const jobId = generateId();
  const streamToken = generateShortId() + generateShortId();
  const now = new Date().toISOString();

  await db.insert(jobs).values({
    id: jobId,
    userId: user.id,
    title: data.title || null,
    contentType,
    sourceType: data.source.type,
    sourceContent: data.source.content,
    settings: JSON.stringify(data.settings),
    status: 'pending',
    progress: 0,
    streamToken,
    isQuickTts: false,
    createdAt: now,
    updatedAt: now,
  });

  // Fire-and-forget at the response level — dispatch + failure handling
  // run via waitUntil so the worker doesn't terminate before they finish.
  const dispatch = dispatchToAgent(db, c.env, {
    jobId,
    source: data.source,
    contentType: data.contentType,
    settings: { ...data.settings, episodeDuration: data.settings.duration },
    title: data.title,
  });
  c.executionCtx.waitUntil(dispatch);

  return created(c, {
    id: jobId,
    status: 'pending',
    streamToken,
  });
});

// GET /api/jobs — List jobs
jobsRouter.get('/', async (c) => {
  const user = c.get('user');
  const page = parseInt(c.req.query('page') || '1', 10);
  const pageSize = Math.min(parseInt(c.req.query('pageSize') || '20', 10), 100);
  const contentType = c.req.query('contentType') as ContentType | undefined;
  const offset = (page - 1) * pageSize;

  const db = createDb(c.env.DB);

  const conditions = [eq(jobs.userId, user.id), ne(jobs.isDeleted, true)];

  if (contentType) {
    conditions.push(eq(jobs.contentType, contentType));
  }

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(jobs)
    .where(and(...conditions));

  const total = countResult?.count || 0;

  const records = await db
    .select()
    .from(jobs)
    .where(and(...conditions))
    .orderBy(desc(jobs.createdAt))
    .limit(pageSize)
    .offset(offset);

  const items: JobResponse[] = records.map(jobToResponse);

  return success(c, items, { total, page, pageSize });
});

// GET /api/jobs/:id — Job detail
jobsRouter.get('/:id', async (c) => {
  const user = c.get('user');
  const { id } = c.req.param();

  const db = createDb(c.env.DB);
  const [job] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, id), eq(jobs.userId, user.id)))
    .limit(1);

  if (!job) {
    throw errors.notFound('任务不存在');
  }

  return success(c, {
    ...jobToResponse(job),
    sourceContent: job.sourceContent,
    settings: job.settings,
    script: job.script,
    detectedContentType: job.detectedContentType,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
  });
});

// SSE stream router — mounted as public route (no auth required, uses stream token)
export const jobsStreamRouter = new Hono<{ Bindings: Env; Variables: Variables }>();

jobsStreamRouter.get('/:id/stream', async (c) => {
  const { id } = c.req.param();
  const token = c.req.query('token');

  const db = createDb(c.env.DB);

  // Verify stream token
  const [job] = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);

  if (!job || !token || job.streamToken !== token) {
    throw errors.unauthorized('Invalid stream token');
  }

  return streamSSE(c, async (stream) => {
    let lastStatus = '';
    let lastProgress = -1;
    let lastScript = '';
    let elapsed = 0;
    const maxDuration = 600; // 10 minutes max (seconds)
    let heartbeatCounter = 0;

    // Adaptive polling: fast during active synthesis, slow during idle stages
    function getInterval(status: string): number {
      switch (status) {
        case 'synthesizing':
        case 'assembling':
          return 1; // 1s — progress changes rapidly
        case 'scripting':
          return 2; // 2s — moderate updates
        default:
          return 3; // 3s — pending/classifying/extracting/analyzing
      }
    }

    while (elapsed < maxDuration && !stream.aborted) {
      const [current] = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);

      if (!current) break;

      const interval = getInterval(current.status);

      // Send update if something changed
      if (current.status !== lastStatus || current.progress !== lastProgress) {
        lastStatus = current.status;
        lastProgress = current.progress ?? 0;
        heartbeatCounter = 0;

        if (current.status === 'completed') {
          await stream.writeSSE({
            event: 'complete',
            data: JSON.stringify({
              type: 'complete',
              audioUrl: current.audioUrl,
              duration: current.duration,
              fileSize: current.fileSize,
            }),
          });
          break;
        }

        if (current.status === 'failed') {
          await stream.writeSSE({
            event: 'error',
            data: JSON.stringify({
              type: 'error',
              code: current.errorCode || 'JOB_ERROR',
              message: current.errorMessage || '生成失败',
            }),
          });
          break;
        }

        await stream.writeSSE({
          event: 'progress',
          data: JSON.stringify({
            type: 'progress',
            status: current.status,
            progress: current.progress,
            currentStage: current.currentStage,
          }),
        });
      }

      // Send script if it changed
      if (current.script && current.script !== lastScript) {
        lastScript = current.script;
        await stream.writeSSE({
          event: 'script_update',
          data: JSON.stringify({
            type: 'script_update',
            script: current.script,
          }),
        });
      }

      // Heartbeat to keep connection alive
      heartbeatCounter += interval;
      if (heartbeatCounter >= 15) {
        await stream.writeSSE({ event: 'ping', data: '' });
        heartbeatCounter = 0;
      }

      elapsed += interval;
      await stream.sleep(interval * 1000);
    }
  });
});

// PUT /api/jobs/:id/script — Update job script and reset status
jobsRouter.put('/:id/script', async (c) => {
  const user = c.get('user');
  const { id } = c.req.param();

  const parsed = UpdateScriptSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    throw errors.validation(parsed.error.errors[0]?.message || 'script 无效');
  }
  const { script } = parsed.data;

  const db = createDb(c.env.DB);
  const [job] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, id), eq(jobs.userId, user.id)))
    .limit(1);

  if (!job) {
    throw errors.notFound('任务不存在');
  }

  const now = new Date().toISOString();
  await db
    .update(jobs)
    .set({
      script,
      status: 'scripting', // Reset to scripting to allow re-synthesis
      progress: 50,
      currentStage: 'scripting',
      updatedAt: now,
    })
    .where(eq(jobs.id, id));

  return success(c, { id, status: 'scripting' });
});

// POST /api/jobs/:id/synthesize — Trigger re-synthesis for edited script
jobsRouter.post('/:id/synthesize', async (c) => {
  const user = c.get('user');
  const { id } = c.req.param();

  const db = createDb(c.env.DB);
  const [job] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, id), eq(jobs.userId, user.id)))
    .limit(1);

  if (!job) {
    throw errors.notFound('任务不存在');
  }

  // Status guard: only allow re-synthesis from safe states
  const allowedStatuses = ['completed', 'failed', 'scripting'];
  if (!allowedStatuses.includes(job.status)) {
    throw errors.validation(`当前状态「${job.status}」不允许重新合成，请等待当前任务完成`);
  }

  // Quota check
  const remaining = user.quotaLimit - user.quotaUsed;
  if (remaining <= 0) {
    throw errors.quotaExceeded('配额不足，请升级套餐');
  }

  const settings = parseSettings(job.settings);
  const dispatch = dispatchToAgent(db, c.env, {
    jobId: job.id,
    source: {
      type: job.sourceType,
      content: job.sourceContent,
    },
    contentType: job.contentType as AgentDispatchPayload['contentType'],
    settings: { ...settings, episodeDuration: settings.duration },
    title: job.title,
    resumeStage: 'synthesizing',
  });
  c.executionCtx.waitUntil(dispatch);

  return success(c, { id, status: 'synthesizing' });
});

function parseSettings(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

// DELETE /api/jobs/:id — Soft delete
jobsRouter.delete('/:id', async (c) => {
  const user = c.get('user');
  const { id } = c.req.param();

  const db = createDb(c.env.DB);

  const [job] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, id), eq(jobs.userId, user.id)))
    .limit(1);

  if (!job) {
    throw errors.notFound('任务不存在');
  }

  await db
    .update(jobs)
    .set({ isDeleted: true, updatedAt: new Date().toISOString() })
    .where(eq(jobs.id, id));

  return success(c, { deleted: true });
});

// GET /api/jobs/:id/download — Download audio
jobsRouter.get('/:id/download', async (c) => {
  const user = c.get('user');
  const { id } = c.req.param();

  const db = createDb(c.env.DB);
  const [job] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, id), eq(jobs.userId, user.id)))
    .limit(1);

  if (!job || !job.audioUrl) {
    throw errors.notFound('音频不存在');
  }

  // R2 key stored in audioUrl
  if (c.env.R2 && !job.audioUrl.startsWith('kv://')) {
    const object = await c.env.R2.get(job.audioUrl);
    if (!object) {
      throw errors.notFound('音频文件不存在');
    }

    const contentType = job.audioFormat === 'wav' ? 'audio/wav' : 'audio/mpeg';
    const filename = `${job.title || 'audio'}.${job.audioFormat || 'mp3'}`;

    return new Response(object.body, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      },
    });
  }

  // KV fallback
  if (job.audioUrl.startsWith('kv://')) {
    const kvKey = job.audioUrl.replace('kv://', '');
    const audioData = await c.env.KV.get(kvKey);
    if (!audioData) {
      throw errors.notFound('音频文件已过期');
    }

    const audioBuffer = Uint8Array.from(atob(audioData), (ch) => ch.charCodeAt(0));
    const contentType = job.audioFormat === 'wav' ? 'audio/wav' : 'audio/mpeg';

    return new Response(audioBuffer.buffer, {
      headers: {
        'Content-Type': contentType,
      },
    });
  }

  throw errors.notFound('无法获取音频');
});

// ============ Helpers ============

function jobToResponse(job: typeof jobs.$inferSelect): JobResponse {
  const response: JobResponse = {
    id: job.id,
    title: job.title,
    contentType: job.contentType as ContentType,
    sourceType: job.sourceType,
    status: job.status as JobResponse['status'],
    progress: job.progress ?? 0,
    currentStage: job.currentStage,
    audioUrl: job.audioUrl,
    audioFormat: job.audioFormat,
    duration: job.duration,
    fileSize: job.fileSize,
    streamToken: job.streamToken,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };

  if (job.status === 'failed' && (job.errorCode || job.errorMessage)) {
    response.error = {
      code: job.errorCode || 'JOB_ERROR',
      message: job.errorMessage || '生成失败',
    };
  }

  return response;
}

export default jobsRouter;
