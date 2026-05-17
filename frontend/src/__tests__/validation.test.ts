import { describe, it, expect } from 'vitest';
import { validateCreateJobInput, MAX_TEXT_LENGTH } from '../lib/validation';
import { parseScript } from '../lib/utils';

describe('validateCreateJobInput', () => {
  it('returns not ok with "请输入内容" for empty content', () => {
    const result = validateCreateJobInput({ sourceType: 'text', sourceContent: '', voiceCount: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe('请输入内容');
  });

  it('returns not ok with "请输入内容" for whitespace-only content', () => {
    const result = validateCreateJobInput({
      sourceType: 'text',
      sourceContent: '   ',
      voiceCount: 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe('请输入内容');
  });

  it('returns not ok with "请输入有效的 URL" for invalid url', () => {
    const result = validateCreateJobInput({
      sourceType: 'url',
      sourceContent: 'not-a-url',
      voiceCount: 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe('请输入有效的 URL');
  });

  it('returns ok for a valid url', () => {
    const result = validateCreateJobInput({
      sourceType: 'url',
      sourceContent: 'https://example.com/article',
      voiceCount: 1,
    });
    expect(result.ok).toBe(true);
  });

  it('returns not ok when text content exceeds MAX_TEXT_LENGTH', () => {
    const longText = 'a'.repeat(MAX_TEXT_LENGTH + 1);
    const result = validateCreateJobInput({
      sourceType: 'text',
      sourceContent: longText,
      voiceCount: 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('字');
  });

  it('returns not ok with "请选择音色" when voiceCount is 0', () => {
    const result = validateCreateJobInput({
      sourceType: 'text',
      sourceContent: 'some content',
      voiceCount: 0,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe('请选择音色');
  });

  it('returns ok for fully valid input', () => {
    const result = validateCreateJobInput({
      sourceType: 'text',
      sourceContent: 'some content',
      voiceCount: 1,
    });
    expect(result).toEqual({ ok: true });
  });
});

describe('parseScript', () => {
  it('returns null for null input', () => {
    expect(parseScript(null)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseScript('')).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    expect(parseScript('{bad')).toBeNull();
  });

  it('returns null for JSON "null"', () => {
    expect(parseScript('null')).toBeNull();
  });

  it('returns null for JSON number "123"', () => {
    expect(parseScript('123')).toBeNull();
  });

  it('returns null for an object without segments', () => {
    expect(parseScript('{}')).toBeNull();
  });

  it('returns an object with segments array for valid script JSON', () => {
    const scriptJson = '{"title":"T","segments":[],"estimatedDuration":0}';
    const result = parseScript(scriptJson);
    expect(result).not.toBeNull();
    expect(Array.isArray(result?.segments)).toBe(true);
  });
});
