import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ThemeProvider, useTheme, themes, ROTATE_INTERVALS } from "./theme/ThemeContext";
import { useAuth } from "./firebase/useAuth";
import { usePresenceHeartbeat } from "./firebase/presence";
import { purgeExpiredStatuses, useStatuses } from "./firebase/status";
import { useContacts } from "./firebase/contacts";
import { useChats } from "./firebase/chats";
import { setGlobalWallpaper, fileToWallpaperDataUrl } from "./theme/wallpaper";
import { ChevronLeft, Palette, Shield, Lock, MessageSquare, X, ShieldCheck, Phone, Image as ImageIcon, Users, CircleDot, RotateCcw, Camera, Settings as SettingsIcon, Bot, Sparkles, RefreshCw, Search } from "lucide-react";
import { FONTS } from "./theme/ThemeContext";
import Avatar from "./components/Avatar";
import { uploadChatFile } from "./supabase/media";
import { doc, updateDoc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase/config";
import AuthScreen from "./screens/AuthScreen";
import ChatListScreen from "./screens/ChatListScreen";
import ConversationScreen from "./screens/ConversationScreen";
import PrivacyScreen from "./screens/PrivacyScreen";
import ParentalControlsScreen from "./screens/ParentalControlsScreen";
import FeedbackScreen from "./screens/FeedbackScreen";
import ContactProfileScreen from "./screens/ContactProfileScreen";
import AdminDashboard from "./screens/AdminDashboard";
import AIChatScreen from "./screens/AIChatScreen";
import AISidebarWidget from "./components/AISidebarWidget";
import { useSystemConfigHook, requestAIAccess, setAIPersonality, PERSONALITIES } from "./firebase/ai";
import AppLockScreen from "./screens/AppLockScreen";
import StatusScreen from "./screens/StatusScreen";
import GroupInfoScreen from "./screens/GroupInfoScreen";
import { initNotifications } from "./firebase/notifications";
import UpdatePrompt from "./components/UpdatePrompt";
import { checkForUpdate, openDownloadUrl, setLastSeenRelease } from "./updater/updateChecker";
import { updateGlobalSettings, useGlobalSettings } from "./firebase/config-settings";

const UI_SCALE_KEY = "nextext_ui_scale";
const SCROLL_DOWN_KEY = "nextext_show_scrolldown";

function ThemeSheet({ current, onSelect, onClose }) {
  const { t, customTheme, setCustomThemeColors, rotateDays, setRotateDays } = useTheme();
  const [tab, setTab] = useState("presets");
  const base = customTheme || t;
  const [colors, setColors] = useState({
    primary: base.primary, bg: base.bg, surface: base.surface, bubbleMe: base.bubbleMe,
    bubbleMeText: base.bubbleMeText, bubbleThem: base.bubbleThem, bubbleThemText: base.bubbleThemText,
    text: base.text, accent: base.accent,
  });

  const ColorRow = ({ label, field }) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0" }}>
      <span style={{ fontSize: 13.5, color: t.text }}>{label}</span>
      <input type="color" value={colors[field]} onChange={(e) => setColors((c) => ({ ...c, [field]: e.target.value }))} style={{ width: 40, height: 30, border: "none", borderRadius: 6, cursor: "pointer" }} />
    </div>
  );

  return (
    <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 50, display: "flex", alignItems: "flex-end" }} onClick={onClose}>
      <div style={{ background: t.surface, width: "100%", borderRadius: "20px 20px 0 0", padding: 20, maxHeight: "78%", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
          <h3 style={{ margin: 0, color: t.text, fontSize: 18 }}>Theme</h3>
          <X size={20} color={t.textMuted} onClick={onClose} style={{ cursor: "pointer" }} />
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {[["presets", "Presets"], ["custom", "Custom colors"], ["rotate", "Auto-switch"]].map(([key, label]) => (
            <div key={key} onClick={() => setTab(key)} style={{ padding: "6px 14px", borderRadius: 16, background: tab === key ? t.primary : t.primaryLight, color: tab === key ? t.bubbleMeText : t.primary, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>{label}</div>
          ))}
        </div>

        {tab === "presets" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {Object.entries(themes).map(([key, th]) => (
              <div key={key} onClick={() => onSelect(key)} style={{ border: `2px solid ${current === key ? t.primary : t.border}`, borderRadius: 14, padding: 12, cursor: "pointer", background: th.bg }}>
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
                  <div style={{ background: th.bubbleMe, color: th.bubbleMeText, fontSize: 10, padding: "4px 8px", borderRadius: 8 }}>Hey!</div>
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: th.text }}>{th.name}</div>
              </div>
            ))}
          </div>
        )}

        {tab === "custom" && (
          <div>
            <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 10 }}>Pick your own colors for everything.</div>
            <ColorRow label="Primary / header" field="primary" />
            <ColorRow label="Accent" field="accent" />
            <ColorRow label="Background" field="bg" />
            <ColorRow label="Surface (cards, bars)" field="surface" />
            <ColorRow label="Your message bubbles" field="bubbleMe" />
            <ColorRow label="Your message text" field="bubbleMeText" />
            <ColorRow label="Their message bubbles" field="bubbleThem" />
            <ColorRow label="Their message text" field="bubbleThemText" />
            <ColorRow label="Regular text" field="text" />
            <button onClick={() => { setCustomThemeColors({ ...colors, primaryLight: colors.primary + "22", textMuted: colors.text + "99", border: colors.surface === colors.bg ? colors.text + "22" : colors.bg }); onSelect("custom"); }} style={{ width: "100%", padding: 13, borderRadius: 12, border: "none", background: t.primary, color: t.bubbleMeText, fontWeight: 700, fontSize: 15, cursor: "pointer", marginTop: 14 }}>
              Apply custom theme
            </button>
          </div>
        )}

        {tab === "rotate" && (
          <div>
            <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 14, lineHeight: 1.5 }}>
              Automatically switch to a random theme on this schedule.
            </div>
            {ROTATE_INTERVALS.map((opt) => (
              <div key={opt.label} onClick={() => setRotateDays(opt.days)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 4px", cursor: "pointer" }}>
                <div style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${t.primary}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {rotateDays === opt.days && <div style={{ width: 10, height: 10, borderRadius: "50%", background: t.primary }} />}
                </div>
                <span style={{ fontSize: 14, color: t.text }}>{opt.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function formatPhoneInput(raw) {
  // Keeps a leading "+" if present, strips everything else non-numeric, then
  // groups digits with spaces for readability as the user types. Not
  // country-specific (international numbers vary too much for one fixed
  // pattern) -- just numeric input with simple, readable grouping.
  const hasPlus = raw.trim().startsWith("+");
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return hasPlus ? "+" : "";
  const groups = digits.match(/.{1,3}/g) || [];
  return (hasPlus ? "+" : "") + groups.join(" ");
}

function PhoneNumberSetting({ myUid }) {
  const { t } = useTheme();
  const [phone, setPhone] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "users", myUid), (snap) => setPhone(snap.data()?.phoneNumber || ""));
    return unsub;
  }, [myUid]);

  const save = async () => {
    const trimmed = phone.trim();
    const normalized = trimmed.replace(/[^\d+]/g, "") || null;
    await updateDoc(doc(db, "users", myUid), { phoneNumber: trimmed || null, phoneNumberNormalized: normalized });
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  return (
    <div style={{ marginTop: 20, marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <Phone size={16} color={t.primary} />
        <div style={{ fontWeight: 600, fontSize: 14, color: t.text }}>Phone number (optional)</div>
      </div>
      <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 10, lineHeight: 1.5 }}>
        Adding your real phone number helps friends and family find you automatically
        once their contacts are checked against the app. This is entirely optional —
        it's better to leave this blank than to enter a fake or made-up number, since a
        fake number could mistakenly connect you with someone else's real contact, or
        prevent people from finding you correctly at all.
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={phone}
          onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
          inputMode="tel"
          placeholder="+1 555 123 4567"
          style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: `1px solid ${t.border}`, fontSize: 14, boxSizing: "border-box" }}
        />
        <button onClick={save} style={{ padding: "10px 16px", borderRadius: 10, border: "none", background: t.primary, color: t.bubbleMeText, fontWeight: 700, cursor: "pointer" }}>
          {saved ? "Saved ✓" : "Save"}
        </button>
      </div>
    </div>
  );
}

