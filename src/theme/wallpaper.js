// Custom chat wallpapers -- stored locally (localStorage) for now since real
// media storage (Supabase) isn't wired up yet. Once Supabase is connected,
// this can be swapped to sync across devices instead of being per-device.
// Keys: "nextext_wallpaper_global" (applies everywhere by default) and
// "nextext_wallpaper_chat_{chatId}" (overrides for one specific chat).
import { compressImage } from "../media/mediaCompression";

export function getWallpaperForChat(chatId) {
  const perChat = localStorage.getItem(`nextext_wallpaper_chat_${chatId}`);
  if (perChat) return perChat;
  return localStorage.getItem("nextext_wallpaper_global") || null;
}

export function setWallpaperForChat(chatId, dataUrl) {
  if (dataUrl) localStorage.setItem(`nextext_wallpaper_chat_${chatId}`, dataUrl);
  else localStorage.removeItem(`nextext_wallpaper_chat_${chatId}`);
}

export function setGlobalWallpaper(dataUrl) {
  if (dataUrl) localStorage.setItem("nextext_wallpaper_global", dataUrl);
  else localStorage.removeItem("nextext_wallpaper_global");
}

export function clearChatWallpaperOverride(chatId) {
  localStorage.removeItem(`nextext_wallpaper_chat_${chatId}`);
}

// Compresses the image first (reusing the same 1080p/JPEG/80% pipeline used
// for message photos) then reads it into a data URL -- keeps wallpapers
// well under localStorage's typical ~5-10MB per-origin limit.
export async function fileToWallpaperDataUrl(file) {
  const compressed = await compressImage(file);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(compressed);
  });
}
