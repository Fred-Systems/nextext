// Deterministic background color for letter avatars based on a simple hash of
// the UID. 20 dark, rich tones matching WhatsApp's modern dark avatar palette.
export const AVATAR_COLORS = [
  "#00897B", // deep teal
  "#5C6BC0", // dark indigo
  "#43A047", // forest green
  "#8E24AA", // muted plum
  "#C62828", // deep burgundy
  "#039BE5", // steel blue
  "#6D4C41", // dark brown
  "#7CB342", // olive green
  "#D81B60", // dark rose
  "#5E35B1", // deep purple
  "#00ACC1", // dark cyan
  "#F4511E", // burnt orange
  "#3949AB", // slate blue
  "#2E7D32", // emerald
  "#AD1457", // wine
  "#1E88E5", // royal blue
  "#8D6E63", // cocoa
  "#00838F", // dark teal
  "#6A1B9A", // plum
  "#C0CA33", // dark lime
];

const OVERRIDE_KEY = "nextext_avatar_overrides";

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function readOverrides() {
  try {
    const raw = localStorage.getItem(OVERRIDE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function writeOverrides(map) {
  try {
    localStorage.setItem(OVERRIDE_KEY, JSON.stringify(map));
  } catch { /* storage may be unavailable */ }
}

// Per-uid avatar customization. Both fields are optional; null means "follow
// the deterministic default".
export function getAvatarOverride(uid) {
  if (!uid) return null;
  const overrides = readOverrides();
  const entry = overrides[uid];
  if (!entry) return null;
  return { color: entry.color || null, style: entry.style || null };
}

export function setAvatarOverride(uid, { color = null, style = null } = {}) {
  if (!uid) return;
  const overrides = readOverrides();
  const existing = overrides[uid] || {};
  const next = { ...existing, color: color || null, style: style || null };
  if (!next.color && !next.style) delete overrides[uid];
  else overrides[uid] = next;
  writeOverrides(overrides);
}

export function getAvatarColor(uid) {
  const override = getAvatarOverride(uid);
  if (override?.color) return override.color;
  return AVATAR_COLORS[hashCode(uid || "") % AVATAR_COLORS.length];
}

export function getAvatarStyle(uid) {
  const override = getAvatarOverride(uid);
  return override?.style || "solid";
}

// Lighten a "#RRGGBB" hex by mixing with white (amt 0..1).
export function lightenColor(hex, amt) {
  const clean = String(hex || "").replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return hex;
  const num = parseInt(clean, 16);
  const r = Math.min(255, ((num >> 16) & 255) + Math.round((255 - ((num >> 16) & 255)) * amt));
  const g = Math.min(255, ((num >> 8) & 255) + Math.round((255 - ((num >> 8) & 255)) * amt));
  const b = Math.min(255, (num & 255) + Math.round((255 - (num & 255)) * amt));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

export function getAvatarInitial(name) {
  if (!name) return "?";
  // Array.from is surrogate-pair safe: names that start with an emoji (like
  // "👥") must not be split into a lone high surrogate, which renders as the
  // broken "�" glyph.
  const chars = Array.from(String(name).trim());
  if (chars.length === 0) return "?";
  return chars[0].toUpperCase();
}