function SettingsScreen({ myUid, isAdmin, themeKey, onOpenTheme, uiScale, setUiScale, showScrollDown, setShowScrollDown, animatedScrollEntry, setAnimatedScrollEntry, compactList, setCompactList, onBack, onNavigate, onLogout, userDoc, navConfig, setNavConfig, aiSidebarOn, setAiSidebarOn, showSplash, setShowSplash, searchMode, setSearchMode, topBarVisible, setTopBarVisible, onCheckUpdate, checkingUpdate, updateStatus }) {
  const { t, hideNav, setHideNav, chatTextScale, setChatTextScale, appFontId, setAppFontId } = useTheme();
  const wallpaperInputRef = useRef(null);
  const profilePhotoRef = useRef(null);
  const [wallpaperSaved, setWallpaperSaved] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [lockedChatsPassSaved, setLockedChatsPassSaved] = useState(false);
  const lockedChatsPassRef = useRef(null);
  const [appLockEnabled, setAppLockEnabled] = useState(() => localStorage.getItem("nextext_app_lock") === "true");
  const [appLockPassSaved, setAppLockPassSaved] = useState(false);
  const appLockPassRef = useRef(null);
  const [linkPreviewsOn, setLinkPreviewsOn] = useState(() => localStorage.getItem("nextext_link_previews") !== "off");
  const sysConfig = useSystemConfigHook();
  const globalSettings = useGlobalSettings();
  const [aiRequestStatus, setAiRequestStatus] = useState("");

  const userRestrictions = userDoc?.restrictions || null;
  const customStatusInputRef = useRef(null);
  const [customStatusSaved, setCustomStatusSaved] = useState(false);
  const [aiContextOn, setAiContextOn] = useState(() => localStorage.getItem("nextext_ai_context") === "true");
  const [openSections, setOpenSections] = useState({});
  const [resetPasswordModal, setResetPasswordModal] = useState(false);
  const [resetPasswordInput, setResetPasswordInput] = useState("");
  const [techStackEditing, setTechStackEditing] = useState(false);
  const [techStackDraft, setTechStackDraft] = useState(null);

  const toggleSection = (key) => setOpenSections((prev) => ({ ...(prev || {}), [key]: !(prev?.[key]) }));

  const handleGlobalWallpaper = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileToWallpaperDataUrl(file);
    setGlobalWallpaper(dataUrl);
    setWallpaperSaved(true);
    setTimeout(() => setWallpaperSaved(false), 1800);
  };

  const handleProfilePhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoUploading(true);
    try {
      const result = await uploadChatFile(`profile-${myUid}`, myUid, file, { compress: true });
      await updateDoc(doc(db, "users", myUid), { photoURL: result.url });
    } catch { /* silent */ }
    setPhotoUploading(false);
  };

  const saveCustomStatus = async () => {
    try {
      const textVal = customStatusInputRef.current?.value || "";
      const expiryEl = document.getElementById("custom-status-expiry");
      const expiryVal = expiryEl?.value || "forever";
      await updateDoc(doc(db, "users", myUid), {
        customStatusText: textVal.trim() || null,
        customStatusExpiry: expiryVal,
      });
      setCustomStatusSaved(true);
      setTimeout(() => setCustomStatusSaved(false), 1800);
    } catch { /* silent */ }
  };

  const Toggle = ({ on, onClick }) => (
    <div onClick={onClick} style={{ width: 46, height: 26, borderRadius: 13, background: on ? t.primary : t.border, position: "relative", cursor: "pointer", flexShrink: 0 }}>
      <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: on ? 23 : 3, transition: "left 0.15s" }} />
    </div>
  );

  const Row = ({ icon, label, sub, onClick, right }) => (
    <div onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 0", cursor: onClick ? "pointer" : "default", borderBottom: `1px solid ${t.border}` }}>
      <div style={{ width: 36, height: 36, borderRadius: "50%", background: t.primaryLight, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600, color: t.text, fontSize: 15 }}>{label}</div>{sub && <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 1 }}>{sub}</div>}</div>
      {right}
    </div>
  );

  const SectionCard = ({ title, emoji, children, sectionKey }) => {
    const isOpen = sectionKey ? (openSections?.[sectionKey] ?? false) : true;
    return (
      <div style={{ marginBottom: 18 }}>
        <div onClick={sectionKey ? () => toggleSection(sectionKey) : undefined} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, cursor: sectionKey ? "pointer" : "default" }}>
          <span style={{ fontSize: 14 }}>{emoji}</span>
          <span style={{ fontWeight: 700, fontSize: 14, color: t.text, flex: 1 }}>{title}</span>
          {sectionKey && <span style={{ fontSize: 11, color: t.textMuted, transition: "transform 0.2s", transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}>▼</span>}
        </div>
        {isOpen && (
          <div style={{ background: t.surface, borderRadius: 14, padding: "4px 14px", border: `1px solid ${t.border}` }}>
            {children}
          </div>
        )}
      </div>
    );
  };

  // ── Bottom bar customizer helpers ──
  const ALL_TABS = [
    { key: "chats", label: "Chats", mandatory: true },
    { key: "status", label: "Status" },
    { key: "groups", label: "Groups" },
    { key: "settings", label: "Settings" },
  ];

  const moveTab = (idx, dir) => {
    const next = [...navConfig];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    setNavConfig(next);
  };

  const toggleTab = (key) => {
    const isActive = navConfig.some((t) => t.key === key);
    if (isActive) {
      // Can't deactivate if only 2 active
      if (navConfig.length <= 2) return;
      // Can't deactivate chats (mandatory)
      if (key === "chats") return;
      setNavConfig(navConfig.filter((t) => t.key !== key));
    } else {
      setNavConfig([...navConfig, { key }]);
    }
  };

  // Short-circuit guard: if the user/preferences config hasn't resolved
  // from Firestore yet, render a safe placeholder instead of evaluating
  // nested accordion properties against null (which whites out the screen).
  if (!userDoc) {
    return (
      <div className="nx-screen" style={{ position: "absolute", inset: 0, background: t.bg, zIndex: 25 }}>
        <div style={{ display: "flex", alignItems: "center", padding: "16px", gap: 12, background: t.primary, flexShrink: 0 }}>
          <ChevronLeft size={22} color="#fff" onClick={onBack} style={{ cursor: "pointer" }} />
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 18 }}>Settings</span>
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: t.textMuted, fontSize: 14 }}>Loading settings…</div>
      </div>
    );
  }

  return (
    <div className="nx-screen" style={{ position: "absolute", inset: 0, background: t.bg, zIndex: 25 }}>
      <div style={{ display: "flex", alignItems: "center", padding: "16px", gap: 12, background: t.surface, borderBottom: `1px solid ${t.border}`, flexShrink: 0 }}>
        <ChevronLeft size={22} color={t.text} onClick={onBack} style={{ cursor: "pointer" }} />
        <span style={{ color: t.text, fontWeight: 700, fontSize: 18 }}>Settings</span>
      </div>
      <div className="nx-scroll" style={{ padding: "12px 16px", paddingBottom: 100 }}>

        {/* ═══ ACCOUNT & PROFILE ═══ */}
        <SectionCard title="Account & Profile" emoji="👤" sectionKey="account">
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 0", cursor: "pointer" }} onClick={() => profilePhotoRef.current?.click()}>
            <input ref={profilePhotoRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleProfilePhoto} />
            <Avatar photoURL={userDoc?.photoURL} name={userDoc?.username || userDoc?.displayName} uid={myUid} size={52} />
            <div>
              <div style={{ fontWeight: 600, color: t.text, fontSize: 15 }}>{userDoc?.displayName || userDoc?.username || "Your name"}</div>
              <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 1, display: "flex", alignItems: "center", gap: 4 }}>
                <Camera size={12} />
                {photoUploading ? "Uploading…" : "Tap to change profile photo"}
              </div>
            </div>
          </div>
          <PhoneNumberSetting myUid={myUid} />
        </SectionCard>

        {/* ═══ CUSTOM STATUS / ABOUT ME ═══ */}
        <SectionCard title="About Me" emoji="💬" sectionKey="about">
          <div style={{ padding: "13px 0" }}>
            <div style={{ fontWeight: 600, color: t.text, fontSize: 15, marginBottom: 6 }}>Custom status</div>
            <div style={{ fontSize: 12.5, color: t.textMuted, marginBottom: 8 }}>Set a status message shown on your profile.</div>
            <input
              ref={customStatusInputRef}
              key={userDoc?.customStatusText || ""}
              defaultValue={userDoc?.customStatusText || ""}
              placeholder="Hey, I am using NexText"
              maxLength={140}
              style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: `1px solid ${t.border}`, fontSize: 14, boxSizing: "border-box", marginBottom: 8, background: t.bg, color: t.text }}
            />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 12.5, color: t.textMuted }}>Self-destruct after</span>
              <select
                id="custom-status-expiry"
                key={userDoc?.customStatusExpiry || "forever"}
                defaultValue={userDoc?.customStatusExpiry || "forever"}
                style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${t.border}`, fontSize: 13, background: t.bg, color: t.text, cursor: "pointer", boxSizing: "border-box", maxWidth: 130 }}
              >
                <option value="forever">Forever</option>
                <option value="1">1 day</option>
                <option value="7">7 days</option>
                <option value="14">14 days</option>
                <option value="30">30 days</option>
              </select>
            </div>
            <button onClick={saveCustomStatus} style={{ width: "100%", padding: 11, borderRadius: 10, border: "none", background: t.primary, color: t.bubbleMeText, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              {customStatusSaved ? "Saved ✓" : "Save Status"}
            </button>
          </div>
        </SectionCard>

        {/* ═══ PRIVACY & SECURITY ═══ */}
        <SectionCard title="Privacy & Security" emoji="🔒" sectionKey="privacy">
          <Row icon={<Shield size={18} color={t.primary} />} label="Parental Controls" sub="Manage restrictions" onClick={() => onNavigate("parental")} />
          <Row icon={<Lock size={18} color={t.primary} />} label="Privacy" sub="Last seen, read receipts, status" onClick={() => onNavigate("privacy")} />

          {/* App protection lock */}
          <div style={{ padding: "13px 0", borderBottom: `1px solid ${t.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: t.primaryLight, display: "flex", alignItems: "center", justifyContent: "center" }}><Lock size={18} color={t.primary} /></div>
              <div style={{ flex: 1 }}><div style={{ fontWeight: 600, color: t.text, fontSize: 15 }}>App protection lock</div><div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 1 }}>Require password when opening the app</div></div>
              <Toggle on={appLockEnabled} onClick={() => {
                if (appLockEnabled) { setAppLockEnabled(false); localStorage.setItem("nextext_app_lock", "false"); localStorage.removeItem("nextext_app_lock_pass"); }
                else { setAppLockEnabled(true); localStorage.setItem("nextext_app_lock", "pending"); }
              }} />
            </div>
            {appLockEnabled && !appLockPassSaved && (
              <div style={{ display: "flex", gap: 8, marginTop: 10, paddingLeft: 50 }}>
                <input ref={appLockPassRef} type="password" defaultValue="" placeholder="Set PIN or password…" style={{ flex: 1, padding: "9px 12px", borderRadius: 10, border: `1px solid ${t.border}`, fontSize: 13, boxSizing: "border-box" }} />
                <button onClick={() => { const val = appLockPassRef.current?.value || ""; if (!val.trim()) return; localStorage.setItem("nextext_app_lock", "true"); localStorage.setItem("nextext_app_lock_pass", val); setAppLockPassSaved(true); if (appLockPassRef.current) appLockPassRef.current.value = ""; }} disabled={false} style={{ padding: "9px 14px", borderRadius: 10, border: "none", background: t.primary, color: t.bubbleMeText, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Save</button>
              </div>
            )}
            {appLockEnabled && appLockPassSaved && <div style={{ fontSize: 12, color: t.primary, fontWeight: 600, marginTop: 6, paddingLeft: 50 }}>Password saved &bull;&bull;&bull;&bull;&bull;</div>}
            {appLockEnabled && (appLockPassSaved || localStorage.getItem("nextext_app_lock_pass")) && (
              <div onClick={() => { setResetPasswordInput(""); setResetPasswordModal(true); }} style={{ fontSize: 12, color: "#FF3B30", fontWeight: 600, marginTop: 4, paddingLeft: 50, cursor: "pointer" }}>
                Reset password
              </div>
            )}
          </div>

          {/* Locked chats password */}
          <div style={{ padding: "13px 0" }}>
            <div style={{ fontWeight: 600, color: t.text, fontSize: 15, marginBottom: 4 }}>Locked chats password</div>
            <div style={{ fontSize: 12.5, color: t.textMuted, marginBottom: 8 }}>Set a password to hide chats. Type it in the search bar to reveal them.</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input ref={lockedChatsPassRef} type="password" defaultValue={localStorage.getItem("nextext_locked_chats_password") || ""} placeholder="Set password…" style={{ flex: 1, padding: "9px 12px", borderRadius: 10, border: `1px solid ${t.border}`, fontSize: 13, boxSizing: "border-box" }} />
              <button onClick={() => { const val = lockedChatsPassRef.current?.value || ""; localStorage.setItem("nextext_locked_chats_password", val); setLockedChatsPassSaved(true); setTimeout(() => setLockedChatsPassSaved(false), 1800); }} style={{ padding: "9px 14px", borderRadius: 10, border: "none", background: t.primary, color: t.bubbleMeText, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>{lockedChatsPassSaved ? "Saved ✓" : "Save"}</button>
            </div>
          </div>
        </SectionCard>

        {/* ═══ APPEARANCE & INTERFACE ═══ */}
        <SectionCard title="Appearance & Interface" emoji="🎨" sectionKey="appearance">
          <Row icon={<Palette size={18} color={t.primary} />} label="Theme" sub={themes[themeKey]?.name || "Default Theme"} onClick={onOpenTheme} />
          <Row icon={<ImageIcon size={18} color={t.primary} />} label="Default chat background" sub={wallpaperSaved ? "Saved ✓" : "Applies to chats without their own background"} onClick={() => wallpaperInputRef.current?.click()} />
          <input ref={wallpaperInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleGlobalWallpaper} />

          {/* Launch splash screen toggle */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 0", borderTop: `1px solid ${t.border}` }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, color: t.text, fontSize: 15 }}>Enable Launch Splash Screen</div>
              <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 1 }}>Show the 2.5s cinematic boot animation on app launch.</div>
            </div>
            <div
              onClick={() => { const next = !(showSplash ?? true); setShowSplash(next); localStorage.setItem("nextext_splash_enabled", next ? "on" : "off"); }}
              style={{ width: 46, height: 26, borderRadius: 13, background: (showSplash ?? true) ? t.primary : t.border, position: "relative", cursor: "pointer", flexShrink: 0 }}
            >
              <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: showSplash ? 23 : 3, transition: "left 0.15s" }} />
            </div>
          </div>

          {/* Fullscreen mode toggle */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 0", borderTop: `1px solid ${t.border}` }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, color: t.text, fontSize: 15 }}>Full Screen Mode</div>
              <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 1 }}>Hide status bar and navigation for immersive experience.</div>
            </div>
            <div
              onClick={() => {
                const isFull = !!(document.fullscreenElement || document.webkitFullscreenElement);
                if (isFull) {
                  if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
                  else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
                } else {
                  const el = document.documentElement;
                  if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
                  else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
                }
              }}
              style={{ width: 46, height: 26, borderRadius: 13, background: (document.fullscreenElement || document.webkitFullscreenElement) ? t.primary : t.border, position: "relative", cursor: "pointer", flexShrink: 0 }}
            >
              <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: (document.fullscreenElement || document.webkitFullscreenElement) ? 23 : 3, transition: "left 0.15s" }} />
            </div>
          </div>

          {/* Font */}
          <div style={{ padding: "13px 0" }}>
            <div style={{ fontWeight: 600, color: t.text, fontSize: 15, marginBottom: 6 }}>Font</div>
            <select value={appFontId} onChange={(e) => setAppFontId(e.target.value)} style={{ width: "100%", padding: "10px 14px", paddingRight: 16, boxSizing: "border-box", borderRadius: 10, border: `1px solid ${t.border}`, fontSize: 14, background: t.bg, color: t.text, cursor: "pointer" }}>
              {FONTS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </div>

          {/* App-wide text scaling */}
          <div style={{ padding: "13px 0" }}>
            <div style={{ fontWeight: 600, color: t.text, fontSize: 15, marginBottom: 4 }}>App size</div>
            <div style={{ fontSize: 12.5, color: t.textMuted, marginBottom: 8 }}>Adjust if things look too small or too large.</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <input type="range" min="0.6" max="1.6" step="0.05" value={uiScale} onChange={(e) => setUiScale(Number(e.target.value))} style={{ flex: 1, accentColor: t.primary }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: t.primary, minWidth: 44 }}>{Math.round(uiScale * 100)}%</span>
            </div>
          </div>

          {/* Chat text scaling */}
          <div style={{ padding: "13px 0" }}>
            <div style={{ fontWeight: 600, color: t.text, fontSize: 15, marginBottom: 4 }}>Chat text size</div>
            <div style={{ fontSize: 12.5, color: t.textMuted, marginBottom: 8 }}>Scale text inside chat bubbles.</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <input type="range" min="0.75" max="1.5" step="0.05" value={chatTextScale} onChange={(e) => setChatTextScale(Number(e.target.value))} style={{ flex: 1, accentColor: t.primary }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: t.primary, minWidth: 44 }}>{Math.round(chatTextScale * 100)}%</span>
            </div>
          </div>

          {/* Bottom bar customizer */}
          <div style={{ padding: "13px 0" }}>
            <div style={{ fontWeight: 600, color: t.text, fontSize: 15, marginBottom: 4 }}>Bottom bar layout</div>
            <div style={{ fontSize: 12.5, color: t.textMuted, marginBottom: 10 }}>Toggle and reorder tabs on the bottom navigation bar. Chats is always on.</div>
            {ALL_TABS.map((tabDef) => {
              const activeIdx = navConfig.findIndex((n) => n.key === tabDef.key);
              const isActive = activeIdx !== -1;
              return (
                <div key={tabDef.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${t.border}` }}>
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: isActive ? t.text : t.textMuted, opacity: isActive ? 1 : 0.5 }}>{tabDef.label}{tabDef.mandatory ? " (always on)" : ""}</span>
                  {!tabDef.mandatory && <Toggle on={isActive} onClick={() => toggleTab(tabDef.key)} />}
                  {tabDef.mandatory && <div style={{ width: 46 }} />}
                  {isActive && (
                    <div style={{ display: "flex", gap: 4 }}>
                      <div onClick={() => moveTab(activeIdx, -1)} style={{ width: 26, height: 26, borderRadius: 6, background: activeIdx > 0 ? t.primaryLight : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: activeIdx > 0 ? "pointer" : "default", fontSize: 14, color: activeIdx > 0 ? t.primary : t.textMuted }}>↑</div>
                      <div onClick={() => moveTab(activeIdx, 1)} style={{ width: 26, height: 26, borderRadius: 6, background: activeIdx < navConfig.length - 1 ? t.primaryLight : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: activeIdx < navConfig.length - 1 ? "pointer" : "default", fontSize: 14, color: activeIdx < navConfig.length - 1 ? t.primary : t.textMuted }}>↓</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <Row icon={<MessageSquare size={18} color={t.primary} />} label="Link previews" sub={linkPreviewsOn ? "On" : "Off"} right={<Toggle on={linkPreviewsOn} onClick={() => { const next = !linkPreviewsOn; setLinkPreviewsOn(next); localStorage.setItem("nextext_link_previews", next ? "on" : "off"); }} />} />
          <Row icon={<CircleDot size={18} color={t.primary} />} label="Scroll-to-bottom button" sub={showScrollDown ? "On" : "Off"} right={<Toggle on={showScrollDown} onClick={() => setShowScrollDown(!showScrollDown)} />} />
          <Row icon={<CircleDot size={18} color={t.primary} />} label="Animated scroll entry" sub={animatedScrollEntry ? "Smooth jump" : "Instant mount"} right={<Toggle on={animatedScrollEntry} onClick={() => { const next = !animatedScrollEntry; setAnimatedScrollEntry(next); localStorage.setItem("nextext_animated_scroll_entry", next ? "true" : "false"); }} />} />
          <Row icon={<Users size={18} color={t.primary} />} label="Compact chat list" sub={compactList ? "Denser rows" : "Standard spacing"} right={<Toggle on={compactList} onClick={() => { const next = !compactList; setCompactList(next); localStorage.setItem("nextext_compact_list", next ? "true" : "false"); }} />} />
          <Row icon={<Users size={18} color={t.primary} />} label="Hide bottom navigation" sub={hideNav ? "Hidden" : "Visible"} right={<Toggle on={hideNav} onClick={() => setHideNav(!hideNav)} />} />
          <Row icon={<Search size={18} color={t.primary} />} label="Show search button" sub={searchMode === "button" ? "Search icon hides bar" : "Search bar always visible"} right={<Toggle on={searchMode === "button"} onClick={() => { const next = searchMode === "button" ? "visible" : "button"; setSearchMode(next); localStorage.setItem("nextext_search_mode", next); }} />} />
          <Row icon={<Users size={18} color={t.primary} />} label="Show top bar" sub={topBarVisible ? "Visible" : "Hidden"} right={<Toggle on={topBarVisible} onClick={() => { const next = !topBarVisible; setTopBarVisible(next); localStorage.setItem("nextext_top_bar_visible", String(next)); }} />} />
        </SectionCard>

        {/* ═══ AI CONTROLS ═══ */}
        {userRestrictions?.blockAI !== true && !sysConfig?.hideAiEverywhere && (
          <SectionCard title="AI Controls" emoji="🤖" sectionKey="ai">
            {sysConfig?.aiGloballyDisabled ? (
              <div style={{ padding: "12px 0", textAlign: "center" }}>
                <div style={{ fontSize: 13, color: "#FF3B30", fontWeight: 600 }}>NexText AI is currently disabled by the administrator.</div>
              </div>
            ) : userDoc?.aiApproved ? (
              <>
                <div style={{ padding: "12px 0", display: "flex", alignItems: "center", gap: 10, borderBottom: `1px solid ${t.border}` }}>
                  <Bot size={20} color={t.primary} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: t.text, fontSize: 15 }}>NexText AI Access</div>
                    <div style={{ fontSize: 12.5, color: "#28A745", fontWeight: 600 }}>Approved ✓</div>
                  </div>
                </div>
                <div style={{ padding: "12px 0" }}>
                  <div style={{ fontWeight: 600, color: t.text, fontSize: 14, marginBottom: 8 }}>AI Personality</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {Object.entries(PERSONALITIES).map(([key, p]) => (
                      <div key={key} onClick={() => { setAIPersonality(myUid, key); setLiveUserDoc((prev) => ({ ...(prev || auth.userDoc || {}), aiPersonality: key })); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, background: userDoc?.aiPersonality === key ? t.primaryLight : t.bg, border: `1px solid ${userDoc?.aiPersonality === key ? t.primary : t.border}`, cursor: "pointer" }}>
                        <span style={{ fontSize: 18 }}>{p.icon}</span>
                        <span style={{ fontWeight: 600, fontSize: 14, color: userDoc?.aiPersonality === key ? t.primary : t.text }}>{p.label}</span>
                        {userDoc?.aiPersonality === key && <span style={{ marginLeft: "auto", color: t.primary, fontWeight: 700 }}>✓</span>}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div style={{ padding: "12px 0", textAlign: "center" }}>
                <div style={{ fontSize: 13, color: t.textMuted, marginBottom: 10, lineHeight: 1.5 }}>Request access to NexText AI, your intelligent chat companion powered by Groq.</div>
                {aiRequestStatus === "requested" || aiRequestStatus === "submitted" || aiRequestStatus === "frozen" ? (
                  <div style={{ fontSize: 13, color: "#856404", fontWeight: 600, padding: "10px 14px", background: "#FFF3CD", borderRadius: 10, lineHeight: 1.5, border: "1px solid #FFEEBA" }}>Request Pending Admin Approval...</div>
                ) : aiRequestStatus === "already_approved" ? (
                  <div style={{ fontSize: 13, color: "#28A745", fontWeight: 600 }}>Already approved! Refresh to see AI features.</div>
                ) : (
                   <button onClick={async () => { if (aiRequestStatus === "frozen") return; setAiRequestStatus("frozen"); try { await requestAIAccess(myUid, userDoc?.username); } catch { /* already submitted */ } }} style={{ width: "100%", padding: 11, borderRadius: 10, border: "none", background: t.primary, color: t.bubbleMeText, fontWeight: 700, fontSize: 14, cursor: "pointer", display: "block", position: "relative", zIndex: 99999, pointerEvents: "auto !important", textAlign: "center" }}>
                    <Sparkles size={16} /> Request AI Access
                  </button>
                )}
              </div>
            )}

            {userDoc?.aiApproved && (
              <>
                <div style={{ padding: "12px 0", borderTop: `1px solid ${t.border}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, color: t.text, fontSize: 15 }}>AI Sidebar Widget</div>
                      <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 1 }}>Floating AI shortcut on chat list</div>
                    </div>
                    <div onClick={() => { const next = !aiSidebarOn; setAiSidebarOn(next); localStorage.setItem("nextext_ai_sidebar", next ? "on" : "off"); }} style={{ width: 46, height: 26, borderRadius: 13, background: aiSidebarOn ? t.primary : t.border, position: "relative", cursor: "pointer", flexShrink: 0 }}>
                      <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: aiSidebarOn ? 23 : 3, transition: "left 0.15s" }} />
                    </div>
                  </div>
                </div>
                <div style={{ padding: "12px 0", borderTop: `1px solid ${t.border}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, color: t.text, fontSize: 15 }}>Grant Transcript Context Reader Access</div>
                  </div>
                  <div onClick={() => { const next = !aiContextOn; setAiContextOn(next); localStorage.setItem("nextext_ai_context", next ? "true" : "false"); }} style={{ width: 46, height: 26, borderRadius: 13, background: aiContextOn ? t.primary : t.border, position: "relative", cursor: "pointer", flexShrink: 0 }}>
                    <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: aiContextOn ? 23 : 3, transition: "left 0.15s" }} />
                  </div>
                </div>
                <div style={{ marginTop: 8, padding: "10px 12px", borderRadius: 8, background: "#FFF3CD", border: "1px solid #FFEEBA", fontSize: 11.5, color: "#856404", lineHeight: 1.5 }}>
                  WARNING: Enabling this switch grants the AI engine permission to read your private text conversation data history across all rooms strictly to generate summaries, offer chat reflections, or compile advisory reports. Disable at any time to restrict access.
                </div>
              </div>
              </>
            )}
          </SectionCard>
        )}

        {/* ═══ ACCOUNT ACTIONS ═══ */}
        <SectionCard title="Account" emoji="⚙️" sectionKey="accountActions">
          <Row icon={<MessageSquare size={18} color={t.primary} />} label="Send Feedback" sub="Message the admin directly" onClick={() => onNavigate("feedback")} />
          {isAdmin && <Row icon={<ShieldCheck size={18} color={t.primary} />} label="Admin Dashboard" sub="Users, reports, broadcasts" onClick={() => onNavigate("admin")} />}

          <div style={{ padding: "13px 0" }}>
            <button
              onClick={onCheckUpdate}
              disabled={checkingUpdate}
              style={{
                width: "100%", padding: "11px 16px", border: "none",
                background: t.primaryLight, color: t.primary,
                fontWeight: 700, fontSize: 14, cursor: checkingUpdate ? "wait" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                opacity: checkingUpdate ? 0.6 : 1,
              }}
            >
              <RefreshCw size={15} style={checkingUpdate ? { animation: "nextext-spin 0.9s linear infinite" } : {}} />
              {checkingUpdate ? "Checking…" : "Check for App Updates"}
            </button>
            {updateStatus && (
              <div style={{ fontSize: 12.5, color: updateStatus.includes("up to date") ? t.primary : "#FF3B30", fontWeight: 600, marginTop: 6, textAlign: "center" }}>{updateStatus}</div>
            )}
          </div>

          <div style={{ padding: "13px 0" }}>
            <button onClick={() => { const keys = Object.keys(localStorage).filter((k) => k.startsWith("nextext_")); keys.forEach((k) => localStorage.removeItem(k)); window.location.reload(); }} style={{ width: "100%", padding: "11px 16px", border: "none", background: t.primaryLight, color: t.primary, fontWeight: 700, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <RotateCcw size={15} /> Reset all settings
            </button>
          </div>
          {!userDoc?.restrictions?.disableSignOut && (
            <div style={{ padding: "13px 0" }}>
              <button onClick={onLogout} style={{ width: "100%", padding: "11px 16px", borderRadius: 10, border: "none", background: "#FF3B30", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Sign Out</button>
            </div>
          )}
        </SectionCard>

        {/* ═══ DEVELOPER & AI TECH STACK ═══ */}
        {!globalSettings?.hideTechStack && (() => {
          const defaultItems = [
            { label: "Developer", value: "Fred-Systems" },
            { label: "Base App", value: "Built with Claude Sonnet 5" },
            { label: "Advanced Features & Bug Fixing", value: "Big Pickle, Hy 3, DeepSeek V4 Flash, Laguna S 2.1" },
          ];
          const items = techStackDraft || globalSettings?.techStackItems || defaultItems;
          return (
            <SectionCard title="Developer & AI Tech Stack" emoji="🛠️" sectionKey="techstack">
              {items.map((item, idx) => (
                <div key={idx} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: idx < items.length - 1 ? `1px solid ${t.border}` : "none" }}>
                  {techStackEditing ? (
                    <div style={{ display: "flex", gap: 8, flex: 1, alignItems: "center" }}>
                      <input value={item.label} onChange={(e) => { const next = [...items]; next[idx] = { ...next[idx], label: e.target.value }; setTechStackDraft(next); }} style={{ width: 90, padding: "6px 8px", borderRadius: 8, border: `1px solid ${t.border}`, fontSize: 12, background: t.bg, color: t.text, fontWeight: 600, textTransform: "uppercase" }} placeholder="Label" />
                      <input value={item.value} onChange={(e) => { const next = [...items]; next[idx] = { ...next[idx], value: e.target.value }; setTechStackDraft(next); }} style={{ flex: 1, padding: "6px 8px", borderRadius: 8, border: `1px solid ${t.border}`, fontSize: 14, background: t.bg, color: t.text }} placeholder="Value" />
                      <div onClick={() => { const next = items.filter((_, i) => i !== idx); setTechStackDraft(next); }} style={{ width: 28, height: 28, borderRadius: 6, background: "#FFE5E5", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 16, color: "#FF3B30", flexShrink: 0 }}>×</div>
                    </div>
                  ) : (
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, color: t.textMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{item.label}</div>
                      <div style={{ fontSize: 15, color: t.text, fontWeight: 600, marginTop: 2 }}>{item.value}</div>
                    </div>
                  )}
                </div>
              ))}
              {isAdmin && (
                <div style={{ display: "flex", gap: 8, paddingTop: 10 }}>
                  {techStackEditing ? (
                    <>
                      <div onClick={() => setTechStackDraft([...items, { label: "New", value: "" }])} style={{ padding: "7px 12px", borderRadius: 8, background: t.primaryLight, color: t.primary, fontWeight: 700, fontSize: 13, cursor: "pointer", flex: 1, textAlign: "center" }}>+ Add Row</div>
                      <div onClick={() => { updateGlobalSettings({ techStackItems: items }, myUid); setTechStackEditing(false); setTechStackDraft(null); }} style={{ padding: "7px 14px", borderRadius: 8, background: t.primary, color: t.bubbleMeText, fontWeight: 700, fontSize: 13, cursor: "pointer", flex: 1, textAlign: "center" }}>Save</div>
                      <div onClick={() => { setTechStackEditing(false); setTechStackDraft(null); }} style={{ padding: "7px 14px", borderRadius: 8, background: t.border, color: t.textMuted, fontWeight: 700, fontSize: 13, cursor: "pointer", flex: 1, textAlign: "center" }}>Cancel</div>
                    </>
                  ) : (
                    <div onClick={() => setTechStackEditing(true)} style={{ padding: "7px 14px", borderRadius: 8, background: t.primaryLight, color: t.primary, fontWeight: 700, fontSize: 13, cursor: "pointer", textAlign: "center" }}>Edit Tech Stack</div>
                  )}
                </div>
              )}
            </SectionCard>
          );
        })()}
      {resetPasswordModal && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => { setResetPasswordModal(false); setResetPasswordInput(""); }}>
          <div style={{ background: t.surface, borderRadius: 16, padding: 20, maxWidth: 350, width: "100%" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ fontWeight: 700, fontSize: 17, color: t.text }}>Reset App Lock Password</span>
              <span onClick={() => { setResetPasswordModal(false); setResetPasswordInput(""); }} style={{ cursor: "pointer", color: t.textMuted, fontSize: 18 }}>×</span>
            </div>
            <div style={{ fontSize: 12.5, color: t.textMuted, marginBottom: 16 }}>Enter your current password to reset the app lock.</div>
            <input
              type="password"
              value={resetPasswordInput}
              onChange={(e) => setResetPasswordInput(e.target.value)}
              placeholder="Current password"
              autoFocus
              style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: `1px solid ${t.border}`, fontSize: 14.5, color: t.text, background: t.surface, outline: "none", boxSizing: "border-box", marginBottom: 16 }}
            />
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <div onClick={() => { setResetPasswordModal(false); setResetPasswordInput(""); }} style={{ padding: "9px 16px", borderRadius: 10, cursor: "pointer", fontSize: 13.5, fontWeight: 600, color: t.textMuted }}>Cancel</div>
              <div onClick={() => { const old = localStorage.getItem("nextext_app_lock_pass"); if (resetPasswordInput !== old) { alert("Incorrect password."); return; } localStorage.removeItem("nextext_app_lock_pass"); localStorage.setItem("nextext_app_lock", "pending"); setAppLockPassSaved(false); setResetPasswordModal(false); setResetPasswordInput(""); }} style={{ padding: "9px 16px", borderRadius: 10, background: t.primary, color: t.bubbleMeText, fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}>Reset</div>
            </div>
          </div>
        </div>
)}
      </div>
    </div>
  );
}

const DEFAULT_NAV_CONFIG = [{ key: "chats" }, { key: "status" }, { key: "groups" }, { key: "settings" }];

function AppShell() {
  const { t, themeKey, setThemeKey, hideNav, appFont } = useTheme();
  const auth = useAuth();
  const [screen, setScreen] = useState("list");
  const [activeChat, setActiveChat] = useState(null);
  const [activeGroup, setActiveGroup] = useState(null);
  const [uiScale, setUiScale] = useState(() => Number(localStorage.getItem(UI_SCALE_KEY)) || 1);
  const [showScrollDown, setShowScrollDown] = useState(() => localStorage.getItem(SCROLL_DOWN_KEY) !== "false");
  const [animatedScrollEntry, setAnimatedScrollEntry] = useState(() => localStorage.getItem("nextext_animated_scroll_entry") === "true");
  const [compactList, setCompactList] = useState(() => localStorage.getItem("nextext_compact_list") === "true");
  const [showThemeSheet, setShowThemeSheet] = useState(false);
  const [activeNavTab, setActiveNavTab] = useState("chats");
  const [userRestrictions, setUserRestrictions] = useState(null);
  const [liveUserDoc, setLiveUserDoc] = useState(auth.userDoc);
  const [navConfig, setNavConfig] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("nextext_nav_config"));
      if (Array.isArray(stored) && stored.length >= 2) return stored;
    } catch { /* ignore */ }
    return DEFAULT_NAV_CONFIG;
  });
  const [appLocked, setAppLocked] = useState(() => {
    const enabled = localStorage.getItem("nextext_app_lock") === "true";
    const pass = localStorage.getItem("nextext_app_lock_pass");
    return enabled && !!pass;
  });
  const [storyViewerOpen, setStoryViewerOpen] = useState(false);
  const [showSplash, setShowSplash] = useState(() => localStorage.getItem("nextext_splash_enabled") !== "off");
  const [splashVisible, setSplashVisible] = useState(() => localStorage.getItem("nextext_splash_enabled") !== "off");
  const [splashFading, setSplashFading] = useState(false);
  const [aiSidebarOn, setAiSidebarOn] = useState(() => localStorage.getItem("nextext_ai_sidebar") !== "off");
  const [searchMode, setSearchMode] = useState(() => localStorage.getItem("nextext_search_mode") || "visible");
  const [topBarVisible, setTopBarVisible] = useState(() => localStorage.getItem("nextext_top_bar_visible") !== "false");
  const [pendingUpdate, setPendingUpdate] = useState(null);
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateStatus, setUpdateStatus] = useState("");
  const swipeStartRef = useRef({ x: 0, y: 0 });

  const myUid = auth.user?.uid;
  usePresenceHeartbeat(myUid);

  useEffect(() => {
    if (myUid) initNotifications(myUid);
  }, [myUid]);

  const { contacts } = useContacts(myUid);
  const { chats: myChats } = useChats(myUid);
  const totalUnreadChats = (myChats || []).reduce((sum, c) => sum + (c.unreadCount?.[myUid] || 0), 0);
  const contactUids = (contacts || []).filter((c) => c.status === "accepted").map((c) => c.uid);
  const allStatusUids = [myUid, ...contactUids];
  const allStatuses = useStatuses(myUid ? allStatusUids : []);

  const VIEWED_KEY = "nextext_status_viewed";
  let unreadStatusCount = 0;
  if (myUid) {
    try {
      const raw = localStorage.getItem(VIEWED_KEY);
      const viewedMap = raw ? JSON.parse(raw) : {};
      const now = Date.now();
      const activeOwnerUids = new Set(allStatuses.filter((s) => s.ownerId !== myUid).map((s) => s.ownerId));
      for (const uid of activeOwnerUids) {
        const viewedTs = viewedMap[uid];
        if (!viewedTs || (now - viewedTs) > 24 * 60 * 60 * 1000) unreadStatusCount++;
      }
    } catch { unreadStatusCount = 0; }
  }

  useEffect(() => { localStorage.setItem("nextext_nav_config", JSON.stringify(navConfig)); }, [navConfig]);

  useEffect(() => {
    if (!myUid) return;
    purgeExpiredStatuses(myUid);
  }, [myUid]);

  useEffect(() => {
    if (!auth.user?.uid) return;
    const unsub = onSnapshot(doc(db, "users", auth.user.uid), (snap) => {
      const data = snap.data() || null;
      setUserRestrictions(data?.restrictions || null);
      setLiveUserDoc(data);
    });
    return unsub;
  }, [auth.user?.uid]);

  // Native launch splash: fade starts at 1.5s, hard dismiss at 3s.
  useEffect(() => {
    if (!showSplash) {
      setSplashVisible(false);
      return;
    }
    const fadeTimer = setTimeout(() => setSplashFading(true), 1500);
    const dismissTimer = setTimeout(() => { setSplashVisible(false); }, 3000);
    return () => { clearTimeout(fadeTimer); clearTimeout(dismissTimer); };
  }, [showSplash]);

  // Auto-check for app updates once after login (delayed 5s to not block load)
  useEffect(() => {
    if (!myUid) return;
    const timer = setTimeout(async () => {
      try {
        const update = await checkForUpdate();
        if (update) {
          setPendingUpdate(update);
          setShowUpdatePrompt(true);
        }
      } catch { /* silent */ }
    }, 5000);
    return () => clearTimeout(timer);
  }, [myUid]);

  const handleManualUpdateCheck = async () => {
    setCheckingUpdate(true);
    setUpdateStatus("");
    try {
      const update = await checkForUpdate();
      if (update) {
        setPendingUpdate(update);
        setShowUpdatePrompt(true);
        setUpdateStatus("");
      } else {
        setUpdateStatus("Your app is up to date!");
        setTimeout(() => setUpdateStatus(""), 3000);
      }
    } catch {
      setUpdateStatus("Could not check for updates.");
      setTimeout(() => setUpdateStatus(""), 3000);
    }
    setCheckingUpdate(false);
  };

  const handleDownloadUpdate = () => {
    if (pendingUpdate?.downloadUrl) {
      openDownloadUrl(pendingUpdate.downloadUrl);
    } else if (pendingUpdate?.releaseUrl) {
      openDownloadUrl(pendingUpdate.releaseUrl);
    }
    if (pendingUpdate?.version) setLastSeenRelease(pendingUpdate.version);
    setShowUpdatePrompt(false);
  };

  const handleDismissUpdate = () => {
    if (pendingUpdate?.version) setLastSeenRelease(pendingUpdate.version);
    setShowUpdatePrompt(false);
  };

  useEffect(() => { localStorage.setItem(UI_SCALE_KEY, String(uiScale)); }, [uiScale]);
  useEffect(() => { localStorage.setItem(SCROLL_DOWN_KEY, String(showScrollDown)); }, [showScrollDown]);

  // Re-lock app whenever the user returns (from background, screen off, etc.)
  useEffect(() => {
    const relock = () => {
      const enabled = localStorage.getItem("nextext_app_lock") === "true";
      const pass = localStorage.getItem("nextext_app_lock_pass");
      const shouldLock = enabled && !!pass;
      if (shouldLock) setAppLocked(true);
    };
    document.addEventListener("visibilitychange", relock);
    window.addEventListener("focus", relock);
    return () => { document.removeEventListener("visibilitychange", relock); window.removeEventListener("focus", relock); };
  }, []);

  // Re-evaluate app lock state whenever the user returns to the list screen
  // (this catches toggles made in Settings without needing a cross-tab event).
  useEffect(() => {
    if (screen === "list" || screen === "settings") {
      const enabled = localStorage.getItem("nextext_app_lock") === "true";
      const pass = localStorage.getItem("nextext_app_lock_pass");
      const shouldLock = enabled && !!pass;
      setAppLocked(shouldLock);
    }
  }, [screen]);

  const [initialViewStatuses, setInitialViewStatuses] = useState(null);
  const [statusOrigin, setStatusOrigin] = useState("status");

  const openChat = (chatDoc, otherUid, contact, options) => {
    if (options?.isAI) {
      setScreen("aiChat");
      return;
    }
    if (options?.openProfile) {
      setActiveChat({ chatId: chatDoc?.id || null, otherUid, contact, origin: "list" });
      setScreen("contactProfile");
      return;
    }
    if (options?.openStatus) {
      setStatusOrigin("chat");
      setInitialViewStatuses({ statuses: options.openStatus, ownerUid: otherUid });
      setScreen("status");
      return;
    }
    setActiveChat({ chatId: chatDoc?.id || null, otherUid, contact, origin: "chat", openSettings: options?.openSettings || false });
    setScreen("chat");
  };

  const openGroupInfo = (chat) => {
    setActiveGroup({ chatId: chat?.id, groupName: chat?.groupName });
    setScreen("groupInfo");
  };

  const openContactProfile = (uid, contact) => {
    setActiveChat({ chatId: null, otherUid: uid, contact, origin: "list" });
    setScreen("contactProfile");
  };

  const containerStyle = {
    position: "absolute", inset: 0,
    overflow: "hidden",
    fontFamily: appFont,
    width: "100%",
    height: "100%",
  };

  if (auth.loading) {
    return <div style={{ ...containerStyle, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#0B141A" }}>
      <img src="./icon.png" alt="" style={{ width: 100, height: 100, objectFit: "contain", marginBottom: 20 }} onError={(e) => { e.target.style.display = "none"; }} />
      <div style={{ width: 40, height: 40, border: "4px solid rgba(16, 185, 129, 0.25)", borderTopColor: "#10B981", borderRadius: "50%", animation: "nextext-spin 0.9s linear infinite", marginBottom: 16 }} />
      <span style={{ color: "#fff", fontSize: 20, fontWeight: 700 }}>Loading…</span>
      <span style={{ color: "rgba(255,255,255,0.8)", fontSize: 14, marginTop: 8 }}>Connecting to server</span>
      <style>{`@keyframes nextext-spin { to { transform: rotate(360deg); } }`}</style>
    </div>;
  }
  if (!auth.user) {
    return <div style={containerStyle}><AuthScreen auth={auth} /></div>;
  }
  if (appLocked) {
    return <AppLockScreen onUnlock={() => setAppLocked(false)} />;
  }

  const isAdmin = auth.userDoc?.role === "admin" || auth.userDoc?.isAdmin === true;

  return (
    <>
    <div
      id="nextext-app-shell"
      style={{ ...containerStyle }}
      onTouchStart={(e) => { swipeStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
      onTouchEnd={(e) => {
        if (screen !== "list" || storyViewerOpen) return;
        const dx = e.changedTouches[0].clientX - swipeStartRef.current.x;
        const dy = e.changedTouches[0].clientY - swipeStartRef.current.y;
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 60) {
          const tabs = navConfig.map((n) => n.key);
          const currentIdx = tabs.indexOf(activeNavTab);
          if (dx < 0 && currentIdx < tabs.length - 1) {
            setActiveNavTab(tabs[currentIdx + 1]);
          } else if (dx > 0 && currentIdx > 0) {
            setActiveNavTab(tabs[currentIdx - 1]);
          }
        }
      }}
    >
      <ChatListScreen myUid={myUid} userDoc={auth.userDoc} onOpenChat={openChat} onOpenGroupInfo={openGroupInfo} onOpenSettings={() => setScreen("settings")} hideNav={hideNav} navTab={activeNavTab} compactList={compactList} searchMode={searchMode} topBarVisible={topBarVisible} />

      {screen === "chat" && activeChat && (
        <ConversationScreen
          myUid={myUid}
          chatId={activeChat.chatId}
          otherUid={activeChat.otherUid}
          contact={activeChat.contact}
          openSettings={activeChat.openSettings}
          onBack={() => setScreen("list")}
          onOpenProfile={() => setScreen("contactProfile")}
          onOpenGroupInfo={openGroupInfo}
          showScrollDownSetting={showScrollDown}
          animatedScrollEntry={animatedScrollEntry}
        />
      )}
      {screen === "contactProfile" && activeChat && (
         <ContactProfileScreen
          myUid={myUid}
          otherUid={activeChat.otherUid}
          contact={activeChat.contact}
          onBack={() => {
            if (activeChat.origin === "list") setScreen("list");
            else setScreen("chat");
          }}
          onOpenStatus={() => setScreen("status")}
        />
      )}
      {screen === "status" && (
        <StatusScreen myUid={myUid} myName={auth.userDoc?.displayName || auth.userDoc?.username} onBack={() => { setScreen("list"); setActiveNavTab("chats"); setStoryViewerOpen(false); }} onStoryViewerChange={setStoryViewerOpen} initialViewStatuses={initialViewStatuses} statusOrigin={statusOrigin} />
      )}
      {screen === "groupInfo" && activeGroup && (
        <GroupInfoScreen
          myUid={myUid}
          chatId={activeGroup.chatId}
          onBack={() => setScreen("list")}
          onOpenChat={openChat}
          onOpenContactProfile={openContactProfile}
        />
      )}
      {screen === "settings" && (
        <SettingsScreen
          myUid={myUid}
          isAdmin={isAdmin}
          themeKey={themeKey}
          onOpenTheme={() => setShowThemeSheet(true)}
          uiScale={uiScale}
          setUiScale={setUiScale}
          showScrollDown={showScrollDown}
          setShowScrollDown={setShowScrollDown}
          animatedScrollEntry={animatedScrollEntry}
          setAnimatedScrollEntry={setAnimatedScrollEntry}
          compactList={compactList}
          setCompactList={setCompactList}
          onBack={() => setScreen("list")}
          onNavigate={setScreen}
          onLogout={() => auth.logOut()}
          userDoc={liveUserDoc || auth.userDoc}
          navConfig={navConfig}
          setNavConfig={setNavConfig}
          aiSidebarOn={aiSidebarOn}
          setAiSidebarOn={setAiSidebarOn}
          showSplash={showSplash}
          setShowSplash={setShowSplash}
          searchMode={searchMode}
          setSearchMode={setSearchMode}
          topBarVisible={topBarVisible}
          setTopBarVisible={setTopBarVisible}
          onCheckUpdate={handleManualUpdateCheck}
          checkingUpdate={checkingUpdate}
          updateStatus={updateStatus}
        />
      )}
      {screen === "privacy" && <PrivacyScreen myUid={myUid} onBack={() => setScreen("settings")} />}
      {screen === "parental" && <ParentalControlsScreen myUid={myUid} onBack={() => setScreen("settings")} />}
      {screen === "feedback" && <FeedbackScreen myUid={myUid} myUsername={auth.userDoc?.username} onBack={() => setScreen("settings")} />}
      {screen === "admin" && isAdmin && <AdminDashboard myUid={myUid} onBack={() => setScreen("settings")} />}
      {screen === "aiChat" && (
        <AIChatScreen myUid={myUid} onBack={() => setScreen("list")} />
      )}

      {aiSidebarOn && !storyViewerOpen && screen === "list" && (
        <AISidebarWidget myUid={myUid} userDoc={auth.userDoc} onOpenAI={() => setScreen("aiChat")} />
      )}

      {showThemeSheet && (
        <ThemeSheet current={themeKey} onSelect={(k) => { setThemeKey(k); setShowThemeSheet(false); }} onClose={() => setShowThemeSheet(false)} />
      )}



      {!hideNav && !storyViewerOpen && (screen === "list" || screen === "status" || screen === "settings") && (() => {
        const ALL_TABS = {
          chats: { icon: MessageSquare, label: "Chats" },
          status: { icon: CircleDot, label: "Status" },
          groups: { icon: Users, label: "Groups" },
          settings: { icon: SettingsIcon, label: "Settings" },
        };
        const navTabs = navConfig
          .filter(({ key }) => {
            if (key === "status" && userRestrictions?.blockStatus === true) return false;
            if (key === "groups" && userRestrictions?.blockGroups === true) return false;
            return ALL_TABS[key];
          })
          .map(({ key }) => ({ key, ...ALL_TABS[key] }));
        // Force settings onto bottom bar when top bar is hidden
        if (!topBarVisible && !navTabs.some((t) => t.key === "settings")) {
          navTabs.push({ key: "settings", ...ALL_TABS.settings });
        }
        if (!navTabs.length) return null;
        return (
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, display: "flex", background: t.surface, borderTop: `1px solid ${t.border}`, zIndex: 1000 }}>
            {navTabs.map(({ key, icon: Icon, label }) => {
              const isActive = key === "settings" ? screen === "settings" : key === "status" ? screen === "status" : (screen === "list" && activeNavTab === key);
              return (
              <div key={key} onClick={() => { if (key === "settings") setScreen("settings"); else if (key === "status") { setStatusOrigin("status"); setScreen("status"); } else { setActiveNavTab(key); setScreen("list"); } }} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "10px 0 12px", cursor: "pointer", color: isActive ? t.primary : t.textMuted, position: "relative" }}>
                <div style={{ position: "relative" }}>
                  <Icon size={20} />
                  {key === "chats" && totalUnreadChats > 0 && (
                    <div style={{ position: "absolute", top: -4, right: -8, minWidth: 16, height: 16, borderRadius: 8, background: "#FF3B30", color: "#fff", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px", border: `2px solid ${t.surface}` }}>{totalUnreadChats > 99 ? "99+" : totalUnreadChats}</div>
                  )}
                  {key === "status" && unreadStatusCount > 0 && (
                    <div style={{ position: "absolute", top: -2, right: -4, width: 8, height: 8, borderRadius: "50%", background: t.accent, border: `2px solid ${t.surface}` }} />
                  )}
                </div>
                <span style={{ fontSize: 11, fontWeight: isActive ? 700 : 500 }}>{label}</span>
              </div>
              );
            })}
          </div>
        );
      })()}

      {createPortal(splashVisible && (
        <div
          onTransitionEnd={() => { if (splashFading) setSplashVisible(false); }}
          style={{
            position: "fixed", inset: 0, zIndex: 999999, background: "#121B22",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 28,
            opacity: splashFading ? 0 : 1, transition: "opacity 0.6s ease-out",
            pointerEvents: splashFading ? "none" : "auto",
          }}
        >
          <img src="./icon.png" alt="" style={{ width: 180, height: 180, objectFit: "contain" }} />
          <div
            style={{
              width: 34, height: 34,
              border: "3px solid rgba(16, 185, 129, 0.25)",
              borderTopColor: "#10B981",
              animation: "nextext-spin 0.9s linear infinite",
            }}
          />
          <style>{`@keyframes nextext-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ), document.body)}

      {showUpdatePrompt && pendingUpdate && (
        <UpdatePrompt
          update={pendingUpdate}
          onDownload={handleDownloadUpdate}
          onDismiss={handleDismissUpdate}
        />
      )}
    </div>
    </>
  );
}

