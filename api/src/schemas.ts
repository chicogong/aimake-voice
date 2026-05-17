/**
 * Shared Zod schemas — request and callback payload validation.
 *
 * Single source of truth: route handlers AND tests import from here, so a
 * schema change can never silently drift away from what the tests assert.
 */

import { z } from 'zod';

// ============ Enums ============

/** Full job lifecycle status (`pending` precedes the agent pipeline). */
export const JobStatusEnum = z.enum([
  'pending',
  'classifying',
  'extracting',
  'analyzing',
  'scripting',
  'synthesizing',
  'assembling',
  'completed',
  'failed',
]);

export const SourceTypeEnum = z.enum(['text', 'url']);

export const ContentTypeEnum = z.enum([
  'auto',
  'podcast',
  'audiobook',
  'voiceover',
  'education',
  'tts',
]);

export const AudioFormatEnum = z.enum(['mp3', 'wav']);

// ============ Job creation (frontend → API) ============

export const CreateJobSchema = z.object({
  source: z.object({
    type: SourceTypeEnum,
    content: z.string().min(1, 'source.content 不能为空').max(100000, '内容不能超过 10 万字符'),
  }),
  contentType: ContentTypeEnum,
  settings: z.object({
    duration: z.number().int().min(1).max(60),
    language: z.enum(['zh', 'en']).optional(),
    style: z.string().max(100).optional(),
    voices: z
      .array(
        z.object({
          role: z.string().min(1).max(50),
          voiceId: z.string().min(1).max(100),
        })
      )
      .min(1, '请至少选择一个音色'),
  }),
  title: z.string().max(200).optional(),
});

/** PUT /api/jobs/:id/script — user-edited script. */
export const UpdateScriptSchema = z.object({
  script: z.string().min(1, 'script 不能为空').max(500000, 'script 不能超过 500KB'),
});

// ============ Quick TTS (frontend → API) ============

export const QuickTtsSchema = z.object({
  text: z.string().min(1, '文本不能为空').max(5000, '文本长度不能超过 5000 字符'),
  voiceId: z.string().min(1, 'voiceId 不能为空').max(100),
  speed: z.number().min(0.5).max(2).optional(),
  format: AudioFormatEnum.optional(),
});

// ============ Internal callbacks (agent → API) ============

export const ProgressSchema = z.object({
  status: JobStatusEnum,
  progress: z.number().min(0).max(100),
  currentStage: z.string().min(1).max(50),
  detectedContentType: z.string().max(50).optional(),
  errorCode: z.string().max(100).optional(),
  errorMessage: z.string().max(1000).optional(),
});

export const ScriptSchema = z.object({
  script: z.string().min(1).max(500000), // 500KB max
  title: z.string().max(200).optional(),
});

export const AudioSchema = z.object({
  audioBase64: z.string().min(1),
  duration: z.number().min(0).max(7200), // max 2 hours
  format: AudioFormatEnum,
});

// ============ Inferred types ============

export type CreateJobInput = z.infer<typeof CreateJobSchema>;
export type QuickTtsInput = z.infer<typeof QuickTtsSchema>;
export type ProgressInput = z.infer<typeof ProgressSchema>;
