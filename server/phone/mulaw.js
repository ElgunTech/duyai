/** G.711 μ-law helpers: phone audio is 8 kHz, 8-bit μ-law. */

const BIAS = 0x84;
const CLIP = 32635;

/** Encodes one 16-bit linear PCM sample to a μ-law byte. */
export function linearToMulaw(sample) {
  const sign = sample < 0 ? 0x80 : 0;
  let magnitude = Math.min(Math.abs(sample), CLIP) + BIAS;
  let exponent = 7;
  for (let mask = 0x4000; (magnitude & mask) === 0 && exponent > 0; mask >>= 1) exponent--;
  const mantissa = (magnitude >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

/** Three short high beeps (the scam warning) as 8 kHz μ-law. */
export function alertBeepMulaw() {
  const rate = 8000;
  const beep = 0.12;
  const gap = 0.06;
  const samples = Math.floor(rate * (3 * beep + 2 * gap));
  const out = Buffer.alloc(samples);
  for (let i = 0; i < samples; i++) {
    const t = i / rate;
    const local = t % (beep + gap);
    const on = local < beep;
    const envelope = on ? Math.min(1, local * 60, (beep - local) * 60) : 0;
    out[i] = linearToMulaw(Math.sin(2 * Math.PI * 1320 * t) * 0.4 * envelope * 32767);
  }
  return out;
}
