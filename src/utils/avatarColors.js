// Deterministic background color for letter avatars based on a simple hash of
// the UID. 20 dark, rich tones matching WhatsApp's modern dark avatar palette.
const AVATAR_COLORS = [
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

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function getAvatarColor(uid) {
  return AVATAR_COLORS[hashCode(uid || "") % AVATAR_COLORS.length];
}

export function getAvatarInitial(name) {
  if (!name) return "?";
  return name.charAt(0).toUpperCase();
}
