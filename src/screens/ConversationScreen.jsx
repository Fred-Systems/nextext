import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, Send, Smile, Check, CheckCheck, CornerUpLeft, X, BarChart2, Plus, MoreVertical, Bell, BellOff, Star, ArrowDown, ArrowUp, Search, Image as ImageIcon, Paperclip, Mic, Play, Pause, FileText, Camera, Lock, Archive, Trash2, MessageSquare, UserPlus, Users, ImageOff, VideoOff, MicOff, FileX, RefreshCw } from "lucide-react";
import { useTheme } from "../theme/ThemeContext";
import {
  useMessages, sendTextMessage, markChatRead, setTypingHeartbeat, reactToMessage,
  getOrCreateDirectChat, markMessagesDelivered, markMessagesRead, sendPollMessage,
  voteOnPoll, editMessage, deleteMessageForSelf, deleteMessageForEveryone,
  toggleFavorite, setMute, clearMute, sendMediaMessage, toggleLocked, toggleArchive, deleteChatCompletely,
  isMediaExpired,
} from "../firebase/chats";
import { getWallpaperForChat, setWallpaperForChat, fileToWallpaperDataUrl } from "../theme/wallpaper";
import { usePresence, formatLastSeen } from "../firebase/presence";
import { uploadChatFile } from "../supabase/media";
import { FileTooLargeError } from "../media/mediaCompression";
import { doc, getDoc, onSnapshot, addDoc, collection, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { registerPlugin } from "@capacitor/core";
import Avatar, { getLocalPhotoOverride } from "../components/Avatar";
import { extractFirstUrl, fetchLinkPreview, isLinkPreviewEnabled } from "../utils/linkPreview";
import { useGlobalSettings } from "../firebase/config-settings";
import { getSystemInsets } from "../utils/systemInsets";

const NextextNative = registerPlugin("NextextNative");
import { useStatuses } from "../firebase/status";
import { shouldTriggerGroupAI, sendGroupAIMessage, AI_CONTACT_UID } from "../firebase/ai";
import { useContacts } from "../firebase/contacts";


const VIEWED_KEY = "nextext_status_viewed";
function getStoredViewed() {
  try { const raw = localStorage.getItem(VIEWED_KEY); return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

const QUICK_REACTIONS = ["❤️", "😂", "😮", "😢", "🙏", "👍"];
const EMOJI_PICKER_SET = [
  "😀", "😂", "🥹", "😍", "😘", "😎", "🤔", "😴",
  "😭", "😡", "🥳", "😇", "🤗", "🙄", "😬", "🤯",
  "👍", "👎", "👏", "🙌", "🙏", "💪", "🤝", "✌️",
  "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "💔",
  "🔥", "✨", "🎉", "🎂", "🍕", "☕", "🌟", "💯",
  "😊", "😅", "🥰", "😜", "🤩", "🤤", "😢", "🤣",
];
const READ_DELAY_MS = 1500; // deliberate small gap so "delivered" is actually visible before "read"

// WhatsApp-style day divider label: "Today", "Yesterday", or "Friday, July 16".
function formatDayLabel(date) {
  const d = new Date(date);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfToday - startOfDay) / 86400000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
}

function getMediaExpiryText(sentAt, mediaExpiryDays) {
  if (mediaExpiryDays == null) return "Permanent Storage";
  if (!sentAt?.toDate) return "";
  const daysElapsed = (Date.now() - sentAt.toDate().getTime()) / (1000 * 60 * 60 * 24);
  const remaining = Math.ceil(mediaExpiryDays - daysElapsed);
  if (remaining <= 0) return "Expired";
  return `Deletes in ${remaining} day${remaining !== 1 ? "s" : ""}`;
}

function filterTextByParentalControls(text, customFilterLists) {
  if (!text || !customFilterLists || customFilterLists.length === 0) return { text, blocked: false };
  const allKeywords = customFilterLists.flatMap((list) => list.keywords || []);
  if (allKeywords.length === 0) return { text, blocked: false };
  for (const kw of allKeywords) {
    const regex = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    if (regex.test(text)) return { text: "[Blocked by parental controls]", blocked: true };
  }
  return { text, blocked: false };
}

function StatusReplyBlock({ statusRef, mine, t }) {
  if (!statusRef) return null;
  const isExpired = statusRef.expiresAt?.toDate ? statusRef.expiresAt.toDate().getTime() < Date.now() : false;
  const hasMedia = !isExpired && statusRef.mediaURL;
  return (
    <div style={{ background: mine ? "rgba(255,255,255,0.15)" : t.primaryLight, borderLeft: `3px solid ${mine ? "rgba(255,255,255,0.6)" : t.primary}`, borderRadius: 6, padding: "5px 8px", marginBottom: 6, fontSize: 12, overflow: "hidden" }}>
      {hasMedia && statusRef.mediaType === "image" && (
        <img src={statusRef.mediaURL} alt="" style={{ width: 48, height: 48, borderRadius: 6, objectFit: "cover", marginBottom: 4 }} />
      )}
      {hasMedia && statusRef.mediaType === "video" && (
        <div style={{ width: 48, height: 48, borderRadius: 6, background: "#000", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 4 }}>
          <span style={{ fontSize: 18 }}>🎥</span>
        </div>
      )}
      {isExpired ? (
        <div style={{ opacity: 0.6, fontStyle: "italic", fontSize: 11 }}>
          [Reacted to status on {statusRef.createdAt?.toDate ? statusRef.createdAt.toDate().toLocaleDateString() : "unknown date"}]
        </div>
      ) : (
        <>
          {statusRef.text && <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", opacity: 0.8 }}>{statusRef.text}</div>}
          {!statusRef.text && hasMedia && <div style={{ opacity: 0.6, fontStyle: "italic" }}>📷 Status media</div>}
          {!statusRef.text && !hasMedia && <div style={{ opacity: 0.6, fontStyle: "italic" }}>Status</div>}
        </>
      )}
    </div>
  );
}

function LinkPreviewCard({ text, mine, t, textScale }) {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!text) return;
    const url = extractFirstUrl(text);
    if (!url) { setLoading(false); return; }
    fetchLinkPreview(url).then((p) => { setPreview(p); setLoading(false); });
  }, [text]);

  if (loading || !preview || !preview.url) return null;
  const cardBg = mine ? "rgba(255,255,255,0.08)" : t.surface;
  const borderColor = mine ? "rgba(255,255,255,0.12)" : t.border;
  return (
    <a href={preview.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ display: "block", marginTop: 6, borderRadius: 10, border: `1px solid ${borderColor}`, background: cardBg, overflow: "hidden", textDecoration: "none", color: "inherit", maxWidth: 260 }}>
      {preview.image && <img src={preview.image} alt="" style={{ width: "100%", height: 100, objectFit: "cover" }} />}
      <div style={{ padding: "7px 10px" }}>
        <div style={{ fontSize: 12 * textScale, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: mine ? t.bubbleMeText : t.text }}>{preview.title}</div>
        {preview.description && <div style={{ fontSize: 11 * textScale, opacity: 0.7, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2, color: mine ? t.bubbleMeText : t.text }}>{preview.description}</div>}
        <div style={{ fontSize: 10 * textScale, opacity: 0.5, marginTop: 2, color: mine ? t.bubbleMeText : t.textMuted }}>{new URL(preview.url).hostname}</div>
      </div>
    </a>
  );
}

function StatusTicks({ mine, deliveredTo = [], readBy = [], otherParticipants = [] }) {
  if (!mine) return null;
  const allRead = otherParticipants.length > 0 && otherParticipants.every((uid) => readBy.includes(uid));
  const allDelivered = otherParticipants.length > 0 && otherParticipants.every((uid) => deliveredTo.includes(uid));
  if (allRead) return <CheckCheck size={15} style={{ color: "#4FC3E8" }} />;
  if (allDelivered) return <CheckCheck size={15} style={{ opacity: 0.7 }} />;
  return <Check size={15} style={{ opacity: 0.7 }} />;
}

function TypingDots({ color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3, padding: "4px 0" }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{
          width: 6, height: 6, borderRadius: "50%", background: color || "rgba(255,255,255,0.85)",
          animation: `nextext-typing-bounce 1.2s ease-in-out ${i * 0.15}s infinite`,
        }} />
      ))}
    </div>
  );
}

