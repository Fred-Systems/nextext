import React, { useState } from "react";
import { useTheme } from "../theme/ThemeContext";
import { AVATAR_COLORS, getAvatarOverride, setAvatarOverride } from "../utils/avatarColors";

export default function AvatarColorPicker({ uid, onChange }) {
  const { t } = useTheme();
  const existing = getAvatarOverride(uid) || {};
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
      <div style={{ fontWeight: 600, color: t.text, fontSize: 15, marginBottom: 4 }}>Avatar color</div>
      <div style={{ fontSize: 12.5, color: t.textMuted, marginBottom: 10 }}>Customize how this avatar looks (this device only).</div>
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
  );
}
