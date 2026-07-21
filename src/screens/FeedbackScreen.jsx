import React, { useState } from "react";
import { ChevronLeft, MessageSquare, Check } from "lucide-react";
import { useTheme } from "../theme/ThemeContext";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase/config";

export default function FeedbackScreen({ myUid, myUsername, onBack }) {
  const { t } = useTheme();
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    try {
      await addDoc(collection(db, "feedback"), {
        fromUid: myUid,
        fromUsername: myUsername || "unknown",
        message: text.trim(),
        createdAt: serverTimestamp(),
        status: "new",
      });
      setSent(true);
    } catch (e) {
      setError("Couldn't send: " + e.message);
    }
  };

  if (sent) {
    return (
      <div style={{ position: "absolute", inset: 0, background: t.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 40, padding: 30, textAlign: "center" }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", background: t.primaryLight, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}><Check size={30} color={t.primary} /></div>
        <div style={{ fontWeight: 700, fontSize: 17, color: t.text, marginBottom: 6 }}>Feedback sent</div>
        <button onClick={onBack} style={{ padding: "11px 24px", borderRadius: 10, border: "none", background: t.primary, color: t.bubbleMeText, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Done</button>
      </div>
    );
  }

  return (
    <div style={{ position: "absolute", inset: 0, background: t.bg, display: "flex", flexDirection: "column", zIndex: 40 }}>
      <div style={{ display: "flex", alignItems: "center", padding: "16px", gap: 12, background: t.primary }}>
        <ChevronLeft size={22} color="#fff" onClick={onBack} style={{ cursor: "pointer" }} />
        <MessageSquare size={18} color="#fff" />
        <span style={{ color: "#fff", fontWeight: 700, fontSize: 17 }}>Send Feedback</span>
      </div>
      <div style={{ flex: 1, padding: "18px 16px" }}>
        {error && <div style={{ color: "#FF3B30", fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Type your feedback…" rows={8} style={{ width: "100%", padding: 14, borderRadius: 12, border: `1px solid ${t.border}`, fontSize: 14.5, boxSizing: "border-box", resize: "none", fontFamily: "inherit" }} />
      </div>
      <div style={{ padding: 16 }}>
        <button disabled={!text.trim()} onClick={submit} style={{ width: "100%", padding: "13px", borderRadius: 12, border: "none", background: text.trim() ? t.primary : t.border, color: text.trim() ? t.bubbleMeText : t.textMuted, fontWeight: 700, fontSize: 15, cursor: text.trim() ? "pointer" : "not-allowed" }}>
          Send to Admin
        </button>
      </div>
    </div>
  );
}
