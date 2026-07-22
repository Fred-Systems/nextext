import React, { useState, useRef, useEffect } from "react";
import { ChevronLeft, Plus, Camera, X, Video, Type, Palette, Eye, Trash2, Play, Pause } from "lucide-react";
import { useTheme, FONTS } from "../theme/ThemeContext";
import { postStatus, useStatuses, viewStatus, useStatusViewers, deleteStatus } from "../firebase/status";
import { useContacts } from "../firebase/contacts";
import { uploadChatFile } from "../supabase/media";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/config";
import Avatar from "../components/Avatar";
import StatusStoryViewer from "./StatusStoryViewer";

const VIEWED_KEY = "nextext_status_viewed";

function SegmentedRing({ count, allViewed, size, gap = 4 }) {
  if (count <= 0) return null;
  const r = (size / 2) - 2;
  const circumference = 2 * Math.PI * r;
  const segLen = (circumference - gap * count) / count;
  const color = allViewed ? "rgba(255,255,255,0.25)" : "#00A884";
  return (
    <svg width={size} height={size} style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}>
      {Array.from({ length: count }).map((_, i) => (
        <circle
          key={i}
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke={color}
          strokeWidth={3}
          strokeDasharray={`${segLen} ${circumference - segLen}`}
          strokeDashoffset={-i * (segLen + gap)}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      ))}
    </svg>
  );
}

const STATUS_BG_COLORS = [
  "#00A884", "#1FA855", "#53BDEB", "#7C5CFF",
  "#D98A9A", "#FF6B5B", "#E8A33D", "#FF7A45",
  "#B784E0", "#4C8DFF", "#000000", "#1F2C33",
  "#2D3B45", "#0B141A", "#1E1B2E", "#3A2218",
];

function getStoredViewed() {
  try {
    const raw = localStorage.getItem(VIEWED_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    const now = Date.now();
    const cleaned = {};
    for (const [uid, ts] of Object.entries(obj)) {
      if (now - ts < 24 * 60 * 60 * 1000) cleaned[uid] = ts;
    }
    return cleaned;
  } catch { return {}; }
}

function markViewed(uid) {
  const viewed = getStoredViewed();
  viewed[uid] = Date.now();
  localStorage.setItem(VIEWED_KEY, JSON.stringify(viewed));
}

function getVideoDuration(file) {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => { v.src = URL.revokeObjectURL(v.src); resolve(Math.ceil(v.duration * 1000)); };
    v.onerror = () => resolve(VIDEO_DURATIONS_MS);
    v.src = URL.createObjectURL(file);
  });
}

const VIDEO_DURATIONS_MS = 10000;

function SlideViewerCount({ statusId, t, onClickEye }) {
  const viewers = useStatusViewers(statusId);
  return (
    <div onClick={(e) => { e.stopPropagation(); onClickEye(statusId); }} style={{ display: "flex", alignItems: "center", gap: 3, cursor: "pointer", padding: "2px 6px", borderRadius: 8, background: "rgba(0,0,0,0.06)" }}>
      <Eye size={12} color={t.textMuted} />
      <span style={{ fontSize: 11, color: t.textMuted, fontWeight: 600 }}>{viewers.length}</span>
    </div>
  );
}

