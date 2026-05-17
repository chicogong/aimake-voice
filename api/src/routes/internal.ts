/**
 * Internal Routes — callbacks from the agent service
 * Secured by X-Internal-Secret header (not Clerk auth).
 * Mounted BEFORE auth middleware (public route section).
 *
 * POST /api/internal/jobs/:id/progress — Update generation progress
 * POST /api/internal/jobs/:id/script   — Save generated script
 * POST /api/internal/jobs/:id/audio    — Upload and store final audio
 */

import { Hono } from 'hono';
import { eq, sql } from 'drizzle-orm';
import type { Env, Variables } from '../types';
import { createDb } from '../db';
import { jobs, users, usageLogs } from '../db/schema';
import { generateId } from '../utils/id';
import { errors } from '../middleware/error';
import { ProgressSchema, ScriptSchema, AudioSchema } from '../schemas';
import { estimateApiCost } from '../utils/pricing';

const internalRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// ============ Secret verification middleware ============

internalRoutes.use('*', async (c, next) => {
  const secret = c.req.header('X-Internal-Secret');
  if (!c.env.INTERNAL_API_SECRET || secret !== c.env.INTERNAL_API_SECRET) {
    throw errors.unauthorized('Unauthorized');
  }
  await next();
});

// ============ Progress Update ============

internalRoutes.post('/jobs/:id/progress', async (c) => {
  const { id } = c.req.param();
  const raw = await c.req.json();

  const parsed = ProgressSchema.safeParse(raw);
  if (!parsed.success) {
    throw errors.validation('Invalid payload', parsed.error.format());
  }

  const body = parsed.data;
  const db = createDb(c.env.DB);
  const now = new Date().toISOString();

  const baseUpdate = {
    status: body.status,
    progress: body.progress,
    currentStage: body.currentStage,
    errorCode: body.errorCode ?? null,
    errorMessage: body.errorMessage ?? null,
    updatedAt: now,
    ...(body.detectedContentType ? { detectedContentType: body.detectedContentType } : {}),
  } as const;

  // For non-pending/failed statuses, set startedAt atomically iff still null.
  // Using SQL CASE prevents the read-then-write race where two concurrent
  // callbacks both observed startedAt=null and both wrote a value.
  const update =
    body.status === 'pending' || body.status === 'failed'
      ? baseUpdate
      : {
          ...baseUpdate,
          startedAt: sql`COALESCE(${jobs.startedAt}, ${now})`,
        };

  await db.update(jobs).set(update).where(eq(jobs.id, id));

  return c.json({ success: true });
});

// ============ Script Save ============

internalRoutes.post('/jobs/:id/script', async (c) => {
  const { id } = c.req.param();
  const raw = await c.req.json();

  const parsed = ScriptSchema.safeParse(raw);
  if (!parsed.success) {
    throw errors.validation('Invalid payload', parsed.error.format());
  }

  const body = parsed.data;
  const db = createDb(c.env.DB);

  await db
    .update(jobs)
    .set({
      script: body.script,
      updatedAt: new Date().toISOString(),
      ...(body.title ? { title: body.title } : {}),
    })
    .where(eq(jobs.id, id));

  return c.json({ success: true });
});

// ============ Audio Upload ============

internalRoutes.post('/jobs/:id/audio', async (c) => {
  const { id } = c.req.param();
  const raw = await c.req.json();

  const parsed = AudioSchema.safeParse(raw);
  if (!parsed.success) {
    throw errors.validation('Invalid payload', parsed.error.format());
  }

  const body = parsed.data;
  const db = createDb(c.env.DB);

  let audioBuffer: Uint8Array;
  try {
    audioBuffer = Uint8Array.from(atob(body.audioBase64), (ch) => ch.charCodeAt(0));
  } catch {
    throw errors.validation('Invalid base64 audio data');
  }

  let audioUrl: string;

  if (c.env.R2) {
    const key = `jobs/${id}.${body.format}`;
    await c.env.R2.put(key, audioBuffer.buffer as ArrayBuffer, {
      httpMetadata: {
        contentType: body.format === 'mp3' ? 'audio/mpeg' : 'audio/wav',
      },
    });
    audioUrl = key;
  } else {
    const kvKey = `job-audio:${id}`;
    await c.env.KV.put(kvKey, body.audioBase64, {
      metadata: { format: body.format, duration: body.duration },
    });
    audioUrl = `kv://${kvKey}`;
  }

  const now = new Date().toISOString();
  const quotaDelta = Math.ceil(body.duration);

  // Look up the job once to get userId / contentType / source size for the usage log.
  // Quota and usage writes go through db.batch() so they apply atomically.
  const [job] = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
  if (!job) {
    throw errors.notFound('Job not found');
  }

  // Idempotency: a retried agent callback after a successful prior commit must not
  // re-charge quota or insert a duplicate usage log.
  if (job.status === 'completed' && job.audioUrl) {
    return c.json({ success: true, audioUrl: job.audioUrl, idempotent: true });
  }

  await db.batch([
    db
      .update(jobs)
      .set({
        audioUrl,
        audioFormat: body.format,
        duration: body.duration,
        fileSize: audioBuffer.byteLength,
        status: 'completed',
        progress: 100,
        currentStage: 'completed',
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(jobs.id, id)),
    db.insert(usageLogs).values({
      id: generateId(),
      userId: job.userId,
      type: job.contentType as 'tts' | 'podcast' | 'audiobook' | 'voiceover' | 'education',
      charsUsed: job.sourceContent.length,
      durationUsed: body.duration,
      apiCost: estimateApiCost(body.duration),
      jobId: id,
      provider: 'agent',
      createdAt: now,
    }),
    db
      .update(users)
      .set({
        quotaUsed: sql`${users.quotaUsed} + ${quotaDelta}`,
        updatedAt: now,
      })
      .where(eq(users.id, job.userId)),
  ]);

  return c.json({ success: true, audioUrl });
});

export default internalRoutes;
