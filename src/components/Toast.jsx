import React, { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

export default function Toast({ message, onDismiss, t }) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onDismiss, 3500);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);

  if (!message) return null;

  return (
    <div
      style={{
        position: "absolute", bottom: 90, left: "50%", transform: "translateX(-50%)",
        background: "#1C1C1E", color: "#fff", padding: "10px 16px", borderRadius: 10,
        display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600,
        boxShadow: "0 4px 16px rgba(0,0,0,0.3)", zIndex: 90, maxWidth: "85%",
      }}
    >
      <AlertTriangle size={16} color="#FFD60A" />
      <span>{message}</span>
    </div>
  );
}
