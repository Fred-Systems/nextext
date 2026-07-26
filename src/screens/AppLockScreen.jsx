import React, { useState, useEffect } from "react";
import { Lock, Eye, EyeOff } from "lucide-react";
import { useTheme } from "../theme/ThemeContext";

export default function AppLockScreen({ onUnlock }) {
  const { t } = useTheme();
  const [pass, setPass] = useState("");
  const [error, setError] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const stored = localStorage.getItem("nextext_app_lock_pass") || "";

  useEffect(() => { document.getElementById("app-lock-input")?.focus(); }, []);

  const submit = () => {
    if (pass === stored) { onUnlock(); return; }
    setError(true);
    setPass("");
    setTimeout(() => setError(false), 1500);
  };

  const showBiometric = typeof window.PublicKeyCredential !== "undefined";

  const handleBiometric = async () => {
    try {
      const cred = await navigator.credentials.get({ publicKey: { challenge: new Uint8Array(32), timeout: 60000 } });
      if (cred) onUnlock();
    } catch {}
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: t.bg, zIndex: 999999, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18 }}>
      <div style={{ width: 64, height: 64, borderRadius: "50%", background: t.primaryLight, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Lock size={28} color={t.primary} />
      </div>
      <div style={{ fontWeight: 700, fontSize: 18, color: t.text }}>App locked</div>
      <div style={{ fontSize: 13, color: t.textMuted, marginBottom: 8 }}>Enter your PIN or password to continue</div>
      <div style={{ position: "relative", width: 200 }}>
        <input
          id="app-lock-input"
          type={showPass ? "text" : "password"}
          autoFocus
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Enter PIN…"
          style={{ width: "100%", padding: "12px 42px 12px 14px", borderRadius: 12, border: `1px solid ${error ? "#FF3B30" : t.border}`, fontSize: 16, textAlign: "center", letterSpacing: showPass ? 2 : 6, boxSizing: "border-box", outline: "none" }}
        />
        <div onClick={() => setShowPass(!showPass)} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", cursor: "pointer", color: t.textMuted }}>
          {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
        </div>
      </div>
      {error && <div style={{ color: "#FF3B30", fontSize: 13, fontWeight: 600 }}>Incorrect password</div>}
      <button onClick={submit} style={{ width: 200, padding: 13, borderRadius: 12, border: "none", background: t.primary, color: t.bubbleMeText, fontWeight: 700, fontSize: 15, cursor: "pointer", marginTop: 4 }}>
        Unlock
      </button>
      {showBiometric && (
        <div onClick={handleBiometric} style={{ fontSize: 13, color: t.primary, fontWeight: 600, cursor: "pointer", marginTop: 8, textDecoration: "underline" }}>
          Use biometric unlock
        </div>
      )}
    </div>
  );
}
