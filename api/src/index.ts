/**
 * AIMake API — Universal Voice Content Agent
 * Cloudflare Workers + Hono
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { timing } from 'hono/timing';

import type { Env, Variables } from './types';
import { errorHandler } from './middleware/error';
import { authMiddleware } from './middleware/auth';
import { rateLimitMiddleware } from './middleware/rateLimit';

// Routes
import healthRoutes from './routes/health';
import authRoutes, { clerkWebhook } from './routes/auth';
import voicesRoutes from './routes/voices';
import jobsRoutes, { jobsStreamRouter } from './routes/jobs';
import ttsRoutes from './routes/tts';
import userRoutes from './routes/user';
import internalRoutes from './routes/internal';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// ============ Global Middleware ============

app.use('*', logger());
app.use('*', timing());
app.use('*', secureHeaders());

app.use(
  '*',
  cors({
    origin: (origin, c) => {
      if (!origin) return null;

      const allowed = c.env.CORS_ORIGIN?.split(',').map((s: string) => s.trim()) || [];
      if (allowed.includes(origin)) return origin;

      if (origin.startsWith('http://localhost:')) return origin;

      if (
        origin === 'https://studio.aimake.cc' ||
        origin === 'https://aimake.cc' ||
        origin === 'https://app.aimake.cc'
      ) {
        return origin;
      }

      if (origin.includes('.aimake-app.pages.dev')) {
        return origin;
      }

      return null;
    },
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  })
);

app.onError(errorHandler);

// ============ Public Routes ============

app.route('/api/health', healthRoutes);
app.route('/api/voices', voicesRoutes);
app.route('/api/webhook', clerkWebhook);
app.route('/api/internal', internalRoutes);
app.route('/api/jobs', jobsStreamRouter); // SSE stream uses token auth, no JWT needed

// ============ Protected Routes ============

app.use('/api/*', authMiddleware);
app.use('/api/*', rateLimitMiddleware());

app.route('/api/auth', authRoutes);
app.route('/api/jobs', jobsRoutes);
app.route('/api/tts', ttsRoutes);
app.route('/api/user', userRoutes);

// ============ Fallback ============

app.notFound((c) => {
  return c.json(
    {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'API endpoint not found',
      },
    },
    404
  );
});

export default app;
