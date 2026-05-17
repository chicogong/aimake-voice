import { describe, it, expect } from 'vitest';
import { estimateApiCost, TTS_USD_PER_AUDIO_MINUTE } from '../utils/pricing';

describe('estimateApiCost', () => {
  it('returns 0 for input 0', () => {
    expect(estimateApiCost(0)).toBe(0);
  });

  it('returns 0 for negative input', () => {
    expect(estimateApiCost(-10)).toBe(0);
  });

  it('returns 0 for NaN', () => {
    expect(estimateApiCost(NaN)).toBe(0);
  });

  it('returns 0 for Infinity', () => {
    expect(estimateApiCost(Infinity)).toBe(0);
  });

  it('returns TTS_USD_PER_AUDIO_MINUTE for 60 seconds', () => {
    expect(estimateApiCost(60)).toBe(TTS_USD_PER_AUDIO_MINUTE);
  });

  it('returns double the cost for 120 seconds vs 60 seconds', () => {
    expect(estimateApiCost(120)).toBe(estimateApiCost(60) * 2);
  });

  it('result is rounded to at most 6 decimal places', () => {
    const result = estimateApiCost(7);
    const asString = result.toString();
    const decimals = asString.includes('.') ? asString.split('.')[1].length : 0;
    expect(decimals).toBeLessThanOrEqual(6);
  });
});
