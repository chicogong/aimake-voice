import { z } from 'zod';

// ============ Request from Workers API ============

export type ContentType = 'auto' | 'podcast' | 'audiobook' | 'voiceover' | 'education' | 'tts';

export const GenerateRequestSchema = z.object({
  jobId: z.string(),
  source: z.object({
    type: z.enum(['text', 'url']),
    content: z.string(),
  }),
  contentType: z.enum(['auto', 'podcast', 'audiobook', 'voiceover', 'education', 'tts']),
  settings: z.object({
    episodeDuration: z.number(),
    style: z.string().optional(),
    language: z.enum(['zh', 'en']).optional().default('zh'),
    voices: z.array(
      z.object({
        role: z.string(),
        voiceId: z.string(),
      })
    ),
  }),
  title: z.string().optional(),
  callbackUrl: z.string().optional(),
  resumeStage: z.enum(['synthesizing']).optional(),
});

export interface GenerateRequest extends z.infer<typeof GenerateRequestSchema> {}

// ============ Script Types ============

export interface ScriptSegment {
  index: number;
  speaker: string; // 'host'|'guest'|'narrator'|'teacher'|'student'
  text: string;
  emotion?: string;
  speed?: number;
}

export interface GeneratedScript {
  title: string;
  segments: ScriptSegment[];
  estimatedDuration: number; // seconds
}

// ============ Tool Outputs ============

export interface ExtractedContent {
  title: string | null;
  text: string;
  charCount: number;
  language: 'zh' | 'en';
}

export interface TTSSegmentResult {
  index: number;
  audioBase64: string;
  duration: number;
}

export interface AssembledAudio {
  audioBase64: string;
  totalDuration: number;
}

// ============ Progress ============

/** Pipeline stages the agent executes. */
export type JobStage =
  | 'classifying'
  | 'extracting'
  | 'analyzing'
  | 'scripting'
  | 'synthesizing'
  | 'assembling'
  | 'completed'
  | 'failed';

/** Full job lifecycle status stored by the API (`pending` precedes the pipeline). */
export type JobStatus = 'pending' | JobStage;

export interface ProgressUpdate {
  stage: JobStage;
  progress: number;
  message?: string;
}

// ============ Callback Payloads ============

export interface ProgressCallbackPayload {
  status: JobStatus;
  progress: number;
  currentStage: string;
  detectedContentType?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface ScriptCallbackPayload {
  script: string;
  title?: string;
}

export interface AudioCallbackPayload {
  audioBase64: string;
  duration: number;
  format: string;
}

// ============ Environment ============

export interface ServiceConfig {
  codebuddyApiKey: string;
  llmModel: string;
  siliconflowApiKey?: string;
  workersApiUrl: string;
  internalApiSecret: string;
  port: number;
}

export function loadConfig(): ServiceConfig {
  const required = (key: string): string => {
    const value = process.env[key];
    if (!value) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
  };

  return {
    codebuddyApiKey: required('CODEBUDDY_API_KEY'),
    llmModel: process.env.LLM_MODEL || 'deepseek-v3.1',
    siliconflowApiKey: process.env.SILICONFLOW_API_KEY,
    workersApiUrl: required('WORKERS_API_URL'),
    internalApiSecret: required('INTERNAL_API_SECRET'),
    port: parseInt(process.env.PORT || '3001', 10),
  };
}
