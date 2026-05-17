/**
 * AIMake Database Schema — Universal Jobs Model
 * Database: Cloudflare D1 (SQLite)
 * ORM: Drizzle
 *
 * Merged tts_jobs + podcasts + audios → unified `jobs` table
 */

import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';

// ============ Users 用户表 ============
export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    clerkId: text('clerk_id').notNull().unique(),
    email: text('email').notNull().unique(),
    name: text('name'),
    avatarUrl: text('avatar_url'),

    plan: text('plan', { enum: ['free', 'pro', 'team'] })
      .notNull()
      .default('free'),
    quotaLimit: integer('quota_limit').notNull().default(600),
    quotaUsed: integer('quota_used').notNull().default(0),
    quotaResetAt: text('quota_reset_at'),

    stripeCustomerId: text('stripe_customer_id'),

    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    clerkIdIdx: index('idx_users_clerk_id').on(table.clerkId),
    emailIdx: index('idx_users_email').on(table.email),
  })
);

// ============ Voices 音色表 ============
export const voices = sqliteTable('voices', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  nameZh: text('name_zh'),
  provider: text('provider', {
    enum: ['siliconflow'],
  }).notNull(),

  gender: text('gender', { enum: ['male', 'female', 'neutral'] }),
  language: text('language').default('zh-CN'),
  style: text('style'),
  description: text('description'),

  previewUrl: text('preview_url'),
  avatarUrl: text('avatar_url'),

  isPremium: integer('is_premium', { mode: 'boolean' }).notNull().default(false),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),

  sortOrder: integer('sort_order').default(0),

  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

// ============ Jobs 统一任务表 ============
export const jobs = sqliteTable(
  'jobs',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    title: text('title'),
    contentType: text('content_type', {
      enum: ['podcast', 'audiobook', 'voiceover', 'education', 'tts'],
    }).notNull(),
    sourceType: text('source_type', {
      enum: ['text', 'url'],
    }).notNull(),
    sourceContent: text('source_content').notNull(),
    sourceMimeType: text('source_mime_type'),

    // JSON settings: {duration, style, language, voices}
    settings: text('settings').notNull().default('{}'),

    // Generated script (JSON)
    script: text('script'),

    // Agent auto-detection result
    detectedContentType: text('detected_content_type'),

    // Output
    audioUrl: text('audio_url'),
    audioFormat: text('audio_format').default('mp3'),
    duration: real('duration'),
    fileSize: integer('file_size'),

    // Status tracking
    status: text('status', {
      enum: [
        'pending',
        'classifying',
        'extracting',
        'analyzing',
        'scripting',
        'synthesizing',
        'assembling',
        'completed',
        'failed',
      ],
    })
      .notNull()
      .default('pending'),
    progress: integer('progress').default(0),
    currentStage: text('current_stage'),

    // Error info
    errorCode: text('error_code'),
    errorMessage: text('error_message'),

    // Flags
    isDeleted: integer('is_deleted', { mode: 'boolean' }).default(false),
    isQuickTts: integer('is_quick_tts', { mode: 'boolean' }).default(false),

    // SSE stream token
    streamToken: text('stream_token'),

    // Timestamps
    startedAt: text('started_at'),
    completedAt: text('completed_at'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    userIdIdx: index('idx_jobs_user_id').on(table.userId),
    statusIdx: index('idx_jobs_status').on(table.status),
    contentTypeIdx: index('idx_jobs_content_type').on(table.contentType),
    createdAtIdx: index('idx_jobs_created_at').on(table.createdAt),
  })
);

// ============ Subscriptions 订阅表 ============
export const subscriptions = sqliteTable(
  'subscriptions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),

    plan: text('plan', { enum: ['pro', 'team'] }).notNull(),
    status: text('status', { enum: ['active', 'canceled', 'past_due', 'expired'] }).notNull(),

    stripeSubscriptionId: text('stripe_subscription_id'),
    stripePriceId: text('stripe_price_id'),

    currentPeriodStart: text('current_period_start'),
    currentPeriodEnd: text('current_period_end'),
    cancelAt: text('cancel_at'),
    canceledAt: text('canceled_at'),

    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    userIdIdx: index('idx_subscriptions_user_id').on(table.userId),
  })
);

// ============ Usage Logs 用量日志表 ============
export const usageLogs = sqliteTable(
  'usage_logs',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    type: text('type', {
      enum: ['tts', 'podcast', 'audiobook', 'voiceover', 'education'],
    }).notNull(),
    charsUsed: integer('chars_used').notNull(),
    durationUsed: real('duration_used').notNull(),

    jobId: text('job_id').references(() => jobs.id),

    provider: text('provider'),
    apiCost: real('api_cost'),

    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    userIdIdx: index('idx_usage_logs_user_id').on(table.userId),
    createdAtIdx: index('idx_usage_logs_created_at').on(table.createdAt),
  })
);

// ============ Type Exports ============
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Voice = typeof voices.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;
export type UsageLog = typeof usageLogs.$inferSelect;
