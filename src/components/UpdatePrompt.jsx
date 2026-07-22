import React from "react";
import { Download, X, Sparkles } from "lucide-react";

export default function UpdatePrompt({ update, onDownload, onDismiss }) {
  if (!update) return null;

  const changelogLines = update.body
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  return (
    <div
      onClick={onDismiss}
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        zIndex: 99999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#1a1a2e",
          width: "100%",
          maxWidth: 340,
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "18px 18px 14px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              background: "linear-gradient(135deg, #10B981, #059669)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Sparkles size={18} color="#fff" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: "#fff" }}>
              Update Available
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
              {update.name}
            </div>
          </div>
          <X
            size={20}
            color="rgba(255,255,255,0.4)"
            onClick={onDismiss}
            style={{ cursor: "pointer" }}
          />
        </div>

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "14px 18px",
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "rgba(255,255,255,0.4)",
              textTransform: "uppercase",
              letterSpacing: 0.5,
              marginBottom: 8,
            }}
          >
            What's New
          </div>
          {changelogLines.map((line, i) => (
            <div
              key={i}
              style={{
                fontSize: 13.5,
                color: "rgba(255,255,255,0.8)",
                lineHeight: 1.6,
                marginBottom: 4,
                paddingLeft: line.startsWith("-") || line.startsWith("*") || line.startsWith("•") ? 0 : 0,
              }}
            >
              {line}
            </div>
          ))}
        </div>

        <div
          style={{
            padding: "14px 18px 18px",
            display: "flex",
            gap: 10,
            borderTop: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div
            onClick={onDismiss}
            style={{
              flex: 1,
              padding: "12px 0",
              textAlign: "center",
              fontSize: 14,
              fontWeight: 600,
              color: "rgba(255,255,255,0.5)",
              cursor: "pointer",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            Do It Later
          </div>
          <div
            onClick={onDownload}
            style={{
              flex: 1.5,
              padding: "12px 0",
              textAlign: "center",
              fontSize: 14,
              fontWeight: 700,
              color: "#fff",
              background: "linear-gradient(135deg, #10B981, #059669)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <Download size={15} color="#fff" />
            Download Now
          </div>
        </div>
      </div>
    </div>
  );
}
