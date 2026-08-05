import { useEffect, useState } from "react";

// Displays any runtime error (uncaught exception or unhandled promise
// rejection) as a visible banner on screen. The app runs inside a Capacitor
// WebView on phones where there is no easy way to open a JS console, so a
// silent error previously looked like a blank page. This makes it visible so
// the cause can actually be reported instead of guessed.
export default function ErrorReporter({ children }) {
  const [errors, setErrors] = useState([]);

  useEffect(() => {
    const push = (msg) => {
      setErrors((prev) => {
        const next = [...prev, msg];
        return next.length > 5 ? next.slice(next.length - 5) : next;
      });
    };
    const onError = (event) => {
      const e = event?.error || event;
      const msg = e && (e.message || e.stack || String(e))
        || (typeof event?.message === "string" ? event.message : "Unknown error");
      push(`Uncaught: ${msg}`);
    };
    const onRejection = (event) => {
      const e = event?.reason;
      const msg = e && (e.message || e.stack || String(e)) || "Unknown rejection";
      push(`Rejected promise: ${msg}`);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return (
    <>
      {children}
      {errors.length > 0 && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 9999999, background: "#3D0A0A", borderTop: "2px solid #FF3B30", padding: 10, maxHeight: "40vh", overflowY: "auto", fontSize: 11, color: "#FFB3B3", fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
          {errors.map((err, i) => (
            <div key={i} style={{ marginBottom: 6, display: "flex", alignItems: "flex-start", gap: 8 }}>
              <span style={{ flex: 1 }}>{err}</span>
              <span
                onClick={() => setErrors((prev) => prev.filter((_, j) => j !== i))}
                style={{ color: "#fff", fontSize: 12, cursor: "pointer", flexShrink: 0, background: "rgba(255,255,255,0.15)", borderRadius: 4, padding: "0 5px" }}
              >
                ×
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