export default function App() {
  const [showPermissionDialog, setShowPermissionDialog] = useState(false);
  const [permissionStep, setPermissionStep] = useState(0);
  const permissions = [
    { name: "Contacts", desc: "Used to find friends and sync your contact list", permission: "contacts" },
    { name: "Microphone", desc: "Used for voice messages and voice calls", permission: "microphone" },
    { name: "Camera", desc: "Used for photos, videos, and profile pictures", permission: "camera" },
    { name: "Files & Media", desc: "Used to save and send images, videos, and files", permission: "files" },
    { name: "Notifications", desc: "Used for message alerts and status updates", permission: "notifications" },
  ];

  useEffect(() => {
    const checkPermissions = async () => {
      // Check if we've already shown the permission dialog
      const hasShown = localStorage.getItem("nextext_permissions_shown");
      if (!hasShown) {
        setShowPermissionDialog(true);
      }
    };
    checkPermissions();
  }, []);

  const requestPermission = async (perm) => {
    try {
      switch (perm) {
        case "contacts":
          try {
            if (navigator.contacts && navigator.contacts.select) {
              await navigator.contacts.select(['name', 'email', 'tel'], { multiple: true });
            }
          } catch {}
          break;
        case "microphone":
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach((t) => t.stop());
          } catch {}
          break;
        case "camera":
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            stream.getTracks().forEach((t) => t.stop());
          } catch {}
          break;
        case "files":
          try {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = "image/*,video/*";
            input.click();
            await new Promise((resolve) => { input.onchange = resolve; });
          } catch {}
          break;
        case "notifications":
          try {
            if ("Notification" in window && Notification.permission === "default") {
              await Notification.requestPermission();
            }
          } catch {}
          break;
      }
    } catch (e) {
      console.warn("Permission request failed:", e);
    }
    setPermissionStep((prev) => prev + 1);
  };

  const skipPermission = () => {
    setPermissionStep((prev) => prev + 1);
  };

  const finishPermissions = () => {
    localStorage.setItem("nextext_permissions_shown", "true");
    setShowPermissionDialog(false);
  };

  const PermissionDialog = () => (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 999999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => {}}>
      <div style={{ background: "#121B22", borderRadius: 20, width: "100%", maxWidth: 400, maxHeight: "90%", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: "24px 20px 16px", textAlign: "center", borderBottom: "1px solid #2a3a4a" }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", marginBottom: 8 }}>Welcome to NexText</div>
          <div style={{ fontSize: 14, color: "#8a9aa8" }}>We need a few permissions to give you the best experience</div>
        </div>
        <div style={{ padding: "16px 20px 8px", maxHeight: "60vh", overflowY: "auto" }}>
          {permissions.map((p, i) => (
            <div key={p.permission} style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px", background: i < permissionStep ? "rgba(0,168,132,0.1)" : "rgba(255,255,255,0.03)", borderRadius: 12, marginBottom: 8, border: `1px solid ${i < permissionStep ? "#00A884" : "rgba(255,255,255,0.1)"}`, transition: "all 0.3s" }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: i < permissionStep ? "#00A884" : "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {i < permissionStep ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                ) : (
                  <span style={{ fontSize: 18, color: "#8a9aa8" }}>{i + 1}</span>
                )}
              </div>
              <div style={{ flex: 1, textAlign: "left" }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>{p.name}</div>
                <div style={{ fontSize: 12, color: "#8a9aa8", marginTop: 2 }}>{p.desc}</div>
              </div>
              {i === permissionStep && (
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => requestPermission(p.permission)} style={{ padding: "10px 20px", borderRadius: 8, background: "#00A884", color: "#fff", fontWeight: 700, fontSize: 13, border: "none", cursor: "pointer" }}>
                    Allow
                  </button>
                  <button onClick={skipPermission} style={{ padding: "10px 14px", borderRadius: 8, background: "transparent", color: "#8a9aa8", fontWeight: 600, fontSize: 12, border: "1px solid rgba(255,255,255,0.15)", cursor: "pointer" }}>
                    Skip
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
        {permissionStep >= permissions.length && (
          <div style={{ padding: "20px", textAlign: "center", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginBottom: 8 }}>All set!</div>
            <div style={{ fontSize: 13, color: "#8a9aa8", marginBottom: 16 }}>Thanks for enabling permissions. You can change these anytime in settings.</div>
            <button onClick={finishPermissions} style={{ padding: "14px 40px", borderRadius: 10, background: "#00A884", color: "#fff", fontWeight: 700, fontSize: 15, border: "none", cursor: "pointer" }}>Continue</button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <ThemeProvider>
      <AppShell />
      {showPermissionDialog && <PermissionDialog />}
    </ThemeProvider>
  );
}

