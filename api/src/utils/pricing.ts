/**
 * Upstream API cost model.
 *
 * AIMake's only metered upstream cost is TTS synthesis (SiliconFlow), billed in
 * proportion to synthesized audio length. We therefore estimate cost from output
 * duration in seconds. `TTS_USD_PER_AUDIO_MINUTE` is an estimate — tune it to
 * match the actual provider invoice.
 */
export const TTS_USD_PER_AUDIO_MINUTE = 0.012;

/** Estimated upstream USD cost for `durationSeconds` of synthesized audio. */
export function estimateApiCost(durationSeconds: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0;
  const usd = (durationSeconds / 60) * TTS_USD_PER_AUDIO_MINUTE;
  return Math.round(usd * 1e6) / 1e6; // round to micro-dollar
}
