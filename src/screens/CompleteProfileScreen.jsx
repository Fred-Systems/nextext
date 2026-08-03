import { useState } from "react";
import { useTheme } from "../theme/ThemeContext";
import { isUsernameAvailable } from "../firebase/names";

// Shown to brand-new Google sign-ins whose profile was auto-created. They
// must pick a display name + username before using the app so their avatar
// and mentions look right and there are no "Unknown" profiles floating around.
export default function CompleteProfileScreen({ auth }) {
  const { t } = useTheme();
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setError("");
    const dn = displayName.trim();
    const un = username.trim().toLowerCase();
    if (!dn) return setError("Please enter your display name.");
    if (dn.length < 2) return setError("Display name should be at least 2 characters.");
    if (!un) return setError("Please choose a username.");
    if (!/^[a-z0-9_.]+$/.test(un)) return setError("Username can only contain lowercase letters, numbers, dots, and underscores.");
    setSaving(true);
    try {
      if (!(await isUsernameAvailable(un, auth.user?.uid))) {
        setError("That username is already taken. Try another.");
        setSaving(false);
        return;
      }
      await auth.completeProfile(dn, un, phone.trim() || null);
    } catch (e) {
      setError(e.message || "Couldn't finish setting up your profile. Try again.");
      setSaving(false);
    }
  };

  return (
    <div className="nx-screen" style={{ position: "absolute", inset: 0, background: t.bg, display: "flex", flexDirection: "column", zIndex: 70 }}>
      <div style={{ flex: 1, overflowY: "auto", padding: "calc(24px + var(--safe-top)) 20px 24px", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
          <img src="./icon.png" alt="" style={{ width: 72, height: 72, objectFit: "contain" }} onError={(e) => { e.target.style.display = "none"; }} />
        </div>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ color: t.text, fontWeight: 800, fontSize: 20 }}>Almost there</div>
          <div style={{ color: t.textMuted, fontSize: 13.5, marginTop: 6, lineHeight: 1.5 }}>
            You signed in with Google, but we still need a couple of details to finish setting up your account.
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 6 }}>Display name</div>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. Alex Smith"
            autoFocus
            style={{ width: "100%", boxSizing: "border-box", padding: "11px 12px", borderRadius: 10, border: `1px solid ${t.border}`, fontSize: 14, color: t.text, background: t.surface }}
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 6 }}>Username</div>
          <div style={{ display: "flex", alignItems: "center", border: `1px solid ${t.border}`, borderRadius: 10, overflow: "hidden", background: t.surface }}>
            <span style={{ color: t.textMuted, fontSize: 14, paddingLeft: 12 }}>&#64;</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_.]/g, "").toLowerCase())}
              placeholder="alexsmith"
              style={{ flex: 1, border: "none", outline: "none", background: "transparent", padding: "11px 12px 11px 4px", fontSize: 14, color: t.text }}
            />
          </div>
          <div style={{ fontSize: 12, color: t.textMuted, marginTop: 5 }}>How people find and mention you. You can change this later.</div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: t.text, marginBottom: 6 }}>Phone (optional)</div>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            placeholder="+1 555 123 4567"
            style={{ width: "100%", boxSizing: "border-box", padding: "11px 12px", borderRadius: 10, border: `1px solid ${t.border}`, fontSize: 14, color: t.text, background: t.surface }}
          />
          <div style={{ fontSize: 12, color: t.textMuted, marginTop: 5 }}>Helps friends find you by their contacts. Leave blank if unsure.</div>
        </div>

        {error && <div style={{ color: "#FF3B30", fontSize: 13, marginBottom: 12 }}>{error}</div>}

        <button
          onClick={submit}
          disabled={saving}
          style={{ width: "100%", padding: "13px", borderRadius: 12, border: "none", background: t.primary, color: t.bubbleMeText, fontWeight: 700, fontSize: 15, cursor: "pointer" }}
        >
          {saving ? "Setting up…" : "Continue"}
        </button>

        <div onClick={() => auth.logOut()} style={{ textAlign: "center", marginTop: 16, color: t.textMuted, fontSize: 13, cursor: "pointer" }}>
          Not you? Sign out and use a different account
        </div>
      </div>
    </div>
  );
}
