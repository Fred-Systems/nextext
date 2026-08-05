import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useTheme } from "../theme/ThemeContext";
import { AVATAR_COLORS, getAvatarOverride, setAvatarOverride } from "../utils/avatarColors";

export default function AvatarColorPicker({ uid, onChange }) {
  const { t } = useTheme();
  const existing = getAvatarOverride(uid) || {};
  const [open, setOpen] = useState(false);
  const [color, setColor] = useState(existing.color || "");
  const [style, setStyle] = useState(existing.style || "solid");

  const apply = (nextColor, nextStyle) => {
    setAvatarOverride(uid, { color: nextColor || null, style: nextStyle });
    setColor(nextColor || "");
    setStyle(nextStyle);
    if (onChange) onChange();
  };

  return (
    <div style={{ padding: "13px 0", borderBottom: `1px solid ${t.border}` }}>
      <div
        onClick={() => setOpen((o) => !o)}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", padding: "4px 0" }}
      >
        <div>
          <div style={{ fontWeight: 600, color: t.text, fontSize: 15 }}>Avatar color</div>
          <div style={{ fontSize: 12.5, color: t.textMuted, marginTop: 2 }}>Customize how this avatar looks (this device only).</div>
        </div>
        <ChevronDown size={18} color={t.textMuted} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.18s ease", flexShrink: 0 }} />
      </div>
      {open && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <div
              onClick={() => apply("", style)}
              title="Automatic"
              style={{ width: 34, height: 34, borderRadius: "50%", border: `2px solid ${color === "" ? t.primary : t.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: t.textMuted, cursor: "pointer", background: t.bg, boxSizing: "border-box" }}
            >
              A
            </div>
            {AVATAR_COLORS.map((c) => (
              <div
                key={c}
                onClick={() => apply(c, style)}
                style={{ width: 34, height: 34, borderRadius: "50%", background: c, border: color === c ? `3px solid ${t.primary}` : "2px solid transparent", cursor: "pointer", boxSizing: "border-box" }}
              />
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            {["solid", "gradient"].map((s) => (
              <div
                key={s}
                onClick={() => apply(color, s)}
                style={{ padding: "6px 14px", borderRadius: 16, fontSize: 12.5, fontWeight: 600, cursor: "pointer", background: style === s ? t.primary : t.primaryLight, color: style === s ? t.bubbleMeText : t.primary }}
              >
                {s === "solid" ? "Solid" : "Gradient"}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
