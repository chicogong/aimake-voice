/**
 * Quick TTS Routes
 * POST /api/tts/quick — Direct TTS, no Agent, returns audio buffer
 */

import { Hono } from 'hono';
import type { Env, Variables } from '../types';
import { createDb } from '../db';
import { TTSService } from '../services/tts';
import { errors } from '../middleware/error';
import { ttsRateLimitMiddleware } from '../middleware/rateLimit';
import { QuickTtsSchema } from '../schemas';

const ttsRouter = new Hono<{ Bindings: Env; Variables: Variables }>();

// POST /api/tts/quick — Quick TTS (sync, returns audio blob)
ttsRouter.post('/quick', ttsRateLimitMiddleware, async (c) => {
  const user = c.get('user');

  const parsed = QuickTtsSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    throw errors.validation(parsed.error.errors[0]?.message || '请求参数错误');
  }
  const body = parsed.data;

  const db = createDb(c.env.DB);
  const ttsService = new TTSService(db, c.env);

  const audioBuffer = await ttsService.generateDirect(user, {
    text: body.text,
    voiceId: body.voiceId,
    speed: body.speed,
    format: body.format,
  });

  const contentType = body.format === 'wav' ? 'audio/wav' : 'audio/mpeg';

  return new Response(audioBuffer, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="tts.${body.format || 'mp3'}"`,
    },
  });
});

export default ttsRouter;
