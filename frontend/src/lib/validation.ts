import type { SourceType } from '@/types';

export const MAX_TEXT_LENGTH = 100000;

export interface CreateJobValidationInput {
  sourceType: SourceType;
  sourceContent: string;
  voiceCount: number;
}

export type ValidationResult = { ok: true } | { ok: false; message: string };

/** Validate CreatePage form input before submitting a job. Pure and testable. */
export function validateCreateJobInput(input: CreateJobValidationInput): ValidationResult {
  const { sourceType, sourceContent, voiceCount } = input;
  if (!sourceContent.trim()) return { ok: false, message: '请输入内容' };
  if (sourceType === 'url') {
    try {
      new URL(sourceContent.trim());
    } catch {
      return { ok: false, message: '请输入有效的 URL' };
    }
  }
  if (sourceType === 'text' && sourceContent.length > MAX_TEXT_LENGTH) {
    return { ok: false, message: `文本不能超过 ${MAX_TEXT_LENGTH.toLocaleString()} 字` };
  }
  if (voiceCount === 0) return { ok: false, message: '请选择音色' };
  return { ok: true };
}
