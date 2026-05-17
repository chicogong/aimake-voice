/**
 * Auth Routes
 * GET /api/auth/me - Get current user
 * POST /api/webhook/clerk - Clerk webhook handler
 */

import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import type { Env, Variables } from '../types';
import { createDb, users } from '../db';
import { generateId } from '../utils/id';
import { getNextMonthReset } from '../utils/date';
import { success } from '../utils/response';

const auth = new Hono<{ Bindings: Env; Variables: Variables }>();

// GET /api/auth/me - Get current user info
auth.get('/me', (c) => {
  const user = c.get('user');

  const remaining = Math.max(0, user.quotaLimit - user.quotaUsed);

  return success(c, {
    id: user.id,
    clerkId: user.clerkId,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    plan: user.plan,
    quota: {
      limit: user.quotaLimit,
      used: user.quotaUsed,
      remaining,
      resetAt: user.quotaResetAt || getNextMonthReset(),
    },
    createdAt: user.createdAt,
  });
});

export default auth;

// ============ Clerk Webhook Handler ============

export const clerkWebhook = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * Verify Clerk/Svix webhook signature using Web Crypto API.
 * No external dependencies — works natively in CF Workers.
 */
async function verifyWebhookSignature(
  body: string,
  secret: string,
  svixId: string,
  svixTimestamp: string,
  svixSignature: string
): Promise<boolean> {
  // Reject stale timestamps (> 5 minutes)
  const timestamp = parseInt(svixTimestamp, 10);
  if (isNaN(timestamp)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > 300) return false;

  // Decode secret (strip "whsec_" prefix, base64 decode)
  const rawSecret = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  const secretBytes = Uint8Array.from(atob(rawSecret), (ch) => ch.charCodeAt(0));

  // Build signed content
  const signedContent = `${svixId}.${svixTimestamp}.${body}`;
  const encoder = new TextEncoder();

  // HMAC-SHA256
  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(signedContent));
  const expectedSig = btoa(String.fromCharCode(...new Uint8Array(sig)));

  // Compare against all provided signatures (format: "v1,<base64>")
  const signatures = svixSignature
    .split(' ')
    .map((s) => s.split(',')[1])
    .filter(Boolean);
  return signatures.some((s) => s === expectedSig);
}

clerkWebhook.post('/clerk', async (c) => {
  const svixId = c.req.header('svix-id');
  const svixTimestamp = c.req.header('svix-timestamp');
  const svixSignature = c.req.header('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    return c.json({ success: false, error: 'Missing webhook headers' }, 400);
  }

  // Read raw body for signature verification
  const rawBody = await c.req.text();

  // Verify signature
  const webhookSecret = c.env.CLERK_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('CLERK_WEBHOOK_SECRET not configured');
    return c.json({ success: false, error: 'Webhook not configured' }, 500);
  }

  const isValid = await verifyWebhookSignature(
    rawBody,
    webhookSecret,
    svixId,
    svixTimestamp,
    svixSignature
  );

  if (!isValid) {
    return c.json({ success: false, error: 'Invalid signature' }, 401);
  }

  let body: {
    type: string;
    data: {
      id: string;
      email_addresses?: Array<{ email_address: string }>;
      first_name?: string | null;
      last_name?: string | null;
      image_url?: string | null;
    };
  };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return c.json({ success: false, error: 'Invalid JSON body' }, 400);
  }

  const db = createDb(c.env.DB);

  try {
    switch (body.type) {
      case 'user.created': {
        const email = body.data.email_addresses?.[0]?.email_address;
        if (!email) {
          return c.json({ success: false, error: 'No email' }, 400);
        }

        const name = [body.data.first_name, body.data.last_name].filter(Boolean).join(' ') || null;

        await db.insert(users).values({
          id: generateId(),
          clerkId: body.data.id,
          email,
          name,
          avatarUrl: body.data.image_url || null,
          plan: 'free',
          quotaLimit: 600,
          quotaUsed: 0,
          quotaResetAt: getNextMonthReset(),
        });
        break;
      }

      case 'user.updated': {
        const email = body.data.email_addresses?.[0]?.email_address;
        const name = [body.data.first_name, body.data.last_name].filter(Boolean).join(' ') || null;

        await db
          .update(users)
          .set({
            email: email || undefined,
            name,
            avatarUrl: body.data.image_url || null,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(users.clerkId, body.data.id));
        break;
      }

      case 'user.deleted': {
        await db.delete(users).where(eq(users.clerkId, body.data.id));
        break;
      }

      default:
        console.warn(`Unhandled webhook type: ${body.type}`);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return c.json({ success: false, error: 'Internal error' }, 500);
  }
});
