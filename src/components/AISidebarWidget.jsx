import React from "react";
import { useSystemConfigHook } from "../firebase/ai";

export default function AISidebarWidget({ userDoc, onOpenAI }) {
  const sysConfig = useSystemConfigHook();

  const aiApproved = userDoc?.aiApproved && !sysConfig?.aiGloballyDisabled && !sysConfig?.hideAiEverywhere && userDoc?.restrictions?.blockAI !== true;
  if (!aiApproved) return null;

  return (
    <div
      onClick={() => onOpenAI()}
      style={{
        position: "fixed",
        top: "50%",
        right: 16,
        transform: "translateY(-50%)",
        width: 50,
        height: 50,
        borderRadius: "50%",
        background: "linear-gradient(135deg, #7C5CFF, #53BDEB)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 4px 16px rgba(124,92,255,0.4)",
        cursor: "pointer",
        zIndex: 30,
        transition: "transform 0.2s",
      }}
    >
      <span style={{ fontSize: 24 }}>🤖</span>
    </div>
  );
}
