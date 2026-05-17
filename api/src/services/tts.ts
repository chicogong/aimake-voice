/**
 * TTS Service
 * Handles direct text-to-speech generation (quick TTS only)
 * Provider: SiliconFlow (FishAudio)
 */

import type { Env } from '../types';
import type { Database, User } from '../db';
import { users, usageLogs } from '../db';
import { eq, sql } from 'drizzle-orm';
import { generateId } from '../utils/id';
import { errors } from '../middleware/error';
import { estimateApiCost } from '../utils/pricing';

const SILICONFLOW_CONFIG = {
  baseUrl: 'https://api.siliconflow.cn/v1/audio/speech',
  model: 'fnlp/MOSS-TTSD-v0.5',
};

const CHARS_PER_SECOND = 150;

export class TTSService {
  private db: Database;
  private env: Env;

  constructor(db: Database, env: Env) {
    this.db = db;
    this.env = env;
  }

  /**
   * Generate audio directly (sync mode for quick TTS)
   */
  async generateDirect(
    user: User,
    request: {
      text: string;
      voiceId: string;
      speed?: number;
      format?: 'mp3' | 'wav';
    }
  ): Promise<ArrayBuffer> {
    const { text, voiceId, speed = 1.0, format = 'mp3' } = request;

    if (text.length > 5000) {
      throw errors.validation('文本长度不能超过 5000 字符');
    }

    const estimatedDuration = Math.ceil(text.length / CHARS_PER_SECOND);
    const remaining = user.quotaLimit - user.quotaUsed;

    if (remaining < estimatedDuration) {
      throw errors.quotaExceeded(
        `额度不足，剩余 ${remaining} 秒，预计需要 ${estimatedDuration} 秒`
      );
    }

    const audioBuffer = await this.generateSiliconFlow(text, voiceId, speed, format);

    const now = new Date().toISOString();
    await this.db
      .update(users)
      .set({
        quotaUsed: sql`${users.quotaUsed} + ${estimatedDuration}`,
        updatedAt: now,
      })
      .where(eq(users.id, user.id));

    await this.db.insert(usageLogs).values({
      id: generateId(),
      userId: user.id,
      type: 'tts',
      charsUsed: text.length,
      durationUsed: estimatedDuration,
      apiCost: estimateApiCost(estimatedDuration),
      provider: 'siliconflow',
      createdAt: now,
    });

    return audioBuffer;
  }

  private async generateSiliconFlow(
    text: string,
    voiceId: string,
    speed: number,
    format: string
  ): Promise<ArrayBuffer> {
    if (!this.env.SILICONFLOW_API_KEY) {
      throw new Error('SiliconFlow API key not configured');
    }

    const voice = voiceId.replace('sf-', '').replace('siliconflow-', '').replace('fish-', '');

    const voiceMap: Record<string, string> = {
      default: 'fnlp/MOSS-TTSD-v0.5:alex',
      alex: 'fnlp/MOSS-TTSD-v0.5:alex',
      benjamin: 'fnlp/MOSS-TTSD-v0.5:benjamin',
      charles: 'fnlp/MOSS-TTSD-v0.5:charles',
      david: 'fnlp/MOSS-TTSD-v0.5:david',
      anna: 'fnlp/MOSS-TTSD-v0.5:anna',
      bella: 'fnlp/MOSS-TTSD-v0.5:bella',
      claire: 'fnlp/MOSS-TTSD-v0.5:claire',
      diana: 'fnlp/MOSS-TTSD-v0.5:diana',
    };

    const reference = voiceMap[voice] || voiceMap['default'];

    const response = await fetch(SILICONFLOW_CONFIG.baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.env.SILICONFLOW_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: SILICONFLOW_CONFIG.model,
        input: text,
        voice: reference,
        response_format: format === 'wav' ? 'wav' : 'mp3',
        speed,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('SiliconFlow TTS error:', error);
      throw new Error(`SiliconFlow TTS error: ${response.status} ${error}`);
    }

    return response.arrayBuffer();
  }
}
