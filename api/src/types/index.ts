/**
 * AIMake API Type Definitions — Universal Jobs Model
 */

import type { User } from '../db/schema';

// ============ Environment Bindings ============
export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  R2?: R2Bucket;

  ENVIRONMENT: 'development' | 'production';
  CORS_ORIGIN: string;

  CLERK_SECRET_KEY: string;
  CLERK_PUBLISHABLE_KEY: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  CLERK_WEBHOOK_SECRET?: string;

  SILICONFLOW_API_KEY?: string;

  // Agent Service
  AGENT_SERVICE_URL?: string;
  INTERNAL_API_SECRET?: string;
}

// ============ Hono Context Variables ============
export interface Variables {
  user: User;
  requestId: string;
}

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
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'QUOTA_EXCEEDED'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'SERVICE_UNAVAILABLE'
  | 'TTS_ERROR'
  | 'PAYMENT_ERROR'
  | 'JOB_ERROR';

// ============ Pagination ============
export interface PaginationParams {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

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

export interface JobResponse {
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

export interface JobDetailResponse extends JobResponse {
  sourceContent: string;
  settings: string;
  script: string | null;
  detectedContentType: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

// ============ Quick TTS Types ============
export interface QuickTTSRequest {
  text: string;
  voiceId: string;
  speed?: number;
  format?: 'mp3' | 'wav';
}

// ============ Voice Types ============
export type VoiceProvider = 'siliconflow';

export interface VoiceInfo {
  id: string;
  name: string;
  nameZh: string | null;
  provider: VoiceProvider;
  gender: 'male' | 'female' | 'neutral' | null;
  language: string | null;
  style: string | null;
  previewUrl: string | null;
  isPremium: boolean;
  tags?: string[];
}

// ============ SSE Event Types ============
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
}

export interface SSEErrorEvent {
  type: 'error';
  code: string;
  message: string;
}

export type SSEEvent = SSEProgressEvent | SSECompleteEvent | SSEErrorEvent;

// ============ Subscription Types ============
export type Plan = 'free' | 'pro' | 'team';

export interface QuotaInfo {
  plan: Plan;
  limit: number;
  used: number;
  remaining: number;
  resetAt: string;
}

// ============ Internal Callback Types ============
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
