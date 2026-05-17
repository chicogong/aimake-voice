/**
 * Frontend Type Definitions — Universal Jobs Model
 */

// ============ API Response Types ============
export interface ApiResponse<T> {
  success: true;
  data: T;
  meta?: {
    total?: number;
    page?: number;
    pageSize?: number;
  };
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// ============ User Types ============
export interface User {
  id: string;
  clerkId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  plan: Plan;
  /** Loaded asynchronously from /api/user/quota — may be absent right after rehydrate. */
  quota?: QuotaInfo;
  createdAt: string;
}

export type Plan = 'free' | 'pro' | 'team';

export interface QuotaInfo {
  limit: number;
  used: number;
  remaining: number;
  resetAt: string;
}

// ============ Voice Types ============
export interface Voice {
  id: string;
  name: string;
  nameZh: string | null;
  provider: VoiceProvider;
  gender: 'male' | 'female' | 'neutral' | null;
  language: string[];
  style: string | null;
  previewUrl: string | null;
  isPremium: boolean;
  tags: string[];
}

export type VoiceProvider = 'siliconflow';

// ============ Content Types ============
export type ContentType = 'podcast' | 'audiobook' | 'voiceover' | 'education' | 'tts';

export type SourceType = 'text' | 'url';

export type JobStatus =
  | 'pending'
  | 'classifying'
  | 'extracting'
  | 'analyzing'
  | 'scripting'
  | 'synthesizing'
  | 'assembling'
  | 'completed'
  | 'failed';

// ============ Job Types ============
export interface Job {
  id: string;
  title: string | null;
  contentType: ContentType;
  sourceType: SourceType;
  status: JobStatus;
  progress: number;
  currentStage: string | null;
  audioUrl: string | null;
  audioFormat: string | null;
  duration: number | null;
  fileSize: number | null;
  streamToken: string | null;
  error?: {
    code: string;
    message: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface JobDetail extends Job {
  sourceContent: string;
  settings: string;
  script: string | null;
  detectedContentType: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface CreateJobRequest {
  source: {
    type: SourceType;
    content: string;
  };
  contentType: 'auto' | ContentType;
  settings: {
    duration: number;
    language?: 'zh' | 'en';
    style?: string;
    voices: Array<{ role: string; voiceId: string }>;
  };
  title?: string;
}

export interface CreateJobResponse {
  id: string;
  status: string;
  streamToken: string;
}

// ============ Quick TTS Types ============
export interface QuickTTSRequest {
  text: string;
  voiceId: string;
  speed?: number;
  format?: 'mp3' | 'wav';
}

// ============ Script Types ============
export interface GeneratedScript {
  title: string;
  segments: Array<{
    index: number;
    speaker: string;
    text: string;
    emotion?: string;
    speed?: number;
  }>;
  estimatedDuration: number;
}

// ============ SSE Types ============
export interface SSEProgressEvent {
  type: 'progress';
  status: JobStatus;
  progress: number;
  currentStage: string | null;
}

export interface SSECompleteEvent {
  type: 'complete';
  audioUrl: string;
  duration: number;
  fileSize?: number;
}

export interface SSEErrorEvent {
  type: 'error';
  code: string;
  message: string;
}

export interface SSEScriptUpdateEvent {
  type: 'script_update';
  script: string;
}

export type SSEEvent = SSEProgressEvent | SSECompleteEvent | SSEScriptUpdateEvent | SSEErrorEvent;
