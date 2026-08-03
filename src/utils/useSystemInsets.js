import { useEffect, useState } from "react";
import { getSystemInsets } from "./systemInsets";

export function useSystemInsets() {
  const [insets, setInsets] = useState({ top: 0, bottom: 0 });
  useEffect(() => {
    let mounted = true;
    getSystemInsets()
      .then((i) => {
        if (!mounted) return;
        setInsets({ top: i.top || 0, bottom: i.bottom || 0 });
        // Expose as CSS vars so any inline style can use them (e.g. padding:
        // calc(... + var(--safe-bottom))) without plumbing the value everywhere.
        const root = document.documentElement;
        root.style.setProperty("--safe-top", `${i.top || 0}px`);
        root.style.setProperty("--safe-bottom", `${i.bottom || 0}px`);
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);
  return insets;
}