function StatusViewerModal({ statusId, contacts, onClose, t }) {
  const viewers = useStatusViewers(statusId);
  const extraProfiles = {};

  const resolveProfile = (uid) => {
    const c = contacts?.find((ct) => ct.uid === uid);
    if (c?.profile) return c.profile;
    if (extraProfiles[uid]) return extraProfiles[uid];
    return null;
  };
  const resolveName = (uid) => resolveProfile(uid)?.displayName || uid?.slice(0, 8) || "Unknown";
  const resolvePhoto = (uid) => resolveProfile(uid)?.photoURL || null;

  const timeAgo = (ts) => {
    if (!ts?.toDate) return "";
    const mins = Math.floor((Date.now() - ts.toDate().getTime()) / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: t.surface, borderRadius: 16, width: "100%", maxWidth: 320, maxHeight: "70%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", padding: "14px 16px", borderBottom: `1px solid ${t.border}` }}>
          <Eye size={18} color={t.primary} style={{ marginRight: 8 }} />
          <span style={{ fontWeight: 700, fontSize: 16, color: t.text, flex: 1 }}>Viewers ({viewers.length})</span>
          <X size={18} color={t.textMuted} onClick={onClose} style={{ cursor: "pointer" }} />
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
          {viewers.length === 0 && (
            <div style={{ padding: 24, textAlign: "center", color: t.textMuted, fontSize: 13 }}>No views yet</div>
          )}
          {viewers.map((v) => (
            <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px" }}>
              <Avatar photoURL={resolvePhoto(v.viewerUid)} name={resolveName(v.viewerUid)} uid={v.viewerUid} size={36} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: t.text }}>{resolveName(v.viewerUid)}</div>
                <div style={{ fontSize: 11.5, color: t.textMuted }}>{timeAgo(v.viewedAt)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function StatusScreen({ myUid, myName, onBack, onStoryViewerChange, initialViewStatuses, statusOrigin }) {
  const { t } = useTheme();
  const { contacts } = useContacts(myUid);
  const [blockStatus, setBlockStatus] = useState(false);
  useEffect(() => {
    if (!myUid) return;
    const unsub = onSnapshot(doc(db, "users", myUid), (snap) => {
      setBlockStatus(!!snap.data()?.restrictions?.blockStatus);
    });
    return unsub;
  }, [myUid]);
  const [showPost, setShowPost] = useState(false);
  const [postText, setPostText] = useState("");
  const [postMedia, setPostMedia] = useState(null);
  const [postMediaType, setPostMediaType] = useState(null);
  const [bgColorIdx, setBgColorIdx] = useState(0);
  const [fontIdx, setFontIdx] = useState(0);
  const [postMode, setPostMode] = useState("text");
  const [posting, setPosting] = useState(false);
  const [viewStoryOwner, setViewStoryOwner] = useState(null);
  const [viewedMap, setViewedMap] = useState(() => getStoredViewed());
  const [showCamera, setShowCamera] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [durationSeconds, setDurationSeconds] = useState(5);
  const [textOverlay, setTextOverlay] = useState("");
  const [bgAudioFile, setBgAudioFile] = useState(null);
  const [bgAudioVolume, setBgAudioVolume] = useState(70);
  const [videoVolume, setVideoVolume] = useState(100);
  const [muteOriginal, setMuteOriginal] = useState(false);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [previewAudioURL, setPreviewAudioURL] = useState(null);
  const [previewVideoURL, setPreviewVideoURL] = useState(null);
  const previewVideoRef = useRef(null);
  const previewAudioRef = useRef(null);
  const [viewerModalStatusId, setViewerModalStatusId] = useState(null);
  const fileRef = useRef(null);
  const videoFileRef = useRef(null);
  const audioFileRef = useRef(null);
  const postTextRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const cameraVideoRef = useRef(null);
  const cameraRecordingRef = useRef(null);
  const cameraTimerRef = useRef(null);

  const acceptedContacts = contacts.filter((c) => c.status === "accepted");
  const contactUids = acceptedContacts.map((c) => c.uid);
  const allUids = [myUid, ...contactUids];
  const statuses = useStatuses(allUids);

  useEffect(() => {
    if (showPost && postTextRef.current && document.activeElement !== postTextRef.current) {
      postTextRef.current.focus();
    }
  });

  useEffect(() => {
    if (initialViewStatuses && statuses.length > 0 && !viewStoryOwner) {
      const { ownerUid } = initialViewStatuses;
      const matching = statuses.filter((s) => s.ownerId === ownerUid);
      if (matching.length > 0) {
        setViewStoryOwner({ statuses: matching, initialIndex: 0, ownerUid });
        if (onStoryViewerChange) onStoryViewerChange(true);
      }
    }
  }, [initialViewStatuses, statuses, viewStoryOwner, onStoryViewerChange]);

  const myStatuses = statuses.filter((s) => s.ownerId === myUid);
  const contactStatuses = statuses.filter((s) => s.ownerId !== myUid);

  const grouped = {};
  contactStatuses.forEach((s) => {
    if (!grouped[s.ownerId]) grouped[s.ownerId] = [];
    grouped[s.ownerId].push(s);
  });

  useEffect(() => {
    if (!bgAudioFile) { setPreviewAudioURL(null); return; }
    const url = URL.createObjectURL(bgAudioFile);
    setPreviewAudioURL(url);
    return () => URL.revokeObjectURL(url);
  }, [bgAudioFile]);

  useEffect(() => {
    if (postMediaType !== "video" || !postMedia) { setPreviewVideoURL(null); return; }
    const url = URL.createObjectURL(postMedia);
    setPreviewVideoURL(url);
    return () => URL.revokeObjectURL(url);
  }, [postMedia, postMediaType]);

  const stopPreview = () => {
    if (previewVideoRef.current) previewVideoRef.current.pause();
    if (previewAudioRef.current) previewAudioRef.current.pause();
    setPreviewPlaying(false);
  };

  const togglePreview = () => {
    const v = previewVideoRef.current;
    const a = previewAudioRef.current;
    if (previewPlaying) {
      v?.pause();
      a?.pause();
      setPreviewPlaying(false);
      return;
    }
    if (v) { v.currentTime = 0; v.volume = muteOriginal ? 0 : videoVolume / 100; v.play().catch(() => {}); }
    if (a) { a.currentTime = 0; a.volume = bgAudioVolume / 100; a.play().catch(() => {}); }
    setPreviewPlaying(true);
  };

  const openPostSheet = (mode) => {
    stopPreview();
    setPostMode(mode);
    setPostText("");
    setPostMedia(null);
    setPostMediaType(null);
    setDurationSeconds(5);
    setTextOverlay("");
    setBgAudioFile(null);
    setBgAudioVolume(70);
    setVideoVolume(100);
    setMuteOriginal(false);
    setShowPost(true);
  };

  const handlePost = async () => {
    if (postMode === "text" && !postText.trim()) return;
    if (postMode === "media" && !postMedia) return;
    setPosting(true);
    try {
      let mediaURL = null;
      let mediaType = null;
      let durationMs = null;
      if (postMedia) {
        const ext = postMediaType === "video" ? "mp4" : "jpg";
        const mime = postMediaType === "video" ? "video/mp4" : "image/jpeg";
        const file = new File([postMedia], `status-${Date.now()}.${ext}`, { type: mime });
        const result = await uploadChatFile(`status-${myUid}`, myUid, file, { compress: postMediaType !== "video" });
        mediaURL = result.url;
        mediaType = postMediaType;
        if (postMediaType === "video") {
          durationMs = await getVideoDuration(postMedia);
        }
      }
      let bgAudioURL = null;
      let bgAudioVol = null;
      let vidVol = null;
      if (bgAudioFile) {
        const audioFile = new File([bgAudioFile], `status-audio-${Date.now()}.mp3`, { type: bgAudioFile.type || "audio/mpeg" });
        const audioResult = await uploadChatFile(`status-${myUid}`, myUid, audioFile, { compress: false });
        bgAudioURL = audioResult.url;
        bgAudioVol = bgAudioVolume;
        vidVol = muteOriginal ? 0 : videoVolume;
      }
      const bgColor = postMode === "text" ? STATUS_BG_COLORS[bgColorIdx] : null;
      const fontFamily = postMode === "text" ? FONTS[fontIdx].value : null;
      const finalDuration = postMode === "text" ? durationSeconds * 1000 : (durationMs || (mediaType === "video" ? durationSeconds * 1000 : durationSeconds * 1000));
      await postStatus(myUid, {
        text: postText.trim() || (postMode === "text" ? " " : null),
        mediaURL,
        mediaType,
        backgroundColor: bgColor,
        fontFamily,
        durationMs: finalDuration,
        textOverlay: textOverlay.trim() || null,
        bgAudioURL,
        bgAudioVolume: bgAudioVol,
        videoVolume: vidVol,
      });
      setPostText("");
      setPostMedia(null);
      setPostMediaType(null);
      setTextOverlay("");
      setBgAudioFile(null);
      setShowPost(false);
    } catch { /* silent */ }
    setPosting(false);
  };

  const handleFileSelect = async (e, type) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setPostMedia(f);
    setPostMediaType(type);
    setPostMode("media");
    e.target.value = "";
  };

  const startCamera = async (captureMode) => {
    setCameraError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 1280 } },
        audio: captureMode === "video",
      });
      cameraStreamRef.current = stream;
      setShowCamera(true);
      if (captureMode === "video") {
        cameraRecordingRef.current = new MediaRecorder(stream, { mimeType: "video/webm" });
        const chunks = [];
        cameraRecordingRef.current.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
        cameraRecordingRef.current.onstop = async () => {
          const blob = new Blob(chunks, { type: "video/webm" });
          const file = new File([blob], `status-cam-${Date.now()}.webm`, { type: "video/webm" });
          setPostMedia(file);
          setPostMediaType("video");
          setPostMode("media");
          setShowCamera(false);
          stopCameraStream();
        };
        cameraRecordingRef.current.start();
      }
    } catch {
      setCameraError("Camera access denied or unavailable.");
    }
  };

  const capturePhotoFromCamera = () => {
    const video = cameraVideoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `status-cam-${Date.now()}.jpg`, { type: "image/jpeg" });
      setPostMedia(file);
      setPostMediaType("image");
      setPostMode("media");
      setShowCamera(false);
      stopCameraStream();
    }, "image/jpeg", 0.92);
  };

  const stopCameraStream = () => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((tr) => tr.stop());
      cameraStreamRef.current = null;
    }
    if (cameraTimerRef.current) { clearTimeout(cameraTimerRef.current); cameraTimerRef.current = null; }
  };

  const openStory = (items, ownerUid) => {
    setViewStoryOwner({ statuses: items, initialIndex: 0, ownerUid });
    onStoryViewerChange?.(true);
    // Record view for each status in this story (fire-and-forget)
    if (ownerUid !== myUid) {
      items.forEach((s) => viewStatus(s.id, myUid));
    }
  };

  const handleStoryViewed = () => {
    if (viewStoryOwner?.ownerUid) {
      markViewed(viewStoryOwner.ownerUid);
      setViewedMap(getStoredViewed());
    }
  };

  const isViewed = (uid) => {
    const viewedTs = viewedMap[uid];
    if (!viewedTs) return false;
    const userStatuses = grouped[uid] || [];
    if (userStatuses.length === 0) return true;
    const latestStatus = userStatuses.reduce((latest, s) => {
      const sTs = s.createdAt?.toMillis?.() || 0;
      const lTs = latest.createdAt?.toMillis?.() || 0;
      return sTs > lTs ? s : latest;
    }, userStatuses[0]);
    const latestTs = latestStatus.createdAt?.toMillis?.() || 0;
    return viewedTs >= latestTs;
  };

  const timeAgo = (ts) => {
    if (!ts?.toDate) return "";
    const mins = Math.floor((Date.now() - ts.toDate().getTime()) / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const SectionHeader = ({ label }) => (
    <div style={{ fontSize: 12.5, fontWeight: 700, color: t.textMuted, padding: "14px 16px 6px", textTransform: "uppercase" }}>{label}</div>
  );

  return (
    <div className="nx-screen" style={{ position: "absolute", inset: 0, background: t.bg, display: "flex", flexDirection: "column", zIndex: 40 }}>
      <div style={{ display: "flex", alignItems: "center", padding: "16px", gap: 12, background: t.primary }}>
        <ChevronLeft size={22} color="#fff" onClick={onBack} style={{ cursor: "pointer" }} />
        <span style={{ color: "#fff", fontWeight: 700, fontSize: 18 }}>Status</span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", paddingBottom: 70 }}>
        <SectionHeader label="My Status" />
        <div style={{ display: "flex", alignItems: "center", gap: 13, padding: "10px 16px", borderBottom: `1px solid ${t.border}` }}>
          <div style={{ position: "relative" }}>
            <Avatar name={myName} uid={myUid} size={50} />
            <div onClick={(e) => { e.stopPropagation(); openPostSheet("text"); }} style={{ position: "absolute", bottom: -2, right: -2, width: 22, height: 22, borderRadius: "50%", background: t.accent, border: `2px solid ${t.bg}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <Plus size={13} color="#fff" />
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: t.text }}>My Status</div>
            <div style={{ fontSize: 12.5, color: t.textMuted }}>
              {myStatuses.length > 0 ? `${myStatuses.length} update${myStatuses.length > 1 ? "s" : ""}` : "Tap + to add status update"}
            </div>
          </div>
        </div>

        {myStatuses.length > 0 && myStatuses.map((s, idx) => (
          <div key={s.id} onClick={() => openStory(myStatuses, myUid)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px 10px 42px", cursor: "pointer", borderBottom: `1px solid ${t.border}` }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: s.mediaURL ? `url(${s.mediaURL}) center/cover` : (s.bgColor || t.primaryLight), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: s.mediaURL ? "#fff" : t.text, fontWeight: 700, border: `1px solid ${t.border}`, overflow: "hidden" }}>
              {!s.mediaURL && (s.text || `#${idx + 1}`).slice(0, 4)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 13.5, color: t.text, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
                {s.text || (s.mediaType === "video" ? "Video" : s.mediaType === "image" ? "Photo" : `Slide ${idx + 1}`)}
              </span>
              <span style={{ fontSize: 11.5, color: t.textMuted }}>
                {s.sentAt?.toDate ? s.sentAt.toDate().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : ""}
              </span>
            </div>
            <SlideViewerCount statusId={s.id} t={t} onClickEye={(sid) => setViewerModalStatusId(sid)} />
            <div onClick={(e) => { e.stopPropagation(); if (window.confirm("Delete this status update early?")) { deleteStatus(s.id).catch(() => {}); } }} style={{ padding: 4, cursor: "pointer", flexShrink: 0 }}>
              <Trash2 size={15} color="#FF3B30" />
            </div>
          </div>
        ))}

        {Object.keys(grouped).length > 0 && <SectionHeader label="Recent Updates" />}
        {Object.entries(grouped).map(([uid, items]) => {
          const contact = acceptedContacts.find((c) => c.uid === uid);
          const name = contact?.profile?.displayName || "Unknown";
          const latest = items[items.length - 1];
          return (
            <div
              key={uid}
              onClick={() => openStory(items, uid)}
              style={{ display: "flex", alignItems: "center", gap: 13, padding: "10px 16px", cursor: "pointer", borderBottom: `1px solid ${t.border}` }}
            >
              <div style={{ position: "relative", width: 50, height: 50, flexShrink: 0 }}>
                <SegmentedRing count={items.length} allViewed={isViewed(uid)} size={50} />
                <div style={{ position: "absolute", top: 3, left: 3 }}>
                  <Avatar photoURL={contact?.profile?.photoURL} name={name} uid={uid} size={44} hasActiveStatus statusViewed={isViewed(uid)} blockStatus={blockStatus} onStatusView={() => openStory(items, uid)} />
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: t.text }}>{name}</div>
                <div style={{ fontSize: 12.5, color: t.textMuted }}>
                  {items.length} update{items.length > 1 ? "s" : ""} · {timeAgo(latest.createdAt)}
                </div>
              </div>
              {latest.mediaURL && (
                <div style={{ width: 38, height: 38, borderRadius: 6, overflow: "hidden", flexShrink: 0, border: `1px solid ${t.border}` }}>
                  {latest.mediaType === "video" ? (
                    <video src={latest.mediaURL} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <img src={latest.mediaURL} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  )}
                </div>
              )}
              {!latest.mediaURL && latest.backgroundColor && (
                <div style={{ width: 38, height: 38, borderRadius: 6, flexShrink: 0, background: latest.backgroundColor, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Type size={14} color="#fff" />
                </div>
              )}
            </div>
          );
        })}

        {Object.keys(grouped).length === 0 && myStatuses.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: t.textMuted, fontSize: 13.5, lineHeight: 1.6 }}>
            No status updates yet. Tap the + button to post yours!
          </div>
        )}
      </div>

      {viewStoryOwner && (
        <StatusStoryViewer
          statuses={viewStoryOwner.statuses}
          initialIndex={viewStoryOwner.initialIndex}
          myUid={myUid}
          ownerUid={viewStoryOwner.ownerUid}
          contacts={acceptedContacts}
          onClose={() => { setViewStoryOwner(null); onStoryViewerChange?.(false); }}
          onExit={() => { setViewStoryOwner(null); onStoryViewerChange?.(false); if (statusOrigin !== "status") onBack?.(); }}
          onViewStory={handleStoryViewed}
        />
      )}

      {viewerModalStatusId && (
        <StatusViewerModal statusId={viewerModalStatusId} contacts={acceptedContacts} onClose={() => setViewerModalStatusId(null)} t={t} />
      )}

      {/* Camera overlay */}
      {showCamera && (
        <div style={{ position: "absolute", inset: 0, background: "#000", zIndex: 60, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", position: "absolute", top: 0, left: 0, right: 0, zIndex: 10 }}>
            <X size={22} color="#fff" onClick={() => { setShowCamera(false); stopCameraStream(); }} style={{ cursor: "pointer" }} />
          </div>
          <video
            ref={(el) => {
              cameraVideoRef.current = el;
              if (el && cameraStreamRef.current && !el.srcObject) {
                el.srcObject = cameraStreamRef.current;
                el.play().catch(() => {});
              }
            }}
            autoPlay
            playsInline
            muted
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
          {cameraError && <div style={{ position: "absolute", bottom: 100, left: 0, right: 0, textAlign: "center", color: "#FF3B30", fontSize: 13, fontWeight: 600 }}>{cameraError}</div>}
          <div style={{ position: "absolute", bottom: 40, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 28, zIndex: 10 }}>
            <div onClick={capturePhotoFromCamera} style={{ width: 64, height: 64, borderRadius: "50%", border: "4px solid #fff", background: "rgba(255,255,255,0.15)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Camera size={26} color="#fff" />
            </div>
            <div
              onClick={() => {
                if (cameraRecordingRef.current && cameraRecordingRef.current.state === "recording") {
                  cameraRecordingRef.current.stop();
                } else {
                  startCamera("video");
                }
              }}
              style={{ width: 64, height: 64, borderRadius: "50%", border: "4px solid #FF3B30", background: cameraRecordingRef.current?.state === "recording" ? "rgba(255,59,48,0.3)" : "rgba(255,255,255,0.15)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <Video size={26} color="#FF3B30" />
            </div>
          </div>
        </div>
      )}

      {/* Post status sheet */}
      {showPost && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 50, display: "flex", alignItems: "flex-end" }} onClick={() => { setShowPost(false); setPostMedia(null); setPostText(""); setPostMode("text"); }}>
          <div style={{ background: t.surface, width: "100%", borderRadius: "20px 20px 0 0", padding: 20, paddingBottom: 90, maxHeight: "90vh", overflowY: "auto", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontWeight: 700, fontSize: 17, color: t.text }}>New Status</span>
              <X size={20} color={t.textMuted} onClick={() => { setShowPost(false); setPostMedia(null); setPostText(""); setPostMode("text"); }} style={{ cursor: "pointer" }} />
            </div>

            {/* Mode toggle */}
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              <div onClick={() => setPostMode("text")} style={{ flex: 1, textAlign: "center", padding: "8px 0", borderRadius: 10, background: postMode === "text" ? t.primary : t.bg, color: postMode === "text" ? t.bubbleMeText : t.textMuted, fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <Type size={14} /> Text
              </div>
              <div onClick={() => setPostMode("media")} style={{ flex: 1, textAlign: "center", padding: "8px 0", borderRadius: 10, background: postMode === "media" ? t.primary : t.bg, color: postMode === "media" ? t.bubbleMeText : t.textMuted, fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <Camera size={14} /> Media
              </div>
            </div>

            {postMode === "text" ? (
              <div>
                <div style={{ padding: 16, borderRadius: 12, background: STATUS_BG_COLORS[bgColorIdx], minHeight: 110, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12, transition: "background 0.2s" }}>
                  <textarea
                    ref={postTextRef}
                    autoFocus
                    value={postText}
                    onChange={(e) => setPostText(e.target.value)}
                    placeholder="What's on your mind?"
                    rows={3}
                    style={{ width: "100%", background: "transparent", border: "none", outline: "none", color: "#fff", fontSize: 18, fontWeight: 700, textAlign: "center", resize: "none", fontFamily: FONTS[fontIdx].value, lineHeight: 1.4, caretColor: "#fff" }}
                  />
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <Palette size={16} color={t.textMuted} />
                  <div style={{ display: "flex", gap: 6, flex: 1, overflowX: "auto", paddingBottom: 2 }}>
                    {STATUS_BG_COLORS.map((c, i) => (
                      <div key={c} onClick={() => setBgColorIdx(i)} style={{ width: 28, height: 28, borderRadius: "50%", background: c, border: i === bgColorIdx ? `3px solid ${t.text}` : "2px solid transparent", cursor: "pointer", flexShrink: 0, transition: "border 0.15s" }} />
                    ))}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2, marginBottom: 14 }}>
                  {FONTS.map((f, i) => (
                    <div key={f.id} onClick={() => setFontIdx(i)} style={{ padding: "6px 12px", borderRadius: 10, background: i === fontIdx ? t.primary : t.bg, color: i === fontIdx ? t.bubbleMeText : t.textMuted, fontSize: 12.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, fontFamily: f.value }}>
                      {f.label}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handleFileSelect(e, "image")} />
                <input ref={videoFileRef} type="file" accept="video/*" style={{ display: "none" }} onChange={(e) => handleFileSelect(e, "video")} />

                <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
                  <div onClick={() => fileRef.current?.click()} style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 14px", borderRadius: 10, background: t.primaryLight, cursor: "pointer" }}>
                    <Camera size={16} color={t.primary} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: t.primary }}>Photo</span>
                  </div>
                  <div onClick={() => videoFileRef.current?.click()} style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 14px", borderRadius: 10, background: t.primaryLight, cursor: "pointer" }}>
                    <Video size={16} color={t.primary} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: t.primary }}>Video</span>
                  </div>
                  <div onClick={() => startCamera("photo")} style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 14px", borderRadius: 10, background: t.primaryLight, cursor: "pointer" }}>
                    <Camera size={16} color={t.primary} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: t.primary }}>Camera</span>
                  </div>
                </div>

                {postMedia && (
                  <div style={{ position: "relative", marginBottom: 12 }}>
                    {postMediaType === "video" ? (
                      <video src={URL.createObjectURL(postMedia)} style={{ width: "100%", maxHeight: 180, borderRadius: 10, objectFit: "contain", background: "#000" }} />
                    ) : (
                      <img src={URL.createObjectURL(postMedia)} alt="" style={{ width: "100%", maxHeight: 180, borderRadius: 10, objectFit: "contain" }} />
                    )}
                    <div onClick={() => { setPostMedia(null); setPostMediaType(null); setPostMode("text"); }} style={{ position: "absolute", top: 8, right: 8, width: 22, height: 22, borderRadius: "50%", background: "#FF3B30", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                      <X size={12} color="#fff" />
                    </div>
                  </div>
                )}

                <textarea
                  value={postText}
                  onChange={(e) => setPostText(e.target.value)}
                  placeholder="Add a caption…"
                  rows={2}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: `1px solid ${t.border}`, fontSize: 13.5, background: t.bg, color: t.text, resize: "none", boxSizing: "border-box", fontFamily: "inherit", marginBottom: 12 }}
                />
              </div>
            )}

            {/* Duration slider */}
            <div style={{ marginBottom: 12, padding: "10px 12px", boxSizing: "border-box", width: "100%", overflowX: "auto", whiteSpace: "nowrap", borderRadius: 10, background: t.bg, border: `1px solid ${t.border}` }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: t.text, whiteSpace: "nowrap" }}>Status lifespan duration</span>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: t.primary, flexShrink: 0, marginLeft: 8 }}>{durationSeconds}s</span>
              </div>
              <input type="range" min="1" max="15" step="1" value={durationSeconds} onChange={(e) => setDurationSeconds(Number(e.target.value))} style={{ width: "100%", boxSizing: "border-box", accentColor: t.primary }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: t.textMuted, marginTop: 2 }}>
                <span>1s</span><span>15s</span>
              </div>
            </div>

            {/* Text overlay for media mode */}
            {postMode === "media" && postMedia && (
              <div style={{ marginBottom: 12 }}>
                <input
                  value={textOverlay}
                  onChange={(e) => setTextOverlay(e.target.value)}
                  placeholder="Add text overlay on media…"
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: `1px solid ${t.border}`, fontSize: 13, background: t.bg, color: t.text, boxSizing: "border-box", fontFamily: "inherit" }}
                />
              </div>
            )}

            {/* Background audio multi-track mixer */}
            {((postMode === "media" && postMedia) || postMode === "text") && (
              <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 10, background: t.bg, border: `1px solid ${t.border}` }}>
                <input ref={audioFileRef} type="file" accept="audio/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) setBgAudioFile(f); e.target.value = ""; }} />
                <div onClick={() => audioFileRef.current?.click()} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", color: t.primary, fontSize: 13, fontWeight: 600, marginBottom: bgAudioFile ? 8 : 0 }}>
                  🎵 {bgAudioFile ? "Change background audio" : "Add background audio"}
                </div>
                {bgAudioFile && (
                  <>
                    <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{bgAudioFile.name}</div>

                    {/* Live playground loop player */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                      <div onClick={togglePreview} style={{ width: 34, height: 34, borderRadius: "50%", background: t.primary, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
                        {previewPlaying ? <Pause size={16} color="#fff" /> : <Play size={16} color="#fff" />}
                      </div>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: t.text }}>Test mix (loop)</span>
                      {postMediaType === "video" && previewVideoURL && (
                        <video ref={previewVideoRef} src={previewVideoURL} loop muted={muteOriginal} style={{ display: "none" }} />
                      )}
                      <audio ref={previewAudioRef} src={previewAudioURL || undefined} loop style={{ display: "none" }} />
                    </div>

                    <div onClick={() => setBgAudioFile(null)} style={{ fontSize: 11.5, color: "#FF3B30", cursor: "pointer", marginBottom: 8, fontWeight: 600 }}>Remove audio</div>

                    {postMediaType === "video" && (
                      <>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: "pointer", fontSize: 12.5, fontWeight: 600, color: t.text }}>
                          <input
                            type="checkbox"
                            checked={muteOriginal}
                            onChange={(e) => { const checked = e.target.checked; setMuteOriginal(checked); if (previewVideoRef.current) previewVideoRef.current.volume = checked ? 0 : videoVolume / 100; }}
                          />
                          Mute Original Video Sound entirely
                        </label>
                        <div style={{ marginBottom: 6, opacity: muteOriginal ? 0.4 : 1 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                            <span style={{ fontSize: 11.5, fontWeight: 600, color: t.text }}>Original Video Sound</span>
                            <span style={{ fontSize: 11.5, fontWeight: 700, color: t.primary }}>{videoVolume}%</span>
                          </div>
                          <input type="range" min="0" max="100" step="5" value={videoVolume} disabled={muteOriginal} onChange={(e) => { const val = Number(e.target.value); setVideoVolume(val); if (previewVideoRef.current) previewVideoRef.current.volume = muteOriginal ? 0 : val / 100; }} style={{ width: "100%", accentColor: t.primary }} />
                        </div>
                      </>
                    )}

                    <div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 11.5, fontWeight: 600, color: t.text }}>Background Music Volume</span>
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: t.primary }}>{bgAudioVolume}%</span>
                      </div>
                      <input type="range" min="0" max="100" step="5" value={bgAudioVolume} onChange={(e) => { const val = Number(e.target.value); setBgAudioVolume(val); if (previewAudioRef.current) previewAudioRef.current.volume = val / 100; }} style={{ width: "100%", accentColor: t.primary }} />
                    </div>
                  </>
                )}
              </div>
            )}

            <button
              onClick={handlePost}
              disabled={posting || (postMode === "text" && !postText.trim()) || (postMode === "media" && !postMedia)}
              style={{ width: "100%", padding: 13, borderRadius: 12, border: "none", background: ((postMode === "text" && postText.trim()) || (postMode === "media" && postMedia)) ? t.primary : t.border, color: ((postMode === "text" && postText.trim()) || (postMode === "media" && postMedia)) ? t.bubbleMeText : t.textMuted, fontWeight: 700, fontSize: 15, cursor: ((postMode === "text" && postText.trim()) || (postMode === "media" && postMedia)) ? "pointer" : "not-allowed" }}
            >
              {posting ? "Posting…" : "Post Status"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
