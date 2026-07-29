import React, { useState } from "react";
import { ChevronLeft, Users, Smartphone, RefreshCw } from "lucide-react";
import { useTheme } from "../theme/ThemeContext";
import { collection, query, where, getDocs, limit as fbLimit } from "firebase/firestore";
import { db } from "../firebase/config";
import { sendContactRequest } from "../firebase/contacts";

export default function FindFriendsScreen({ myUid, onBack, onStartChat }) {
  const { t } = useTheme();
  const [matches, setMatches] = useState([]);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState([]);

  const checkAllContacts = async () => {
    setError("");
    setBusy(true);
    try {
      const q = query(
        collection(db, "users"),
        where("phoneNumberNormalized", "!=", null),
        fbLimit(50)
      );
      const snap = await getDocs(q);
      const found = [];
      snap.forEach((d) => {
        if (d.id !== myUid) {
          found.push({ uid: d.id, ...d.data() });
        }
      });
      setMatches(found);
      setChecked(true);
    } catch (e) {
      setError("Couldn't check contacts: " + e.message);
    }
    setBusy(false);
  };

  const handleAdd = async (uid) => {
    try {
      await sendContactRequest(myUid, uid);
      setSentTo((s) => [...s, uid]);
    } catch (e) {
      setError("Couldn't send request: " + e.message);
    }
  };

  return (
    <div className="nx-screen" style={{ position: "absolute", inset: 0, background: t.bg, zIndex: 40 }}>
      <div style={{ display: "flex", alignItems: "center", padding: "16px", gap: 12, background: t.primary, flexShrink: 0 }}>
        <ChevronLeft size={22} color="#fff" onClick={onBack} style={{ cursor: "pointer" }} />
        <Users size={18} color="#fff" />
        <span style={{ color: "#fff", fontWeight: 700, fontSize: 17 }}>Find Friends</span>
      </div>
      <div className="nx-scroll" style={{ padding: 16 }}>
        <div style={{ fontSize: 13, color: t.textMuted, marginBottom: 16, lineHeight: 1.5 }}>
          Find other NexText users who have a phone number set on their profile.
        </div>
        {error && <div style={{ color: "#FF3B30", fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
        <button onClick={checkAllContacts} disabled={busy} style={{ width: "100%", padding: 13, borderRadius: 12, border: "none", background: t.primary, color: t.bubbleMeText, fontWeight: 700, fontSize: 15, cursor: busy ? "wait" : "pointer", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: busy ? 0.6 : 1 }}>
          <RefreshCw size={16} style={busy ? { animation: "nextext-spin 0.9s linear infinite" } : {}} />
          {busy ? "Checking…" : "Check all contacts"}
        </button>

        {checked && matches.length === 0 && (
          <div style={{ textAlign: "center", color: t.textMuted, fontSize: 13, padding: 20 }}>No NexText users found with phone numbers.</div>
        )}
        {matches.map((u) => (
          <div key={u.uid} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 4px", borderBottom: `1px solid ${t.border}` }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: t.primaryLight, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, color: t.primary }}>{u.displayName?.[0]}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14.5, color: t.text }}>{u.displayName}</div>
              <div style={{ fontSize: 12, color: t.textMuted }}>@{u.username}</div>
            </div>
            <button disabled={sentTo.includes(u.uid)} onClick={() => handleAdd(u.uid)} style={{ padding: "7px 14px", borderRadius: 16, border: "none", background: sentTo.includes(u.uid) ? t.border : t.primary, color: sentTo.includes(u.uid) ? t.textMuted : t.bubbleMeText, fontSize: 12.5, fontWeight: 700, cursor: sentTo.includes(u.uid) ? "default" : "pointer" }}>
              {sentTo.includes(u.uid) ? "Sent" : "Add"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