function PollBubble({ t, mine, poll, myUid, onVote, textScale = 1 }) {
  const votesArr = Object.values(poll.votes || {});
  const total = votesArr.length;
  const myVote = poll.votes?.[myUid];
  return (
    <div style={{ minWidth: 220 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <BarChart2 size={14} /><span style={{ fontWeight: 700, fontSize: 13.5 * textScale }}>{poll.question}</span>
      </div>
      {poll.options.map((opt) => {
        const count = votesArr.filter((v) => v === opt.id).length;
        const pct = total ? Math.round((count / total) * 100) : 0;
        const isMine = myVote === opt.id;
        return (
          <div key={opt.id} onClick={() => onVote(opt.id)} style={{ position: "relative", marginBottom: 6, cursor: "pointer", borderRadius: 8, overflow: "hidden", border: `1.5px solid ${isMine ? (mine ? "rgba(255,255,255,0.6)" : t.primary) : (mine ? "rgba(255,255,255,0.25)" : t.border)}` }}>
            <div style={{ position: "absolute", inset: 0, width: `${pct}%`, background: mine ? "rgba(255,255,255,0.18)" : t.primaryLight, transition: "width 0.3s" }} />
            <div style={{ position: "relative", display: "flex", justifyContent: "space-between", padding: "7px 10px", fontSize: 12.5 }}>
              <span style={{ fontWeight: isMine ? 700 : 500 }}>{isMine && "✓ "}{opt.text}</span>
              <span style={{ opacity: 0.7 }}>{pct}%</span>
            </div>
          </div>
        );
      })}
      <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>{total} vote{total !== 1 ? "s" : ""}</div>
    </div>
  );
}

function PollCreateSheet({ t, onClose, onCreate }) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const valid = question.trim() && options.filter((o) => o.trim()).length >= 2;
  return (
    <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 55, display: "flex", alignItems: "flex-end" }} onClick={onClose}>
      <div style={{ background: t.surface, width: "100%", borderRadius: "18px 18px 0 0", padding: "18px 20px 22px", maxHeight: "80%", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
          <span style={{ fontWeight: 700, fontSize: 17, color: t.text }}>Create a poll</span>
          <X size={20} color={t.textMuted} onClick={onClose} style={{ cursor: "pointer" }} />
        </div>
        <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask a question" style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: `1px solid ${t.border}`, fontSize: 14.5, marginBottom: 10, boxSizing: "border-box" }} />
        {options.map((o, i) => (
          <input key={i} value={o} onChange={(e) => setOptions((opts) => opts.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Option ${i + 1}`} style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: `1px solid ${t.border}`, fontSize: 14, marginBottom: 8, boxSizing: "border-box" }} />
        ))}
        <div onClick={() => setOptions((o) => [...o, ""])} style={{ color: t.primary, fontSize: 13.5, fontWeight: 600, cursor: "pointer", marginBottom: 16 }}>+ Add option</div>
        <button disabled={!valid} onClick={() => onCreate(question, options.filter((o) => o.trim()))} style={{ width: "100%", padding: "13px", borderRadius: 12, border: "none", background: valid ? t.primary : t.border, color: valid ? t.bubbleMeText : t.textMuted, fontWeight: 700, fontSize: 15, cursor: valid ? "pointer" : "not-allowed" }}>
          Send poll
        </button>
      </div>
    </div>
  );
}

function VoicePlayer({ url, duration, mine, t }) {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration || 0);
  const [error, setError] = useState(false);
  const audioRef = useRef(null);
  const barRef = useRef(null);
  const dragging = useRef(false);

  const toggle = (e) => {
    e.stopPropagation();
    if (!audioRef.current) return;
    if (playing) audioRef.current.pause();
    else audioRef.current.play().catch(() => setError(true));
  };

  const seekTo = (fraction) => {
    if (!audioRef.current || !totalDuration) return;
    audioRef.current.currentTime = fraction * totalDuration;
    setCurrentTime(audioRef.current.currentTime);
  };

  const handleBarInteraction = (clientX) => {
    if (!barRef.current) return;
    const rect = barRef.current.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    seekTo(fraction);
  };

  const onBarPointerDown = (e) => {
    e.stopPropagation();
    e.preventDefault();
    dragging.current = true;
    handleBarInteraction(e.clientX || e.touches?.[0]?.clientX);
    const onMove = (ev) => { if (dragging.current) handleBarInteraction(ev.clientX || ev.touches?.[0]?.clientX); };
    const onUp = () => { dragging.current = false; document.removeEventListener("pointermove", onMove); document.removeEventListener("pointerup", onUp); };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  };

  const formatTime = (secs) => {
    const s = Math.floor(secs);
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, "0")}`;
  };

  const progress = totalDuration > 0 ? Math.min(currentTime / totalDuration, 1) : 0;
  const bars = [6, 12, 8, 16, 10, 14, 7, 11, 9, 15, 6, 13, 8, 12, 7, 10];

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 180 }} onClick={(e) => e.stopPropagation()}>
      <audio
        ref={audioRef}
        src={url}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => setError(true)}
        onLoadedMetadata={() => { if (audioRef.current) setTotalDuration(audioRef.current.duration || duration || 0); }}
        onTimeUpdate={() => { if (!dragging.current && audioRef.current) setCurrentTime(audioRef.current.currentTime); }}
      />
      <div onClick={toggle} style={{ width: 30, height: 30, borderRadius: "50%", background: mine ? "rgba(255,255,255,0.25)" : t.primaryLight, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
        {playing ? <Pause size={14} color={mine ? t.bubbleMeText : t.primary} /> : <Play size={14} color={mine ? t.bubbleMeText : t.primary} />}
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 2, height: 18 }}>
          {bars.map((h, i) => (
            <div key={i} style={{
              width: 2.5, borderRadius: 2,
              height: playing ? undefined : h,
              minHeight: playing ? 4 : undefined,
              background: mine ? "rgba(255,255,255,0.55)" : (t.textMuted + "99"),
              ...(playing ? {
                animation: `nextext-voice-bar 0.${4 + (i % 5)}s ease-in-out ${i * 0.04}s infinite alternate`,
              } : {}),
            }} />
          ))}
        </div>
        <div
          ref={barRef}
          onPointerDown={onBarPointerDown}
          style={{ position: "relative", height: 6, borderRadius: 3, background: mine ? "rgba(255,255,255,0.2)" : t.border, cursor: "pointer", touchAction: "none" }}
        >
          <div style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: `${progress * 100}%`, borderRadius: 3, background: mine ? "rgba(255,255,255,0.6)" : t.primary, transition: dragging.current ? "none" : "width 0.1s linear" }} />
          <div style={{ position: "absolute", top: -4, left: `calc(${progress * 100}% - 5px)`, width: 10, height: 10, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.3)", pointerEvents: "none" }} />
        </div>
      </div>
      <span style={{ fontSize: 10, opacity: 0.65, flexShrink: 0, minWidth: 30, textAlign: "right" }}>{error ? "⚠" : formatTime(currentTime)}</span>
    </div>
  );
}

function ScheduleSendSheet({ t, onClose, onSchedule }) {
  const [customValue, setCustomValue] = useState("");
  const presets = [
    { label: "In 1 hour", getDate: () => new Date(Date.now() + 60 * 60 * 1000) },
    { label: "Tomorrow morning (9 AM)", getDate: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d; } },
    { label: "Next week (same time)", getDate: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
  ];
  return (
    <div className="nextext-overlay-backdrop" style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 58, display: "flex", alignItems: "flex-end" }} onClick={onClose}>
      <div className="nextext-overlay-sheet" style={{ background: t.surface, width: "100%", borderRadius: "18px 18px 0 0", padding: "18px 20px 24px" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
          <span style={{ fontWeight: 700, fontSize: 17, color: t.text }}>Schedule message</span>
          <X size={20} color={t.textMuted} onClick={onClose} style={{ cursor: "pointer" }} />
        </div>
        {presets.map((p) => (
          <div key={p.label} onClick={() => onSchedule(p.getDate())} style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 4px", cursor: "pointer", borderBottom: `1px solid ${t.border}` }}>
            <span style={{ color: t.text, fontSize: 15 }}>{p.label}</span>
          </div>
        ))}
        <div style={{ paddingTop: 12 }}>
          <input type="datetime-local" value={customValue} onChange={(e) => setCustomValue(e.target.value)} style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: `1px solid ${t.border}`, fontSize: 14, marginBottom: 10, boxSizing: "border-box" }} />
          <button disabled={!customValue} onClick={() => onSchedule(new Date(customValue))} style={{ width: "100%", padding: 12, borderRadius: 10, border: "none", background: customValue ? t.primary : t.border, color: customValue ? t.bubbleMeText : t.textMuted, fontWeight: 700, cursor: customValue ? "pointer" : "not-allowed" }}>
            Schedule for this time
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ConversationScreen({ myUid, chatId: initialChatId, otherUid, contact, onBack, onOpenProfile, onOpenGroupInfo, openSettings = false, showScrollDownSetting = true, animatedScrollEntry = false }) {
  const { t, chatTextScale, setChatTextScale, composerHeight } = useTheme();
  const globalSettings = useGlobalSettings();
  const isGroup = !!contact?.isGroup;
  const [chatId, setChatId] = useState(initialChatId);
  const [input, setInput] = useState("");
  const [activeMsg, setActiveMsg] = useState(null);
  const [editingMsg, setEditingMsg] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [theyTyping, setTheyTyping] = useState(false);
  const [sendError, setSendError] = useState("");
  const [chatSetupError, setChatSetupError] = useState("");
  const [showAttach, setShowAttach] = useState(false);
  const [attachRendered, setAttachRendered] = useState(false);
  const [attachClosing, setAttachClosing] = useState(false);
  const [galleryActive, setGalleryActive] = useState(false);
  const openAttach = () => { setAttachClosing(false); setAttachRendered(true); setShowAttach(true); };
  const closeAttach = () => {
    if (!attachRendered) return;
    setAttachClosing(true);
    setTimeout(() => { setAttachRendered(false); setShowAttach(false); setAttachClosing(false); }, 150);
  };
  const [showPoll, setShowPoll] = useState(false);
  const [showOverflow, setShowOverflow] = useState(openSettings || false);

  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [chatMeta, setChatMeta] = useState(null);
  const [memberNames, setMemberNames] = useState({});
  const [isBlockedByMe, setIsBlockedByMe] = useState(false);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [wallpaper, setWallpaperState] = useState(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showCustomEmoji, setShowCustomEmoji] = useState(false);
  const [customEmoji, setCustomEmoji] = useState("");
  const [uploading, setUploading] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState(null);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [navInset, setNavInset] = useState(0);
  const [cameraFacing, setCameraFacing] = useState("environment");
  const [capturedPhotos, setCapturedPhotos] = useState([]);
  const [restrictions, setRestrictions] = useState(null);
  const [newMsgBadge, setNewMsgBadge] = useState(0);
  const [contactCardMember, setContactCardMember] = useState(null);
  const [myGroupNickname, setMyGroupNickname] = useState("");
  const [otherUserPhoto, setOtherUserPhoto] = useState(null);

  // Fallback: fetch the other user's profile photo directly from Firestore so
  // "View Profile Picture" always has the image even if the contact object is stale.
  useEffect(() => {
    if (isGroup || !otherUid || otherUid === myUid) { setOtherUserPhoto(null); return; }
    const unsub = onSnapshot(doc(db, "users", otherUid), (snap) => {
      const data = snap.exists() ? snap.data() : {};
      setOtherUserPhoto(data?.photoURL || null);
    });
    return unsub;
  }, [otherUid, myUid, isGroup]);

  useEffect(() => {
    getSystemInsets().then((insets) => setNavInset(insets.bottom || 0)).catch(() => {});
  }, []);

  const pinchEnabled = () => {
    try { return localStorage.getItem("nextext_pinch_zoom") === "true"; } catch { return false; }
  };

  const onMessagesTouchStart = (e) => {
    if (!pinchEnabled() || e.touches.length !== 2) { pinchStartRef.current = null; return; }
    const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    pinchStartRef.current = { dist: d, scale: chatTextScale };
  };

  const onMessagesTouchMove = (e) => {
    if (!pinchEnabled() || e.touches.length !== 2 || !pinchStartRef.current) return;
    const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    if (pinchStartRef.current.dist > 0) {
      const next = Math.min(1.6, Math.max(0.6, pinchStartRef.current.scale * (d / pinchStartRef.current.dist)));
      if (Math.abs(next - chatTextScale) >= 0.03) setChatTextScale(Math.round(next * 20) / 20);
    }
  };

  const onMessagesTouchEnd = () => { pinchStartRef.current = null; };

  // Read this user's per-group nickname override (if any).
  useEffect(() => {
    if (!myUid) return;
    const unsub = onSnapshot(doc(db, "users", myUid), (snap) => {
      const data = snap.exists() ? snap.data() : {};
      setMyGroupNickname(data?.groupNicknames?.[chatId] || "");
    });
    return unsub;
  }, [myUid, chatId]);
  const isFirstLoadRef = useRef(true);
  const isScrolledUpRef = useRef(false);
  const photoInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const cameraVideoRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const recordTimerRef = useRef(null);
  const wallpaperInputRef = useRef(null);
  const longPressTimer = useRef(null);
  const scrollRef = useRef(null);
  const composerRef = useRef(null);
  const composerBarRef = useRef(null);
  const pinchStartRef = useRef(null);
  const prevMessageCount = useRef(0);
  const typingClearTimer = useRef(null);
  const readTimer = useRef(null);
  const { messages: rawMessages } = useMessages(chatId, myUid);
  const messages = rawMessages || [];
  const { contacts: convoContacts } = useContacts(myUid);
  const acceptedContacts = (convoContacts || []).filter((c) => c.status === "accepted");
  const presence = usePresence(isGroup ? null : otherUid, myUid);
  const otherParticipants = isGroup
    ? (chatMeta?.participants || []).filter((p) => p !== myUid)
    : [otherUid];
  const otherStatuses = useStatuses(isGroup ? [] : [otherUid]);
  const hasOtherActiveStatus = otherStatuses.length > 0;
  const otherViewedMap = getStoredViewed();
  const otherStatusViewed = !!otherViewedMap[otherUid];

  useEffect(() => {
    if (chatId || isGroup) return;
    getOrCreateDirectChat(myUid, otherUid).then(setChatId).catch((e) => setChatSetupError("Couldn't open this chat: " + e.message));
  }, [myUid, otherUid, chatId, isGroup]);

  useEffect(() => {
    if (chatId) markChatRead(chatId, myUid);
  }, [chatId, myUid, messages.length]);

  // Typing indicator: re-checked on a running local clock (not just when
  // Firestore sends an update), so a heartbeat that's gone stale actually
  // clears instead of getting stuck showing "typing" forever.
  useEffect(() => {
    if (!chatId) return;
    const unsub = onSnapshot(doc(db, "chats", chatId), (snap) => {
      const data = snap.data();
      setChatMeta(data);
      evaluateTyping(data?.typingUsers || {});
    });
    return unsub;

    function evaluateTyping(typingMap) {
      clearTimeout(typingClearTimer.current);
      const others = Object.entries(typingMap).filter(([uid]) => uid !== myUid);
      const freshest = others.reduce((max, [, ts]) => Math.max(max, ts?.toMillis?.() || 0), 0);
      const age = Date.now() - freshest;
      if (freshest && age < 5000) {
        setTheyTyping(true);
        typingClearTimer.current = setTimeout(() => setTheyTyping(false), 5000 - age);
      } else {
        setTheyTyping(false);
      }
    }
  }, [chatId, myUid]);

  useEffect(() => () => clearTimeout(typingClearTimer.current), []);

  // Delivered fires immediately -- this chat's listener having the message
  // is a reasonable proxy for "the recipient's device has received it."
  useEffect(() => {
    if (chatId && messages.length) markMessagesDelivered(chatId, myUid, messages);
  }, [chatId, myUid, messages]);

  // Read fires after a short, deliberate delay so "delivered" is genuinely
  // visible for a moment first, rather than both states landing in the same
  // instant and looking like receipts jumped straight from sent to read.
  useEffect(() => {
    if (!chatId || !messages.length) return;
    clearTimeout(readTimer.current);
    const tryMarkRead = () => {
      if (document.visibilityState !== "visible") return;
      readTimer.current = setTimeout(() => markMessagesRead(chatId, myUid, messages), READ_DELAY_MS);
    };
    tryMarkRead();
    document.addEventListener("visibilitychange", tryMarkRead);
    return () => { document.removeEventListener("visibilitychange", tryMarkRead); clearTimeout(readTimer.current); };
  }, [chatId, myUid, messages]);

  useEffect(() => {
    if (!myUid) return;
    const unsub = onSnapshot(doc(db, "users", myUid), (snap) => {
      const data = snap.data();
      setRestrictions(data?.restrictions || null);
    });
    return unsub;
  }, [myUid]);

  // Only auto-scroll when a NEW message actually arrives (count increases),
  // not on every metadata change (reactions, read receipts, etc.) -- that
  // was the cause of the view constantly jumping back to the bottom.
  useEffect(() => {
    if (messages.length > prevMessageCount.current) {
      if (isFirstLoadRef.current) {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: animatedScrollEntry ? "smooth" : "instant" });
        isFirstLoadRef.current = false;
      } else if (isScrolledUpRef.current) {
        setNewMsgBadge((prev) => prev + (messages.length - prevMessageCount.current));
      } else {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
      }
    } else if (isFirstLoadRef.current && messages.length > 0) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: animatedScrollEntry ? "smooth" : "instant" });
      isFirstLoadRef.current = false;
    }
    prevMessageCount.current = messages.length;
  }, [messages, animatedScrollEntry]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const isUp = distanceFromBottom > 200;
    isScrolledUpRef.current = isUp;
    setShowScrollDown(isUp);
    if (!isUp) setNewMsgBadge(0);
  };

  const scrollToBottom = () => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    setNewMsgBadge(0);
  };

  useEffect(() => {
    if (!isGroup || !chatMeta?.participants) return;
    const missing = chatMeta.participants.filter((uid) => !(uid in memberNames));
    if (missing.length === 0) return;
    (async () => {
      const entries = await Promise.all(
        missing.map(async (uid) => {
          const snap = await getDoc(doc(db, "users", uid));
          return [uid, snap.data()?.displayName || snap.data()?.username || "Unknown"];
        })
      );
      setMemberNames((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    })();
  }, [isGroup, chatMeta?.participants, memberNames]);

  useEffect(() => {
    if (isGroup || !otherUid) return;
    const unsub = onSnapshot(doc(db, "users", myUid, "contacts", otherUid), (snap) => {
      setIsBlockedByMe(!!snap.data()?.blocked);
    });
    return unsub;
  }, [myUid, otherUid, isGroup]);

  useEffect(() => {
    if (chatId) setWallpaperState(getWallpaperForChat(chatId));
  }, [chatId]);

  const handleWallpaperUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !chatId) return;
    try {
      const dataUrl = await fileToWallpaperDataUrl(file);
      setWallpaperForChat(chatId, dataUrl);
      setWallpaperState(dataUrl);
    } catch (err) {
      setSendError("Couldn't set wallpaper: " + err.message);
    }
  };
  const clearWallpaper = () => {
    setWallpaperForChat(chatId, null);
    setWallpaperState(getWallpaperForChat(chatId)); // falls back to global if set
  };

  const autoResizeComposer = () => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 26 + composerHeight * 14)}px`;
  };

  useEffect(() => {
    autoResizeComposer();
  }, [composerHeight]);

  const handleInputChange = (val) => {
    setInput(val);
    autoResizeComposer();
    if (chatId) setTypingHeartbeat(chatId, myUid);
  };

  const send = async () => {
    if (!input.trim()) return;
    setSendError("");
    if (!chatId) { setSendError("Chat isn't ready yet — please wait a moment and try again."); return; }
    const textToSend = input.trim();
    setInput("");
    autoResizeComposer();
    try {
      await sendTextMessage(chatId, myUid, textToSend, otherParticipants, { replyTo: replyingTo });
      setReplyingTo(null);
      if (isGroup && shouldTriggerGroupAI(textToSend)) {
        const hasAI = (chatMeta?.participants || []).includes(AI_CONTACT_UID);
        if (hasAI) {
          sendGroupAIMessage(myUid, chatId, textToSend, messages).then(async (aiResponse) => {
            await addDoc(collection(db, "chats", chatId, "messages"), {
              senderId: AI_CONTACT_UID, senderName: "NexText AI", type: "text", text: aiResponse,
              mediaURL: null, mediaThumbURL: null, mediaDurationSeconds: null, mediaSizeBytes: null,
              mediaExpiresAt: null, mediaExpired: false, mediaSavedBy: [],
              fileName: null, fileExtension: null, fileSizeBytes: null,
              gifURL: null, gifSourceProvider: null,
              scheduledFor: null, isScheduled: false,
              sentAt: serverTimestamp(), deliveredTo: [], readBy: [],
              deletedForEveryone: false, deletedForSelf: [],
              editedAt: null, editHistory: [], editWindowExpiresAt: null,
              disappearing: null, screenshotDetected: false, replyTo: null,
              reactions: {}, poll: null, statusRef: null,
            });
            await updateDoc(doc(db, "chats", chatId), {
              lastMessage: { text: aiResponse.slice(0, 80), senderId: AI_CONTACT_UID, sentAt: serverTimestamp(), type: "text" },
            }).catch(() => {});
          }).catch(() => {});
        }
      }
    } catch (e) {
      setSendError("Message didn't send: " + e.message);
      setInput(textToSend);
    }
  };

  const sendScheduled = async (dateObj) => {
    setShowSchedule(false);
    if (!input.trim() || !chatId) return;
    const textToSend = input.trim();
    setInput("");
    autoResizeComposer();
    try {
      await sendTextMessage(chatId, myUid, textToSend, otherParticipants, { scheduledFor: dateObj });
    } catch (e) {
      setSendError("Couldn't schedule message: " + e.message);
      setInput(textToSend);
    }
  };

  const saveEdit = async () => {
    if (!editingMsg || !input.trim()) return;
    try { await editMessage(chatId, editingMsg.id, input.trim(), editingMsg.text); }
    catch (e) { setSendError("Couldn't edit: " + e.message); }
    setInput("");
    autoResizeComposer();
    setEditingMsg(null);
  };

  const handleReact = async (emoji) => {
    if (!chatId || !activeMsg) return;
    try { await reactToMessage(chatId, activeMsg.id, myUid, emoji); }
    catch (e) { setSendError("Couldn't react: " + e.message); }
    setActiveMsg(null);
  };

  const handleCopyText = useCallback(() => {
    if (!activeMsg?.text) return;
    navigator.clipboard?.writeText(activeMsg.text).catch(() => {});
    setActiveMsg(null);
  }, [activeMsg]);

  const handleReply = () => {
    if (!activeMsg) return;
    setReplyingTo({
      messageId: activeMsg.id,
      senderId: activeMsg.senderId,
      previewText: activeMsg.text || (activeMsg.type === "poll" ? "📊 " + (activeMsg.poll?.question || "Poll") : ""),
      previewType: activeMsg.type,
    });
    setActiveMsg(null);
  };

  const handleEdit = () => { if (!activeMsg) return; setEditingMsg(activeMsg); setInput(activeMsg.text || ""); setActiveMsg(null); setTimeout(autoResizeComposer, 0); };
  const handleDeleteSelf = async () => { if (!chatId || !activeMsg) return; try { await deleteMessageForSelf(chatId, activeMsg.id, myUid); } catch { /* silent */ } setActiveMsg(null); };
  const handleDeleteEveryone = async () => { if (!chatId || !activeMsg) return; try { await deleteMessageForEveryone(chatId, activeMsg.id); } catch { /* silent */ } setActiveMsg(null); };

  const createPoll = async (question, opts) => {
    try { await sendPollMessage(chatId, myUid, question, opts); }
    catch (e) { setSendError("Couldn't send poll: " + e.message); }
    setShowPoll(false); closeAttach();
    if (isGroup && (chatMeta?.participants || []).includes(AI_CONTACT_UID)) {
      setTimeout(async () => {
        try {
          const latest = messages[messages.length - 1];
          if (!latest?.poll) return;
          const opts = latest.poll.options;
          if (opts && opts.length > 0) {
            const randomIdx = Math.floor(Math.random() * opts.length);
            await voteOnPoll(chatId, latest.id, AI_CONTACT_UID, opts[randomIdx].id);
          }
        } catch { /* silent */ }
      }, 2000);
    }
  };

  const handleVote = async (msg, optionId) => {
    try { await voteOnPoll(chatId, msg.id, myUid, optionId); }
    catch (e) { setSendError("Couldn't vote: " + e.message); }
  };

  const handlePhotoOrVideoPick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again later
    if (!file || !chatId) { setGalleryActive(false); return; }
    setSendError("");
    setUploading(true);
    try {
      const isImage = file.type.startsWith("image/");
      const result = await uploadChatFile(chatId, myUid, file, { compress: isImage });
      await sendMediaMessage(chatId, myUid, isImage ? "image" : "video", result, otherParticipants, { replyTo: replyingTo });
      setReplyingTo(null);
    } catch (err) {
      if (err instanceof FileTooLargeError) setSendError("Files must be under 50MB.");
      else setSendError("Couldn't send: " + err.message);
    }
    setUploading(false);
    setGalleryActive(false);
    closeAttach();
  };

  const handleFilePick = async (e) => {    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !chatId) return;
    setSendError("");
    setUploading(true);
    try {
      const result = await uploadChatFile(chatId, myUid, file);
      await sendMediaMessage(chatId, myUid, "file", result, otherParticipants, { replyTo: replyingTo });
      setReplyingTo(null);
    } catch (err) {
      if (err instanceof FileTooLargeError) setSendError("Files must be under 50MB.");
      else setSendError("Couldn't send: " + err.message);
    }
    setUploading(false);
    closeAttach();
  };

  const getMicrophoneStream = async (constraints) => {
    // The Android WebView caches a "denied" answer for the page session even
    // after the user grants the permission in system settings, and the first
    // audio-capture start after launch (or right after the OS grant) can
    // transiently fail with NotReadableError ("Could not start audio source").
    //
    // Deep fixes applied here:
    //   1. A "priming" acquire+release right before the real capture. Many
    //      Android devices only free the previous AudioRecord/input state after
    //      one full (even failed) open+close cycle, so the second open works.
    //   2. The priming (and the default first attempt) uses AEC/noise/AGC
    //      DISABLED. Some devices cannot route the mic through the
    //      echo-cancelling audio processing chain and report NotReadableError
    //      on the default constraints, while the raw-input variant succeeds.
    //   3. Retry targeting the explicit physical audioinput deviceId. The
    //      virtual "default" device is sometimes busy/blocked while the real
    //      device id is available. Device ids only become visible after the
    //      origin has been granted media permission, so we enumerate AFTER the
    //      priming step (never before).
    //   4. Generous delays between attempts so the OS/WebView media stack can
    //      fully release the input between tries.
    //   5. A settle delay after any native permission request so the WebView
    //      media stack has registered the OS grant before the first capture.
    // Stop any lingering stream first: an un-released AudioTrack from a
    // previous capture can keep the input busy and cause NotReadableError.
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((tr) => tr.stop());
      cameraStreamRef.current = null;
    }
    if (mediaRecorderRef.current) {
      try { if (mediaRecorderRef.current.state !== "inactive") mediaRecorderRef.current.stop(); } catch {}
      mediaRecorderRef.current = null;
    }

    const isMic = !constraints?.video;
    const base = constraints || { audio: true };
    const RETRYABLE = ["NotAllowedError", "PermissionDeniedError", "NotReadableError", "TrackStartError", "AbortError"];
    const attempts = [];
    const push = (delay, c) => attempts.push({ delay, constraints: c });

    // Settle so the WebView media stack sees the OS-level grant that was just
    // confirmed by the native permission request in startVoiceRecording.
    if (isMic) await new Promise((r) => setTimeout(r, 400));

    // Prime with the raw-input variant and release immediately so the device
    // state is fresh for the real capture below.
    if (isMic) {
      try {
        const primeStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
        primeStream.getTracks().forEach((tr) => tr.stop());
      } catch {}
      await new Promise((r) => setTimeout(r, 300));
    }

    // Capture the physical input deviceId AFTER priming — ids are blank until
    // the origin has media permission.
    let physicalInputId = null;
    if (isMic) {
      try {
        const devs = await navigator.mediaDevices.enumerateDevices();
        const input = devs.find((d) => d.kind === "audioinput" && d.deviceId);
        if (input?.deviceId) physicalInputId = input.deviceId;
      } catch {}
    }

    push(0, isMic ? { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } } : base);
    push(700, base);
    if (physicalInputId) {
      push(1500, { audio: { deviceId: { exact: physicalInputId } } });
      push(2200, { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, deviceId: { exact: physicalInputId } } });
    } else {
      push(1500, { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    }
    push(2800, base);

    let firstError = null;
    for (const attempt of attempts) {
      if (attempt.delay > 0) await new Promise((r) => setTimeout(r, attempt.delay));
      try {
        return await navigator.mediaDevices.getUserMedia(attempt.constraints);
      } catch (err) {
        firstError = firstError || err;
        if (!RETRYABLE.includes(err.name)) throw err;
      }
    }

    // Last resort: one more attempt with a freshly enumerated deviceId, in
    // case the id only became available after the earlier attempts failed.
    if (isMic) {
      try {
        const devs = await navigator.mediaDevices.enumerateDevices();
        const input = devs.find((d) => d.kind === "audioinput" && d.deviceId);
        if (input?.deviceId) {
          try {
            return await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: input.deviceId } } });
          } catch (err) {
            firstError = firstError || err;
            if (!RETRYABLE.includes(err.name)) throw err;
          }
        }
      } catch {}
    }

    firstError.isDenied = firstError.name === "NotAllowedError" || firstError.name === "PermissionDeniedError";
    throw firstError;
  };

  const getMicDiagnostics = async (err) => {
    const parts = ["mic diag"];
    try {
      parts.push(`name=${err?.name || "?"}`);
      parts.push(`msg=${(err?.message || "").slice(0, 80)}`);
    } catch { parts.push("name=?"); }
    try {
      const perms = await navigator.permissions?.query?.({ name: "microphone" }).catch(() => null);
      parts.push(`perm=${perms?.state || "unknown"}`);
    } catch { parts.push("perm=unknown"); }
    try {
      const inputs = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = inputs.filter((d) => d.kind === "audioinput");
      const ids = audioInputs.map((d) => (d.deviceId ? "id" : "blank"));
      parts.push(`audioInputs=${audioInputs.length}(${ids.join(",")})`);
    } catch { parts.push("audioInputs=?"); }
    parts.push(`gUM=${typeof navigator.mediaDevices?.getUserMedia === "function" ? "yes" : "no"}`);
    // Native probe: does the OS-level mic actually open? This distinguishes a
    // broken WebView media path (native works) from a device/OS mic problem
    // (native also fails). Runs only on the Capacitor native build.
    if (window.Capacitor?.isNativePlatform && window.Capacitor.isNativePlatform() && typeof window.NextextNative?.testMicrophone === "function") {
      try {
        const probe = await window.NextextNative.testMicrophone();
        parts.push(`osGranted=${probe?.osGranted}`);
        parts.push(`nativeProbe=${probe?.works ? "ok" : "fail"}`);
        if (!probe?.works) parts.push(`nativeErr=${(probe?.reason || "").slice(0, 60)}`);
      } catch { parts.push("nativeProbe=?"); }
    }
    return parts.join(" | ");
  };

  const startVoiceRecording = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setSendError("Voice recording is not supported on this browser or device.");
        return;
      }
      if (window.Capacitor?.isNativePlatform && window.Capacitor.isNativePlatform()) {
        try {
          const perm = await NextextNative.requestMicrophone();
          if (perm && perm.granted === false) {
            setSendError("Microphone permission is off. Tap Settings in your device for NexText, allow Microphone, then press the mic button again.");
            return;
          }
        } catch { /* fall through to WebView permission flow */ }
      }
      const stream = await getMicrophoneStream();
      recordedChunksRef.current = [];
      let mimeType = "audio/webm";
      if (!MediaRecorder.isTypeSupported("audio/webm")) {
        mimeType = "audio/webm;codecs=opus";
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = "audio/ogg;codecs=opus";
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = "";
          }
        }
      }
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
      setRecordSeconds(0);
      recordTimerRef.current = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    } catch (err) {
      let msg = "Microphone access denied or unavailable. Please check your device settings and ensure microphone permission is granted for NexText, then try again.";
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        msg = "Microphone permission is off. Tap Settings in your device for NexText, allow Microphone, then press the mic button again. If it still fails, restart the app.";
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        msg = "No microphone found. Please connect a microphone and try again.";
      } else if (err.name === "NotReadableError" || err.name === "TrackStartError" || err.originalName === "NotReadableError" || err.originalName === "TrackStartError") {
        msg = "The microphone is busy or unavailable. Please close other apps using the microphone and try again. If it still fails, restart the app.";
      }
      // Append concise device diagnostics so failures can be pinpointed from
      // the exact message the user reports back.
      try {
        const diag = await getMicDiagnostics(err);
        msg += ` (${diag})`;
      } catch { /* diagnostics are best-effort */ }
      setSendError(msg);
    }
  };

  const stopVoiceRecording = async (send) => {
    clearInterval(recordTimerRef.current);
    const recorder = mediaRecorderRef.current;
    if (!recorder) { setRecording(false); return; }
    const finalDuration = recordSeconds;
    await new Promise((resolve) => {
      recorder.onstop = resolve;
      recorder.stop();
      recorder.stream.getTracks().forEach((tr) => tr.stop());
    });
    setRecording(false);
    setRecordSeconds(0);
    if (!send || finalDuration === 0 || !chatId) return;
    const blob = new Blob(recordedChunksRef.current, { type: "audio/webm" });
    const file = new File([blob], `voice-${Date.now()}.webm`, { type: "audio/webm" });
    setUploading(true);
    try {
      const result = await uploadChatFile(chatId, myUid, file);
      await sendMediaMessage(chatId, myUid, "voice", result, otherParticipants, { durationSeconds: finalDuration });
    } catch (err) {
      if (err instanceof FileTooLargeError) setSendError("Voice note too large (over 50MB).");
      else setSendError("Couldn't send voice note: " + err.message);
    }
    setUploading(false);
  };

  const openCamera = async () => {
    closeAttach();
    setCameraError("");
    try {
      const stream = await getMicrophoneStream({ video: { facingMode: cameraFacing } });
      cameraStreamRef.current = stream;
      setShowCamera(true);
      setTimeout(() => {
        if (cameraVideoRef.current) {
          cameraVideoRef.current.srcObject = stream;
          cameraVideoRef.current.play().catch(() => {});
        }
      }, 100);
    } catch {
      setCameraError("Camera access denied or unavailable. Allow Camera for NexText in your device settings, then try again.");
    }
  };

  const flipChatCamera = async () => {
    const next = cameraFacing === "environment" ? "user" : "environment";
    try {
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((tr) => tr.stop());
        cameraStreamRef.current = null;
      }
      setCameraFacing(next);
      const stream = await getMicrophoneStream({ video: { facingMode: next } });
      cameraStreamRef.current = stream;
      if (cameraVideoRef.current) {
        cameraVideoRef.current.srcObject = stream;
        cameraVideoRef.current.play().catch(() => {});
      }
    } catch {
      setCameraFacing((f) => (f === "environment" ? "user" : "environment"));
      setCameraError("Couldn't switch camera. Check the Camera permission in your device settings.");
    }
  };

  const capturePhoto = async () => {
    if (!cameraVideoRef.current || !chatId) return;
    const video = cameraVideoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const file = new File([blob], `camera-${Date.now()}.jpg`, { type: "image/jpeg" });
      const thumbnailUrl = URL.createObjectURL(blob);
      setCapturedPhotos((prev) => [...prev, { file, thumbnailUrl, sending: false }]);
    }, "image/jpeg", 0.92);
  };

  const closeCamera = () => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((tr) => tr.stop());
      cameraStreamRef.current = null;
    }
    setCapturedPhotos([]);
    setShowCamera(false);
  };

  const scrollToTop = () => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });

  const isSelfChat = otherUid === myUid;
  const isMuted = chatMeta?.mutedBy?.[myUid] && (chatMeta.mutedBy[myUid] === "forever" || chatMeta.mutedBy[myUid]?.toMillis?.() > Date.now());
  const isFavorite = chatMeta?.favoritedBy?.includes(myUid);
  const isLocked = chatMeta?.lockedBy?.[myUid];

  const visibleMessages = searchQuery.trim()
    ? messages.filter((m) => m.text?.toLowerCase().includes(searchQuery.toLowerCase()))
    : messages;

  const replyToSenderName = (senderId) => {
    if (senderId === myUid) return "You";
    if (isGroup) return memberNames[senderId] || "…";
    return contact?.profile?.displayName || "…";
  };

  const renderBubble = (m) => {
    const expiryText = getMediaExpiryText(m.sentAt, globalSettings?.mediaExpiryDays);
    if (m.deletedForEveryone) return <div style={{ fontSize: 13, fontStyle: "italic", opacity: 0.6 }}>This message was deleted</div>;
    if (m.type === "poll") return <PollBubble t={t} mine={m.senderId === myUid} poll={m.poll} myUid={myUid} onVote={(optId) => handleVote(m, optId)} textScale={chatTextScale} />;

    if (["image", "video", "voice", "file"].includes(m.type) && isMediaExpired(m, globalSettings?.mediaExpiryDays)) {
      const ExpiredIcon = m.type === "image" ? ImageOff : m.type === "video" ? VideoOff : m.type === "voice" ? MicOff : FileX;
      return (
        <div>
          <StatusReplyBlock statusRef={m.statusRef} mine={m.senderId === myUid} t={t} />
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 10, background: m.senderId === myUid ? "rgba(255,255,255,0.12)" : t.primaryLight }}>
            <ExpiredIcon size={16} color={t.textMuted} />
            <span style={{ fontSize: 13, fontStyle: "italic", color: t.textMuted }}>Expired</span>
          </div>
        </div>
      );
    }

    // Parental controls: intercept incoming blocked media before it renders.
    if (restrictions && m.senderId !== myUid) {
      const blockMedia = restrictions.blockMedia || restrictions.blockIncomingPhotos || restrictions.blockIncomingVideos;
      const isBlockedMedia =
        (m.type === "image" && (restrictions.blockMedia || restrictions.blockIncomingPhotos)) ||
        (m.type === "video" && (restrictions.blockMedia || restrictions.blockIncomingVideos)) ||
        (m.type === "voice" && restrictions.blockVoiceNotes) ||
        (m.type === "file" && (restrictions.blockMedia || restrictions.blockIncomingPhotos || restrictions.blockIncomingVideos));
      if (isBlockedMedia || (blockMedia && (m.type === "image" || m.type === "video"))) {
        return (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 10, background: "#FFE5E5", color: "#B00020", fontSize: 13.5, fontWeight: 600 }}>
            <Lock size={15} />
            <span>[Blocked by parental controls]</span>
          </div>
        );
      }
    }

    const { text: displayText, blocked } = filterTextByParentalControls(m.text, restrictions?.customFilterLists);

    if (m.type === "image") return (
      <div>
        <StatusReplyBlock statusRef={m.statusRef} mine={m.senderId === myUid} t={t} />
        <div onClick={(e) => { e.stopPropagation(); setFullscreenImage(m.mediaURL); }} style={{ cursor: "pointer", width: 220, height: 220, overflow: "hidden", borderRadius: 8, background: "rgba(0,0,0,0.05)" }}>
          <img src={m.mediaURL} alt="Sent photo" className="nx-media-img" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        </div>
        {expiryText && <div style={{ fontSize: 10, opacity: 0.55, marginTop: 3, fontStyle: "italic" }}>{expiryText}</div>}
      </div>
    );
    if (m.type === "video") return (
      <div>
        <StatusReplyBlock statusRef={m.statusRef} mine={m.senderId === myUid} t={t} />
          <div style={{ width: 220, height: 220, overflow: "hidden", borderRadius: 8, background: "rgba(0,0,0,0.05)", position: "relative" }}>
            <video src={m.mediaURL} controls className="nx-media-img" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          </div>
        {expiryText && <div style={{ fontSize: 10, opacity: 0.55, marginTop: 3, fontStyle: "italic" }}>{expiryText}</div>}
      </div>
    );
    if (m.type === "voice") return (
      <div>
        <StatusReplyBlock statusRef={m.statusRef} mine={m.senderId === myUid} t={t} />
        <VoicePlayer url={m.mediaURL} duration={m.mediaDurationSeconds} mine={m.senderId === myUid} t={t} />
        {expiryText && <div style={{ fontSize: 10, opacity: 0.55, marginTop: 2, fontStyle: "italic" }}>{expiryText}</div>}
      </div>
    );
    if (m.type === "file") return (
      <div>
        <StatusReplyBlock statusRef={m.statusRef} mine={m.senderId === myUid} t={t} />
        <a href={m.mediaURL} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit" }}>
          <FileText size={26} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5 * chatTextScale, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>{m.fileName || "File"}</div>
            <div style={{ fontSize: 11 * chatTextScale, opacity: 0.7 }}>{m.fileSizeBytes ? `${(m.fileSizeBytes / 1024 / 1024).toFixed(1)} MB` : ""}</div>
          </div>
        </a>
        {expiryText && <div style={{ fontSize: 10, opacity: 0.55, marginTop: 2, fontStyle: "italic" }}>{expiryText}</div>}
      </div>
    );
    return (
      <div>
        <StatusReplyBlock statusRef={m.statusRef} mine={m.senderId === myUid} t={t} />
        <div style={{ fontSize: 14.5 * chatTextScale, lineHeight: 1.35, color: blocked ? "#FF3B30" : undefined, fontStyle: blocked ? "italic" : undefined }}>
          {m.isScheduled && m.scheduledFor && m.scheduledFor.toMillis?.() > Date.now() && (
            <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 3, fontStyle: "italic" }}>
              ⏱ Scheduled for {m.scheduledFor.toDate ? m.scheduledFor.toDate().toLocaleString() : ""}
            </div>
          )}
          {displayText || m.text}
          {m.editedAt && !blocked && <span style={{ fontSize: 10, opacity: 0.55, marginLeft: 4 }}>edited</span>}
          {isLinkPreviewEnabled() && !blocked && <LinkPreviewCard text={m.text} mine={m.senderId === myUid} t={t} textScale={chatTextScale} />}
        </div>
      </div>
    );
  };

  return (
    <div className="nx-screen" style={{ position: "absolute", inset: 0, background: t.bg, zIndex: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "calc(14px + var(--safe-top)) 12px 14px", background: "#111B21", position: "relative", flexShrink: 0 }}>
        <ChevronLeft size={22} color="#fff" onClick={onBack} style={{ cursor: "pointer" }} />
        <div onClick={onOpenProfile} style={{ cursor: "pointer" }}>
          {isGroup && chatMeta?.groupPhotoURL ? (
            <img src={chatMeta.groupPhotoURL} alt="" style={{ width: 38, height: 38, borderRadius: "50%", objectFit: "cover", cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); setFullscreenImage(chatMeta.groupPhotoURL); }} />
          ) : (
            <Avatar
              photoURL={isGroup ? null : (contact?.profile?.photoURL || otherUserPhoto)}
              name={isGroup ? "👥" : (contact?.profile?.displayName || "…")}
              uid={isGroup ? null : otherUid}
              size={38}
              hasActiveStatus={!isGroup && hasOtherActiveStatus}
              statusViewed={otherStatusViewed}
              onViewProfile={onOpenProfile}
              onViewPicture={() => { const effective = getLocalPhotoOverride(otherUid) || contact?.profile?.photoURL || otherUserPhoto; if (effective) setFullscreenImage(effective); }}
            />
          )}
        </div>
          <div onClick={onOpenProfile} style={{ flex: 1, cursor: "pointer" }}>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 16, display: "flex", alignItems: "center", gap: 6 }}>
            {isSelfChat ? "Message Yourself" : isGroup ? (myGroupNickname || contact?.groupName || chatMeta?.groupName || "Group") : (contact?.profile?.displayName || "…")}
            {isLocked && <Lock size={13} color="rgba(255,255,255,0.8)" />}
            {isMuted && <BellOff size={13} color="rgba(255,255,255,0.7)" />}
          </div>
          <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 12, minHeight: 16 }}>
            {theyTyping ? "typing…" : isGroup ? (
              `${chatMeta?.participants?.length || "…"} members`
            ) : isSelfChat ? "Your private space" : !presence.visible ? "" : presence.isOnline ? "online" : formatLastSeen(presence.lastSeen)}
          </div>
        </div>
        <Search size={19} color="#fff" style={{ cursor: "pointer", marginRight: 4 }} onClick={() => setShowSearch(!showSearch)} />
        <MoreVertical size={19} color="#fff" style={{ cursor: "pointer" }} onClick={() => setShowOverflow(!showOverflow)} />

        {showOverflow && (
          <>
          <div onClick={() => setShowOverflow(false)} style={{ position: "fixed", inset: 0, zIndex: 39 }} />
          <div style={{ position: "absolute", top: 52, right: 10, background: t.surface, borderRadius: 12, boxShadow: "0 4px 20px rgba(0,0,0,0.25)", overflow: "hidden", zIndex: 40, minWidth: 190 }}>
            <div onClick={() => { scrollToTop(); setShowOverflow(false); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", cursor: "pointer" }}>
              <ArrowUp size={16} color={t.text} />
              <span style={{ fontSize: 14, color: t.text }}>Go to top</span>
            </div>
            <div onClick={() => { scrollToBottom(); setShowOverflow(false); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", cursor: "pointer", borderTop: `1px solid ${t.border}` }}>
              <ArrowDown size={16} color={t.text} />
              <span style={{ fontSize: 14, color: t.text }}>Go to bottom</span>
            </div>
            {isGroup && onOpenGroupInfo && (
              <div onClick={() => { setShowOverflow(false); onOpenGroupInfo({ id: chatId, groupName: chatMeta?.groupName }); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", cursor: "pointer", borderTop: `1px solid ${t.border}` }}>
                <Users size={16} color={t.text} />
                <span style={{ fontSize: 14, color: t.text }}>Group Info</span>
              </div>
            )}
            <div onClick={async () => { if (isMuted) await clearMute(chatId, myUid); else await setMute(chatId, myUid, "forever"); setShowOverflow(false); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", cursor: "pointer", borderTop: `1px solid ${t.border}` }}>
              {isMuted ? <Bell size={16} /> : <BellOff size={16} />}
              <span style={{ fontSize: 14, color: t.text }}>{isMuted ? "Unmute" : "Mute"}</span>
            </div>
            <div onClick={async () => { await toggleFavorite(chatId, myUid, isFavorite); setShowOverflow(false); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", cursor: "pointer", borderTop: `1px solid ${t.border}` }}>
              <Star size={16} fill={isFavorite ? t.accent : "none"} color={isFavorite ? t.accent : t.text} />
              <span style={{ fontSize: 14, color: t.text }}>{isFavorite ? "Remove from Favorites" : "Add to Favorites"}</span>
            </div>
            <div onClick={() => { wallpaperInputRef.current?.click(); setShowOverflow(false); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", cursor: "pointer", borderTop: `1px solid ${t.border}` }}>
              <span style={{ fontSize: 14, color: t.text }}>Set chat background…</span>
            </div>
            {wallpaper && (
              <div onClick={() => { clearWallpaper(); setShowOverflow(false); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", cursor: "pointer", borderTop: `1px solid ${t.border}` }}>
                <span style={{ fontSize: 14, color: "#FF3B30" }}>Remove background</span>
              </div>
            )}
            <div onClick={async () => { await toggleLocked(chatId, myUid, !!isLocked); setShowOverflow(false); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", cursor: "pointer" }}>
              <Lock size={16} color={isLocked ? t.accent : t.text} />
              <span style={{ fontSize: 14, color: isLocked ? t.accent : t.text }}>{isLocked ? "Unlock chat" : "Lock chat"}</span>
            </div>
            <div onClick={async () => { await toggleArchive(chatId, myUid, false); setShowOverflow(false); onBack(); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", cursor: "pointer", borderTop: `1px solid ${t.border}` }}>
              <Archive size={16} color={t.text} />
              <span style={{ fontSize: 14, color: t.text }}>Archive chat</span>
            </div>

            <div onClick={async () => { if (window.confirm("Are you sure? This will permanently delete this chat history forever.")) { await deleteChatCompletely(chatId).catch(() => {}); setShowOverflow(false); onBack(); } }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", cursor: "pointer" }}>
              <Trash2 size={16} color="#FF3B30" />
              <span style={{ fontSize: 14, color: "#FF3B30" }}>Delete chat</span>
            </div>
          </div>
          </>
        )}
        <input ref={wallpaperInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleWallpaperUpload} />
      </div>

      {showSearch && (
        <div style={{ padding: "8px 12px", background: t.surface, borderBottom: `1px solid ${t.border}` }}>
          <div style={{ display: "flex", alignItems: "center", background: t.bg, borderRadius: 10, padding: "8px 12px", gap: 8 }}>
            <Search size={14} color={t.textMuted} />
            <input autoFocus value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search in this chat…" style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 13.5, color: t.text }} />
            {searchQuery && <X size={14} color={t.textMuted} onClick={() => setSearchQuery("")} style={{ cursor: "pointer" }} />}
          </div>
          {searchQuery && <div style={{ fontSize: 11.5, color: t.textMuted, marginTop: 6 }}>{visibleMessages.length} match{visibleMessages.length !== 1 ? "es" : ""}</div>}
        </div>
      )}

      {chatSetupError && <div style={{ padding: "8px 16px", background: "#FFE5E5", color: "#B00020", fontSize: 12.5 }}>{chatSetupError}</div>}
      {sendError && <div style={{ padding: "8px 16px", background: "#FFE5E5", color: "#B00020", fontSize: 12.5 }}>{sendError}</div>}

      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", position: "relative" }}>
        <div ref={scrollRef} onScroll={handleScroll} onTouchStart={onMessagesTouchStart} onTouchMove={onMessagesTouchMove} onTouchEnd={onMessagesTouchEnd} style={{
          flex: 1, overflowY: "auto", overflowX: "hidden", padding: "14px 10px", display: "flex", flexDirection: "column",
          touchAction: pinchEnabled() ? "pan-y" : "auto",
          backgroundImage: wallpaper ? `url(${wallpaper})` : "none", backgroundSize: "cover", backgroundPosition: "center",
        }}>
          {visibleMessages.map((m, i) => {
            const prev = visibleMessages[i - 1];
            const next = visibleMessages[i + 1];
            const groupedWithPrev = prev && prev.senderId === m.senderId && !prev.deletedForEveryone;
            const groupedWithNext = next && next.senderId === m.senderId && !next.deletedForEveryone;
            const isMine = m.senderId === myUid;
            const mDate = m.sentAt?.toDate ? m.sentAt.toDate() : null;
            const prevDate = prev?.sentAt?.toDate ? prev.sentAt.toDate() : null;
            const newDay = mDate && (!prevDate || prevDate.toDateString() !== mDate.toDateString());
            return (
            <React.Fragment key={m.id}>
              {newDay && (
                <div style={{ display: "flex", justifyContent: "center", margin: "16px 0 4px", flexShrink: 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: t.textMuted, background: t.surface, border: `1px solid ${t.border}`, borderRadius: 12, padding: "4px 12px", boxShadow: "0 1px 2px rgba(0,0,0,0.08)", textTransform: "capitalize" }}>{formatDayLabel(mDate)}</span>
                </div>
              )}
              <div className="nextext-message-in" style={{ display: "flex", justifyContent: isMine ? "flex-end" : "flex-start", marginTop: groupedWithPrev ? 2 : 12 }}>
                <div onClick={() => !m.deletedForEveryone && setActiveMsg(m)} style={{
                  position: "relative", maxWidth: "74%", padding: "8px 12px", cursor: "pointer", boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
                  background: isMine ? t.bubbleMe : t.bubbleThem, color: isMine ? t.bubbleMeText : t.bubbleThemText,
                  borderRadius: `${groupedWithPrev ? 6 : 14}px ${groupedWithPrev ? 6 : 14}px ${groupedWithNext ? 6 : 14}px ${groupedWithNext ? 6 : 14}px`,
                }}>
                  {isGroup && !isMine && !groupedWithPrev && (
                    <div onClick={(e) => { e.stopPropagation(); const memberInfo = { uid: m.senderId, name: m.senderName || memberNames[m.senderId] || "…" }; setContactCardMember(memberInfo); }} style={{ fontSize: 12, fontWeight: 700, color: t.primary, marginBottom: 2, cursor: "pointer" }}>{m.senderName || memberNames[m.senderId] || "…"}</div>
                  )}
                  {m.replyTo && (
                  <div style={{ background: m.senderId === myUid ? "rgba(255,255,255,0.15)" : t.primaryLight, borderLeft: `3px solid ${m.senderId === myUid ? "rgba(255,255,255,0.6)" : t.primary}`, borderRadius: 6, padding: "5px 8px", marginBottom: 6, fontSize: 12 }}>
                    <div style={{ fontWeight: 700, opacity: 0.85, fontSize: 11, marginBottom: 1 }}>
                      {replyToSenderName(m.replyTo.senderId)}
                    </div>
                    <div style={{ opacity: 0.75, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.replyTo.previewText}</div>
                  </div>
                )}
                {renderBubble(m)}
                <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 4, marginTop: 3 }}>
                  <span style={{ fontSize: 10.5, opacity: 0.65 }}>
                    {m.sentAt?.toDate ? m.sentAt.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "sending…"}
                  </span>
                  <StatusTicks mine={m.senderId === myUid} deliveredTo={m.deliveredTo} readBy={m.readBy} otherParticipants={otherParticipants} />
                </div>
                {m.reactions && Object.keys(m.reactions).length > 0 && (
                  <div style={{ display: "flex", gap: 3, marginTop: 3, justifyContent: isMine ? "flex-end" : "flex-start" }}>
                    <div style={{ display: "flex", gap: 3, background: t.surface, border: `1px solid ${t.border}`, borderRadius: 10, padding: "2px 5px", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }}>
                      {Object.values(m.reactions).map((e, i) => <span key={i} style={{ fontSize: 12 }}>{e}</span>)}
                    </div>
                  </div>
                )}
              </div>
            </div>
            </React.Fragment>
            );
          })}
          {theyTyping && (
            <div className="nextext-message-in" style={{ display: "flex", justifyContent: "flex-start" }}>
              <div style={{ padding: "10px 14px", borderRadius: 14, background: t.bubbleThem, boxShadow: "0 1px 2px rgba(0,0,0,0.08)" }}>
                <TypingDots color={t.textMuted} />
              </div>
            </div>
          )}
        </div>

        {showScrollDownSetting && showScrollDown && (
          <button onClick={scrollToBottom} style={{ position: "absolute", left: "50%", bottom: 12, transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 6, padding: newMsgBadge > 0 ? "8px 16px" : "0", height: newMsgBadge > 0 ? "auto" : 36, borderRadius: newMsgBadge > 0 ? 18 : "50%", border: `1px solid ${t.border}`, background: newMsgBadge > 0 ? t.primary : t.surface, cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.18)", transition: "all 0.2s" }}>
            {newMsgBadge > 0 ? (
              <>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: "#fff" }}>{newMsgBadge} new message{newMsgBadge > 1 ? "s" : ""} 👇</span>
              </>
            ) : (
              <ArrowDown size={17} color={t.primary} />
            )}
          </button>
        )}
      </div>

      {replyingTo && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", background: t.surface, borderTop: `1px solid ${t.border}` }}>
          <CornerUpLeft size={16} color={t.primary} />
          <div style={{ flex: 1, fontSize: 12, color: t.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{replyingTo.previewText}</div>
          <X size={16} color={t.textMuted} onClick={() => setReplyingTo(null)} style={{ cursor: "pointer" }} />
        </div>
      )}
      {editingMsg && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", background: t.primaryLight, borderTop: `1px solid ${t.border}` }}>
          <span style={{ fontSize: 12, color: t.primary, fontWeight: 600, flex: 1 }}>Editing message</span>
          <X size={16} color={t.textMuted} onClick={() => { setEditingMsg(null); setInput(""); }} style={{ cursor: "pointer" }} />
        </div>
      )}

      <div ref={composerBarRef} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 10px", paddingBottom: "calc(10px + var(--safe-bottom))", background: t.bg, position: "relative", flexShrink: 0 }}>
        {isBlockedByMe ? (
          <div style={{ flex: 1, textAlign: "center", padding: "12px", color: t.textMuted, fontSize: 13 }}>
            You've blocked this contact — unblock from their profile to send messages.
          </div>
        ) : recording ? (
          <>
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, background: t.surface, borderRadius: 24, padding: "10px 16px" }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#FF3B30" }} />
              <span style={{ fontSize: 14, fontWeight: 600, color: t.text }}>Recording… {Math.floor(recordSeconds / 60)}:{String(recordSeconds % 60).padStart(2, "0")}</span>
              <span onClick={() => stopVoiceRecording(false)} style={{ marginLeft: "auto", color: t.textMuted, fontSize: 12.5, cursor: "pointer" }}>Cancel</span>
            </div>
            <button onClick={() => stopVoiceRecording(true)} style={{ width: 42, height: 42, borderRadius: "50%", background: t.primary, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <Send size={17} color={t.bubbleMeText} />
            </button>
          </>
        ) : uploading ? (
          <div style={{ flex: 1, textAlign: "center", padding: "12px", color: t.textMuted, fontSize: 13 }}>Uploading…</div>
        ) : (
          <>
            {showEmojiPicker && (
              <>
                <div onClick={() => setShowEmojiPicker(false)} style={{ position: "fixed", inset: 0, zIndex: 29 }} />
                <div style={{ position: "absolute", bottom: 64, left: 10, right: 10, background: t.surface, borderRadius: 14, boxShadow: "0 4px 20px rgba(0,0,0,0.2)", padding: "10px 12px", zIndex: 30, maxHeight: 200, overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: t.textMuted }}>Emoji</span>
                    <X size={17} color={t.textMuted} onClick={() => setShowEmojiPicker(false)} style={{ cursor: "pointer" }} />
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {EMOJI_PICKER_SET.map((emoji) => (
                      <span key={emoji} onClick={(e) => { e.stopPropagation(); setInput((prev) => prev + emoji); autoResizeComposer(); }} style={{ fontSize: 22, cursor: "pointer", padding: "4px 5px", borderRadius: 6, textAlign: "center" }}>{emoji}</span>
                    ))}
                  </div>
                </div>
              </>
            )}
            {attachRendered && createPortal(
              <>
              <div onClick={closeAttach} style={{ position: "fixed", inset: 0, zIndex: 2147481000, opacity: attachClosing ? 0 : 1, transition: "opacity 0.15s ease" }} />
              <div style={{ position: "fixed", left: 10, bottom: composerBarRef.current ? (window.innerHeight - composerBarRef.current.getBoundingClientRect().top) + 6 + navInset : 96, background: t.surface, borderRadius: 14, boxShadow: "0 4px 20px rgba(0,0,0,0.2)", overflow: "hidden", zIndex: 2147481001, minWidth: 190, opacity: attachClosing ? 0 : 1, transform: attachClosing ? "translateY(8px) scale(0.97)" : "translateY(0) scale(1)", transition: "opacity 0.15s ease, transform 0.18s ease", transformOrigin: "bottom left" }}>
                <div onClick={() => { closeAttach(); setShowPoll(true); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", cursor: "pointer" }}>
                  <BarChart2 size={17} color={t.primary} /><span style={{ fontSize: 14, fontWeight: 600, color: t.text }}>Poll</span>
                </div>
                <div onClick={() => { closeAttach(); photoInputRef.current?.click(); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", cursor: "pointer", borderTop: `1px solid ${t.border}` }}>
                  <ImageIcon size={17} color={t.primary} /><span style={{ fontSize: 14, fontWeight: 600, color: t.text }}>Photo or video</span>
                </div>
                <div onClick={() => { closeAttach(); fileInputRef.current?.click(); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", cursor: "pointer", borderTop: `1px solid ${t.border}` }}>
                  <Paperclip size={17} color={t.primary} /><span style={{ fontSize: 14, fontWeight: 600, color: t.text }}>File (max 50MB)</span>
                </div>
                <div onClick={() => { closeAttach(); openCamera(); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", cursor: "pointer", borderTop: `1px solid ${t.border}` }}>
                  <Camera size={17} color={t.primary} /><span style={{ fontSize: 14, fontWeight: 600, color: t.text }}>Camera</span>
                </div>
              </div>
              </>,
              document.body
            )}
            <input ref={photoInputRef} type="file" accept="image/*,video/*" style={{ display: "none" }} onChange={handlePhotoOrVideoPick} onCancel={() => setGalleryActive(false)} />
            <input ref={fileInputRef} type="file" style={{ display: "none" }} onChange={handleFilePick} />
            <div style={{ flex: 1, display: "flex", alignItems: "center", background: t.surface, borderRadius: 24, padding: `${Math.round(8 * composerHeight)}px 6px ${Math.round(8 * composerHeight)}px 10px`, gap: 2 }}>
              <div
                onClick={() => { if (showEmojiPicker) setShowEmojiPicker(false); else { closeAttach(); setShowEmojiPicker(true); } }}
                style={{ width: Math.max(30, Math.round(32 * composerHeight)), height: Math.max(30, Math.round(32 * composerHeight)), borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, background: showEmojiPicker ? t.primaryLight : "transparent" }}
              >
                <Smile size={Math.max(22, Math.round(25 * composerHeight))} color={showEmojiPicker ? t.primary : t.textMuted} />
              </div>
              <div
                onClick={() => { setGalleryActive(true); setShowEmojiPicker(false); photoInputRef.current?.click(); }}
                style={{ width: Math.max(30, Math.round(32 * composerHeight)), height: Math.max(30, Math.round(32 * composerHeight)), borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, background: galleryActive ? t.primaryLight : "transparent" }}
              >
                <ImageIcon size={Math.max(22, Math.round(25 * composerHeight))} color={galleryActive ? t.primary : t.textMuted} />
              </div>
              <textarea
                ref={composerRef}
                value={input}
                onChange={(e) => handleInputChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); editingMsg ? saveEdit() : send(); } }}
                placeholder={editingMsg ? "Edit message…" : "Message"}
                rows={1}
                style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: Math.max(14, Math.round(16.5 * composerHeight * 10) / 10), color: t.text, resize: "none", maxHeight: Math.round((42 + composerHeight * 42) * composerHeight), lineHeight: 1.4, paddingTop: Math.round(7 * composerHeight), paddingBottom: Math.round(7 * composerHeight), fontFamily: "inherit" }}
              />
              <div
                onClick={() => { if (showAttach) closeAttach(); else { setShowEmojiPicker(false); openAttach(); } }}
                style={{ width: Math.max(30, Math.round(32 * composerHeight)), height: Math.max(30, Math.round(32 * composerHeight)), borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, background: showAttach ? t.primaryLight : "transparent", transform: `rotate(${showAttach ? 45 : 0}deg)`, transition: "transform 0.2s ease" }}
              >
                <Plus size={Math.max(22, Math.round(25 * composerHeight))} color={showAttach ? t.primary : t.textMuted} />
              </div>
            </div>
            {input.trim() || editingMsg ? (
              <button
                onClick={editingMsg ? saveEdit : send}
                onMouseDown={() => { if (!editingMsg && input.trim()) longPressTimer.current = setTimeout(() => setShowSchedule(true), 500); }}
                onMouseUp={() => clearTimeout(longPressTimer.current)}
                onMouseLeave={() => clearTimeout(longPressTimer.current)}
                onTouchStart={() => { if (!editingMsg && input.trim()) longPressTimer.current = setTimeout(() => setShowSchedule(true), 500); }}
                onTouchEnd={() => clearTimeout(longPressTimer.current)}
                style={{ width: Math.round(42 * composerHeight), height: Math.round(42 * composerHeight), borderRadius: "50%", background: t.primary, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                <Send size={Math.max(16, Math.round(17 * composerHeight))} color={t.bubbleMeText} />
              </button>
            ) : (
              <button onClick={startVoiceRecording} style={{ width: Math.round(42 * composerHeight), height: Math.round(42 * composerHeight), borderRadius: "50%", background: t.primary, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                <Mic size={Math.max(16, Math.round(18 * composerHeight))} color={t.bubbleMeText} />
              </button>
            )}
          </>
        )}
      </div>

      {activeMsg && (() => {
        const sentMs = activeMsg.sentAt?.toMillis?.() || Date.now();
        const ageMs = Date.now() - sentMs;
        const canEdit = ageMs < 15 * 60 * 1000;
        const canDeleteEveryone = ageMs < 60 * 60 * 60 * 1000;
        return (
          <div className="nextext-overlay-backdrop" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 55, display: "flex", alignItems: "flex-end" }} onClick={() => { setActiveMsg(null); setShowCustomEmoji(false); setCustomEmoji(""); }}>
            <div className="nextext-overlay-sheet" style={{ background: t.surface, width: "100%", borderRadius: "18px 18px 0 0", padding: "16px 20px 24px" }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <span style={{ fontWeight: 700, fontSize: 15, color: t.text }}>Message actions</span>
                <X size={20} color={t.textMuted} onClick={() => { setActiveMsg(null); setShowCustomEmoji(false); setCustomEmoji(""); }} style={{ cursor: "pointer" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-around", alignItems: "center", marginBottom: 16 }}>
                {QUICK_REACTIONS.map((e) => <span key={e} onClick={() => handleReact(e)} style={{ fontSize: 26, cursor: "pointer" }}>{e}</span>)}
                <div onClick={() => setShowCustomEmoji(!showCustomEmoji)} style={{ width: 30, height: 30, borderRadius: "50%", border: `1.5px solid ${t.border}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                  <span style={{ fontSize: 15, color: t.textMuted }}>+</span>
                </div>
              </div>
              {showCustomEmoji && (
                <div style={{ display: "flex", gap: 8, marginBottom: 16, paddingBottom: 12, borderBottom: `1px solid ${t.border}` }}>
                  <input
                    autoFocus value={customEmoji} onChange={(e) => setCustomEmoji(e.target.value)}
                    placeholder="Type or paste any emoji…"
                    onKeyDown={(e) => { if (e.key === "Enter" && customEmoji.trim()) { handleReact(customEmoji.trim()); setCustomEmoji(""); setShowCustomEmoji(false); } }}
                    style={{ flex: 1, padding: "8px 12px", borderRadius: 10, border: `1px solid ${t.border}`, fontSize: 16 }}
                  />
                  <button
                    disabled={!customEmoji.trim()}
                    onClick={() => { handleReact(customEmoji.trim()); setCustomEmoji(""); setShowCustomEmoji(false); }}
                    style={{ padding: "8px 14px", borderRadius: 10, border: "none", background: customEmoji.trim() ? t.primary : t.border, color: customEmoji.trim() ? t.bubbleMeText : t.textMuted, fontWeight: 700, cursor: customEmoji.trim() ? "pointer" : "not-allowed" }}
                  >
                    Add
                  </button>
                </div>
              )}
              <div onClick={handleReply} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 4px", cursor: "pointer", borderTop: `1px solid ${t.border}` }}>
                <CornerUpLeft size={17} color={t.text} /><span style={{ fontSize: 15, color: t.text }}>Reply</span>
              </div>
              {activeMsg.text && (
                <div onClick={handleCopyText} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 4px", cursor: "pointer", borderTop: `1px solid ${t.border}` }}>
                  <span style={{ fontSize: 15, color: t.text }}>Copy text</span>
                </div>
              )}
              {activeMsg.senderId === myUid && activeMsg.type === "text" && canEdit && (
                <div onClick={handleEdit} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 4px", cursor: "pointer", borderTop: `1px solid ${t.border}` }}>
                  <span style={{ fontSize: 15, color: t.text }}>Edit <span style={{ fontSize: 11.5, color: t.textMuted }}>(within 15 min)</span></span>
                </div>
              )}
              <div onClick={handleDeleteSelf} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 4px", cursor: "pointer", borderTop: `1px solid ${t.border}` }}>
                <span style={{ fontSize: 15, color: "#FF3B30" }}>Delete for me</span>
              </div>
              {activeMsg.senderId === myUid && canDeleteEveryone && (
                <div onClick={handleDeleteEveryone} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 4px", cursor: "pointer", borderTop: `1px solid ${t.border}` }}>
                  <span style={{ fontSize: 15, color: "#FF3B30" }}>Delete for everyone <span style={{ fontSize: 11.5, color: t.textMuted }}>(within 60 hrs)</span></span>
                </div>
              )}
            </div>
          </div>
        );
      })()}
      {showPoll && <PollCreateSheet t={t} onClose={() => setShowPoll(false)} onCreate={createPoll} />}
      {showSchedule && <ScheduleSendSheet t={t} onClose={() => setShowSchedule(false)} onSchedule={sendScheduled} />}

      {contactCardMember && (
        <div onClick={() => setContactCardMember(null)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: t.surface, borderRadius: 18, width: "100%", maxWidth: 280, overflow: "hidden" }}>
            <div style={{ padding: "24px 20px", textAlign: "center", background: t.primaryLight }}>
              <div style={{ width: 64, height: 64, borderRadius: "50%", background: t.primary, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 10px" }}>
                <span style={{ color: "#fff", fontWeight: 800, fontSize: 24 }}>{(contactCardMember.name || "?")[0]}</span>
              </div>
              <div style={{ fontWeight: 700, fontSize: 16, color: t.text }}>{contactCardMember.name}</div>
              <div style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }}>Group member</div>
            </div>
            <div style={{ padding: "14px 20px 16px" }}>
              <div style={{ display: "flex", gap: 10 }}>
                <div onClick={async () => {
                  setContactCardMember(null);
                  try {
                    await getOrCreateDirectChat(myUid, contactCardMember.uid);
                    onBack();
                    setTimeout(() => { onBack(); }, 10);
                  } catch { /* silent */ }
                }} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px 0", borderRadius: 10, background: t.primaryLight, cursor: "pointer" }}>
                  <MessageSquare size={18} color={t.primary} />
                  <span style={{ fontWeight: 700, fontSize: 14, color: t.primary }}>Start Chat</span>
                </div>
                <div onClick={() => {
                  setContactCardMember(null);
                  import("../firebase/contacts").then(({ sendContactRequest }) => {
                    sendContactRequest(myUid, contactCardMember.uid).catch(() => {});
                  });
                }} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px 0", borderRadius: 10, background: t.primaryLight, cursor: "pointer" }}>
                  <UserPlus size={18} color={t.primary} />
                  <span style={{ fontWeight: 700, fontSize: 14, color: t.primary }}>Add Contact</span>
                </div>
              </div>
            </div>
            <div onClick={() => setContactCardMember(null)} style={{ padding: "14px", textAlign: "center", borderTop: `1px solid ${t.border}`, cursor: "pointer", fontWeight: 700, fontSize: 14, color: t.textMuted }}>
              Close
            </div>
          </div>
        </div>
      )}

      {showCamera && createPortal(
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "#000", zIndex: 2147482000, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", minHeight: 48 }}>
            <span onClick={closeCamera} style={{ color: "#fff", fontSize: 15, cursor: "pointer" }}>Cancel</span>
            <span style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>Camera</span>
            <div onClick={flipChatCamera} style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <RefreshCw size={20} color="#fff" />
            </div>
          </div>
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", minHeight: 0 }}>
            <video ref={cameraVideoRef} autoPlay playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
          {cameraError && <div style={{ color: "#FF3B30", fontSize: 13, textAlign: "center", padding: 8 }}>{cameraError}</div>}
          {capturedPhotos.length > 0 && (
            <div style={{ display: "flex", gap: 8, padding: "8px 16px", overflowX: "auto", flexShrink: 0 }}>
              {capturedPhotos.map((p, i) => (
                <div key={i} onClick={async () => {
                  if (p.sending) return;
                  setCapturedPhotos((prev) => prev.map((x, j) => j === i ? { ...x, sending: true } : x));
                  setUploading(true);
                  try {
                    const result = await uploadChatFile(chatId, myUid, p.file, { compress: true });
                    await sendMediaMessage(chatId, myUid, "image", result, otherParticipants);
                    setCapturedPhotos((prev) => prev.filter((_, j) => j !== i));
                  } catch (err) {
                    setSendError("Couldn't send photo: " + err.message);
                    setCapturedPhotos((prev) => prev.map((x, j) => j === i ? { ...x, sending: false } : x));
                  }
                  setUploading(false);
                }} style={{ flexShrink: 0, width: 52, height: 52, borderRadius: 8, overflow: "hidden", border: "2px solid rgba(255,255,255,0.4)", cursor: p.sending ? "wait" : "pointer", position: "relative" }}>
                  <img src={p.thumbnailUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  {p.sending && <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#fff" }}>Sending…</div>}
                </div>
              ))}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: `10px 16px ${20 + navInset}px`, flexShrink: 0, gap: 16 }}>
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 12, overflowX: "auto", paddingBottom: 8, maxWidth: "60%" }}>
              {acceptedContacts.slice(0, 8).map((c) => (
                <div key={c.uid} onClick={async () => {
                  if (capturedPhotos.length === 0) return;
                  const last = capturedPhotos[capturedPhotos.length - 1];
                  setCapturedPhotos((prev) => prev.map((x, j) => j === prev.length - 1 ? { ...x, sending: true } : x));
                  setUploading(true);
                  try {
                    const result = await uploadChatFile(chatId, myUid, last.file, { compress: true });
                    await sendMediaMessage(chatId, myUid, "image", result, otherParticipants);
                    setCapturedPhotos((prev) => prev.filter((_, j) => j !== prev.length - 1));
                  } catch (err) {
                    setSendError("Couldn't send photo: " + err.message);
                    setCapturedPhotos((prev) => prev.map((x, j) => j === prev.length - 1 ? { ...x, sending: false } : x));
                  }
                  setUploading(false);
                }} style={{ flexShrink: 0, width: 48, height: 48, borderRadius: "50%", overflow: "hidden", border: capturedPhotos.length > 0 ? "2px solid #00A884" : "2px solid rgba(255,255,255,0.3)", cursor: capturedPhotos.length > 0 ? "pointer" : "default", background: t.primaryLight, opacity: capturedPhotos.length > 0 ? 1 : 0.5 }}>
                  <Avatar photoURL={c.profile?.photoURL} name={c.profile?.displayName} uid={c.uid} size={40} />
                </div>
              ))}
            </div>
            <div onClick={capturePhoto} style={{ width: 64, height: 64, borderRadius: "50%", border: "4px solid #fff", background: "rgba(255,255,255,0.3)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#fff" }} />
            </div>
          </div>
        </div>,
        document.body
      )}

      {fullscreenImage && createPortal(
        <div className="nextext-overlay-backdrop" style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.95)", zIndex: 999999, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }} onClick={() => setFullscreenImage(null)}>
          <div style={{ position: "absolute", top: 14, right: 14, display: "flex", gap: 14, zIndex: 61 }}>
            <div onClick={async (e) => { e.stopPropagation(); try { const res = await fetch(fullscreenImage); const blob = await res.blob(); const blobUrl = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = blobUrl; a.download = `nextext-image-${Date.now()}.jpg`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(blobUrl); } catch { window.open(fullscreenImage, "_blank"); } }} style={{ width: 38, height: 38, borderRadius: "50%", background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </div>
            <div onClick={(e) => { e.stopPropagation(); setFullscreenImage(null); }} style={{ width: 38, height: 38, borderRadius: "50%", background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <X size={18} color="#fff" />
            </div>
          </div>
          <div style={{ flex: 1, minHeight: 0, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: "60px 16px 30px", boxSizing: "border-box" }}>
            <img src={fullscreenImage} onClick={(e) => e.stopPropagation()} style={{ maxWidth: "100%", maxHeight: "100%", width: "auto", height: "auto", objectFit: "contain", borderRadius: 8 }} />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
