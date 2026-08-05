// Voice-note completion chimes, generated with the Web Audio API so no audio
// assets ship with the app. "classic" is the two-tone default.

export const PING_SOUNDS = [
  { id: "classic", label: "Classic chime" },
  { id: "crystal", label: "Crystal bell" },
  { id: "soft", label: "Soft pop" },
  { id: "retro", label: "Retro beep" },
  { id: "bubble", label: "Bubble" },
  { id: "ding", label: "Ding" },
  { id: "triple", label: "Triple tone" },
];

const PATTERNS = {
  classic: [[880, 0, 0.13, 0.14], [1318.5, 0.1, 0.2, 0.14]],
  crystal: [[1046.5, 0, 0.18, 0.11], [1568, 0.12, 0.32, 0.09]],
  soft: [[523.25, 0, 0.16, 0.07]],
  retro: [[440, 0, 0.1, 0.13], [440, 0.12, 0.1, 0.13]],
  bubble: [[659.25, 0, 0.09, 0.12], [987.77, 0.09, 0.16, 0.11]],
  ding: [[1174.66, 0, 0.45, 0.09]],
  triple: [[784, 0, 0.08, 0.1], [1046.5, 0.09, 0.08, 0.1], [1318.5, 0.18, 0.22, 0.1]],
};

let pingCtx = null;

export function getPingSoundId() {
  try { return localStorage.getItem("nextext_voice_ping_sound") || "classic"; } catch { return "classic"; }
}

function tone(ac, freq, start, dur, gain) {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.025);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g);
  g.connect(ac.destination);
  osc.start(start);
  osc.stop(start + dur + 0.05);
}

export function playVoicePing() {
  try {
    if (localStorage.getItem("nextext_voice_pings") === "off") return;
    pingCtx = pingCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (pingCtx.state === "suspended") pingCtx.resume().catch(() => {});
    const now = pingCtx.currentTime;
    const id = getPingSoundId();
    (PATTERNS[id] || PATTERNS.classic).forEach(([freq, offset, dur, gain]) => tone(pingCtx, freq, now + offset, dur, gain));
  } catch { /* ping is best-effort */ }
}
