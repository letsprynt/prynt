"use client";

// Synthesized UI sounds via Web Audio (no audio files). Tasteful chimes: ascending for buy/launch, descending
// for sell. Respects a localStorage mute flag. The AudioContext is unlocked on the first user gesture so the
// post-transaction success sounds (which fire async, outside the click) are allowed to play.
let ctx: AudioContext | null = null;
let unlocked = false;
const MUTE_KEY = "vf:muted";

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

export function unlockSound() {
  if (unlocked) return;
  unlocked = true;
  getCtx();
}

export function isMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setMuted(m: boolean) {
  try {
    localStorage.setItem(MUTE_KEY, m ? "1" : "0");
  } catch {}
  if (typeof window !== "undefined") window.dispatchEvent(new Event("vf:muted"));
  if (!m) playBuy(); // little confirmation blip when turning sound back on
}

function tone(c: AudioContext, freq: number, t0: number, dur: number, type: OscillatorType, peak: number) {
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.014);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

function arp(freqs: number[], step: number, dur: number, type: OscillatorType, peak: number) {
  if (isMuted()) return;
  const c = getCtx();
  if (!c) return;
  const t = c.currentTime + 0.01;
  freqs.forEach((f, i) => tone(c, f, t + i * step, dur, type, peak));
}

// C5 → E5 → G5 → C6 — bright, satisfying "filled" sound
export function playBuy() {
  arp([523.25, 659.25, 783.99, 1046.5], 0.058, 0.22, "triangle", 0.16);
}

// D5 → A#4 → F4 — clearly descending, mellow sine: unmistakably a "sell/down" vs the bright ascending buy.
export function playSell() {
  arp([587.33, 466.16, 349.23], 0.075, 0.28, "sine", 0.13);
}

// celebratory fanfare + a high sparkle on top — for launching a new token
export function playLaunch() {
  if (isMuted()) return;
  const c = getCtx();
  if (!c) return;
  const t = c.currentTime + 0.01;
  [392, 523.25, 659.25, 783.99].forEach((f, i) => tone(c, f, t + i * 0.05, 0.5, "triangle", 0.14));
  tone(c, 1318.5, t + 0.24, 0.42, "sine", 0.1);
}

// GRADUATION: a grander, distinct fanfare — a rising run that resolves into a held major chord + sparkle.
// Bigger than a launch (this is the moment the coin hits Uniswap), and reserved ONLY for the graduation event.
export function playGraduate() {
  if (isMuted()) return;
  const c = getCtx();
  if (!c) return;
  const t = c.currentTime + 0.01;
  // triumphant rising run
  [392, 493.88, 587.33, 698.46, 783.99].forEach((f, i) => tone(c, f, t + i * 0.06, 0.5, "triangle", 0.13));
  // held C-major chord lands after the run
  const chordT = t + 0.34;
  [523.25, 659.25, 783.99].forEach((f) => tone(c, f, chordT, 0.95, "sine", 0.1));
  // sparkle on top
  tone(c, 1567.98, t + 0.44, 0.5, "sine", 0.09);
  tone(c, 2093.0, t + 0.56, 0.42, "sine", 0.06);
}

// shiny ascending — for claiming rewards
export function playClaim() {
  arp([659.25, 880, 1174.66], 0.05, 0.3, "sine", 0.13);
}
