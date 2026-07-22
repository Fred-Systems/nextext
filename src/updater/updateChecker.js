const GITHUB_REPO = "Fred-Systems/nextext";
const GITHUB_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
const LAST_SEEN_KEY = "nextext_last_seen_release";
const APP_VERSION = "1.0.0";

function compareVersions(a, b) {
  const pa = a.replace(/^v/, "").split(".").map(Number);
  const pb = b.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

export function getCurrentVersion() {
  return APP_VERSION;
}

export async function checkForUpdate() {
  const currentVersion = getCurrentVersion();
  try {
    const res = await fetch(GITHUB_API, {
      headers: { Accept: "application/vnd.github.v3+json" },
    });
    if (!res.ok) return null;
    const release = await res.json();
    const tag = release.tag_name || "";
    const latestVersion = tag.replace(/^v/i, "");
    if (!latestVersion || compareVersions(latestVersion, currentVersion) <= 0) {
      return null;
    }
    const apkAsset = (release.assets || []).find(
      (a) => a.name && a.name.endsWith(".apk")
    );
    return {
      version: latestVersion,
      name: release.name || `Version ${latestVersion}`,
      body: release.body || "No changelog provided.",
      downloadUrl: apkAsset ? apkAsset.browser_download_url : null,
      releaseUrl: release.html_url,
    };
  } catch (e) {
    console.error("[updater] checkForUpdate failed:", e);
    return null;
  }
}

export function openDownloadUrl(url) {
  if (url) {
    window.open(url, "_system");
  }
}

export function getLastSeenRelease() {
  try {
    return localStorage.getItem(LAST_SEEN_KEY);
  } catch {
    return null;
  }
}

export function setLastSeenRelease(version) {
  try {
    localStorage.setItem(LAST_SEEN_KEY, version);
  } catch { /* silent */ }
}
