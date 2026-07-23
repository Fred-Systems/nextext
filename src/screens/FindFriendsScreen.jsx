import React, { useState } from "react";
import { ChevronLeft, Users, Smartphone } from "lucide-react";
import { useTheme } from "../theme/ThemeContext";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../firebase/config";
import { sendContactRequest } from "../firebase/contacts";

// Real device contact matching (checking your phone's whole address book in
// the background) is a native-app capability -- it needs Android's Contacts
// permission, which a plain web page cannot request. The Contact Picker API
// (used below) is the closest web equivalent: supported on Chrome for
// Android only (not desktop Chrome, not Chromebook, not Safari/Firefox), and
// it's a manual one-at-a-time picker rather than bulk background access --
// you choose which contacts to check, nothing is read without you picking it.
// Once this app is packaged for Android via Capacitor, swapping in the
// native Contacts plugin would give true bulk matching -- noted as a
// follow-up, not built here.
export default function FindFriendsScreen({ myUid, onBack, onStartChat }) {
  const { t } = useTheme();
  const [supported] = useState(!!(navigator.contacts && navigator.contacts.select));
  const [matches, setMatches] = useState([]);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState([]);

  const pickAndMatch = async () => {
    setError("");
    setBusy(true);
    try {
      const props = ["tel"];
      const opts = { multiple: true };
      const contacts = await navigator.contacts.select(props, opts);
      const numbers = contacts.flatMap((c) => c.tel || []).map(normalizePhone).filter(Boolean);
      if (numbers.length === 0) {
        setMatches([]);
        setChecked(true);
        setBusy(false);
        return;
      }
      // Firestore 'in' queries cap at 30 values -- batch if more.
      const batches = [];
      for (let i = 0; i < numbers.length; i += 30) batches.push(numbers.slice(i, i + 30));
      const found = [];
      for (const batch of batches) {
        const q = query(collection(db, "users"), where("phoneNumberNormalized", "in", batch));
        const snap = await getDocs(q);
        snap.forEach((d) => { if (d.id !== myUid) found.push({ uid: d.id, ...d.data() }); });
      }
      setMatches(found);
      setChecked(true);
    } catch (e) {
      if (e.name !== "AbortError") setError("Couldn't check contacts: " + e.message);
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
        {!supported ? (
          <div style={{ textAlign: "center", padding: 30 }}>
            <Smartphone size={36} color={t.textMuted} style={{ marginBottom: 14 }} />
            <div style={{ fontWeight: 700, fontSize: 16, color: t.text, marginBottom: 8 }}>Not available on this device</div>
            <div style={{ fontSize: 13, color: t.textMuted, lineHeight: 1.6 }}>
              Checking contacts currently works on Chrome for Android. Support for
              other browsers and devices (including a fuller version once this app
              is packaged for Android) is planned.
            </div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 13, color: t.textMuted, marginBottom: 16, lineHeight: 1.5 }}>
              Pick contacts from your phone to check which ones are already using
              NexText. Nothing is read in the background — you choose exactly which
              contacts to check each time.
            </div>
            {error && <div style={{ color: "#FF3B30", fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
            <button onClick={pickAndMatch} disabled={busy} style={{ width: "100%", padding: 13, borderRadius: 12, border: "none", background: t.primary, color: t.bubbleMeText, fontWeight: 700, fontSize: 15, cursor: "pointer", marginBottom: 20 }}>
              {busy ? "Checking…" : "Choose contacts to check"}
            </button>

            {checked && matches.length === 0 && (
              <div style={{ textAlign: "center", color: t.textMuted, fontSize: 13, padding: 20 }}>None of those contacts are on NexText yet.</div>
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
          </>
        )}
      </div>
    </div>
  );
}

function normalizePhone(raw) {
  const digits = raw.replace(/[^\d+]/g, "");
  return digits.length >= 7 ? digits : null;
}
