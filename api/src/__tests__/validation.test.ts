/**
 * Tests for the shared Zod schemas (api/src/schemas.ts).
 *
 * These import the *real* schemas used by the route handlers, so the
 * assertions cannot drift away from production validation.
 */

import { describe, it, expect } from 'vitest';
import { CreateJobSchema, ProgressSchema, AudioSchema, QuickTtsSchema } from '../schemas';

describe('CreateJobSchema', () => {
  const validJob = {
    source: { type: 'text' as const, content: 'Hello world' },
    contentType: 'podcast' as const,
    settings: {
      duration: 5,
      voices: [{ role: 'host', voiceId: 'voice-1' }],
    },
  };

  it('accepts a valid job request', () => {
    expect(CreateJobSchema.safeParse(validJob).success).toBe(true);
  });

  it('accepts auto contentType', () => {
    expect(CreateJobSchema.safeParse({ ...validJob, contentType: 'auto' }).success).toBe(true);
  });

  it('accepts url source type', () => {
    const result = CreateJobSchema.safeParse({
      ...validJob,
      source: { type: 'url', content: 'https://example.com' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid contentType', () => {
    expect(CreateJobSchema.safeParse({ ...validJob, contentType: 'hacked' }).success).toBe(false);
  });

  it('rejects invalid sourceType', () => {
    const result = CreateJobSchema.safeParse({
      ...validJob,
      source: { type: 'invalid', content: 'x' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects the removed `document` source type', () => {
    const result = CreateJobSchema.safeParse({
      ...validJob,
      source: { type: 'document', content: 'x' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty content', () => {
    expect(
      CreateJobSchema.safeParse({ ...validJob, source: { type: 'text', content: '' } }).success
    ).toBe(false);
  });

  it('rejects content exceeding 100K chars', () => {
    const result = CreateJobSchema.safeParse({
      ...validJob,
      source: { type: 'text', content: 'x'.repeat(100001) },
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty voices array', () => {
    const result = CreateJobSchema.safeParse({
      ...validJob,
      settings: { ...validJob.settings, voices: [] },
    });
    expect(result.success).toBe(false);
  });

  it('rejects duration > 60', () => {
    const result = CreateJobSchema.safeParse({
      ...validJob,
      settings: { ...validJob.settings, duration: 61 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects duration < 1', () => {
    const result = CreateJobSchema.safeParse({
      ...validJob,
      settings: { ...validJob.settings, duration: 0 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects title > 200 chars', () => {
    expect(CreateJobSchema.safeParse({ ...validJob, title: 'x'.repeat(201) }).success).toBe(false);
  });
});

describe('ProgressSchema', () => {
  it('accepts a valid progress update', () => {
    const result = ProgressSchema.safeParse({
      status: 'scripting',
      progress: 50,
      currentStage: 'scripting',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid status', () => {
    const result = ProgressSchema.safeParse({
      status: 'hacked',
      progress: 50,
      currentStage: 'scripting',
    });
    expect(result.success).toBe(false);
  });

  it('rejects progress > 100', () => {
    const result = ProgressSchema.safeParse({
      status: 'scripting',
      progress: 150,
      currentStage: 'scripting',
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative progress', () => {
    const result = ProgressSchema.safeParse({
      status: 'scripting',
      progress: -10,
      currentStage: 'scripting',
    });
    expect(result.success).toBe(false);
  });
});

describe('AudioSchema', () => {
  it('accepts a valid audio payload', () => {
    const result = AudioSchema.safeParse({
      audioBase64: 'dGVzdA==',
      duration: 120.5,
      format: 'mp3',
    });
    expect(result.success).toBe(true);
  });

  it('rejects negative duration', () => {
    expect(
      AudioSchema.safeParse({ audioBase64: 'dGVzdA==', duration: -5, format: 'mp3' }).success
    ).toBe(false);
  });

  it('rejects duration > 7200', () => {
    expect(
      AudioSchema.safeParse({ audioBase64: 'dGVzdA==', duration: 7201, format: 'mp3' }).success
    ).toBe(false);
  });

  it('rejects an invalid format', () => {
    expect(
      AudioSchema.safeParse({ audioBase64: 'dGVzdA==', duration: 10, format: 'flac' }).success
    ).toBe(false);
  });

  it('rejects empty audioBase64', () => {
    expect(AudioSchema.safeParse({ audioBase64: '', duration: 10, format: 'mp3' }).success).toBe(
      false
    );
  });
});

describe('QuickTtsSchema', () => {
  const valid = { text: 'Hello', voiceId: 'sf-alex' };

  it('accepts a minimal valid request', () => {
    expect(QuickTtsSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts optional speed and format', () => {
    expect(QuickTtsSchema.safeParse({ ...valid, speed: 1.5, format: 'wav' }).success).toBe(true);
  });

  it('rejects empty text', () => {
    expect(QuickTtsSchema.safeParse({ ...valid, text: '' }).success).toBe(false);
  });

  it('rejects text over 5000 chars', () => {
    expect(QuickTtsSchema.safeParse({ ...valid, text: 'x'.repeat(5001) }).success).toBe(false);
  });

  it('rejects a missing voiceId', () => {
    expect(QuickTtsSchema.safeParse({ text: 'Hello' }).success).toBe(false);
  });

  it('rejects an out-of-range speed', () => {
    expect(QuickTtsSchema.safeParse({ ...valid, speed: 5 }).success).toBe(false);
  });
});
