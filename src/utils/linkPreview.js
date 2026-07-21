// URL detection and basic metadata extraction for smart link previews.

const URL_REGEX = /https?:\/\/[^\s<>"')\]]+/i;

export function extractFirstUrl(text) {
  if (!text) return null;
  const match = text.match(URL_REGEX);
  return match ? match[0] : null;
}

// Simple cache to avoid re-fetching the same URL during a session.
const previewCache = new Map();

export async function fetchLinkPreview(url) {
  if (previewCache.has(url)) return previewCache.get(url);

  const result = { url, title: null, description: null, image: null };

  try {
    // Try to get metadata via a public oEmbed/proxy endpoint. If CORS blocks
    // it, we fall back to a bare title derived from the URL itself so the card
    // still renders *something* useful.
    const res = await fetch(
      `https://api.microlink.io?url=${encodeURIComponent(url)}&meta=true`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (res.ok) {
      const data = await res.json();
      const m = data?.data;
      if (m) {
        result.title = m.title || null;
        result.description = m.description || null;
        result.image = m.image?.url || m.logo?.url || null;
      }
    }
  } catch {
    // CORS / network / timeout — just derive a title from the domain.
  }

  if (!result.title) {
    try {
      const domain = new URL(url).hostname.replace("www.", "");
      result.title = domain;
    } catch {
      result.title = url;
    }
  }

  previewCache.set(url, result);
  return result;
}

export function isLinkPreviewEnabled() {
  return localStorage.getItem("nextext_link_previews") !== "off";
}

export function setLinkPreviewEnabled(on) {
  localStorage.setItem("nextext_link_previews", on ? "on" : "off");
}
