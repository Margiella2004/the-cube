import React from "react";
import PanelContent from "./PanelContent";

export default function SidePanel({ panels, isDemoRunning, onClose, onSwapSecondary }) {
  const visiblePanels = Array.isArray(panels) ? panels.filter(Boolean) : [];
  const shouldShow = visiblePanels.length > 0 && !isDemoRunning;
  const primary = visiblePanels[0] || null;
  const secondary = visiblePanels[1] || null;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: shouldShow ? "rgba(10, 10, 10, 0.95)" : "transparent",
        color: "white",
        padding: shouldShow ? "32px" : "0",
        overflowY: "auto",
        boxSizing: "border-box",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
      }}
    >
      {shouldShow && primary && (
        <>
          <style>{`
            @keyframes panelPop {
              0% { opacity: 0; transform: translateY(14px) scale(0.98); }
              100% { opacity: 1; transform: translateY(0) scale(1); }
            }
          `}</style>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr",
              gap: 16,
              minHeight: "100%",
              alignContent: "start"
            }}
          >
            <div
              style={{
                background: "rgba(22, 22, 22, 0.95)",
                borderRadius: 16,
                padding: 24,
                border: "1px solid rgba(255,255,255,0.12)",
                boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
                animation: "panelPop 220ms ease-out both"
              }}
            >
              <PanelContent
                title={primary.title}
                iframeUrl={primary.iframeUrl}
                onClose={onClose}
              />
            </div>

            {secondary ? (
              <div
                style={{
                  background: "rgba(18, 18, 18, 0.9)",
                  borderRadius: 14,
                  border: "1px dashed rgba(255,255,255,0.18)",
                  padding: "12px 16px"
                }}
              >
                <div
                  onClick={onSwapSecondary}
                  onKeyDown={(event) => {
                    if (!onSwapSecondary) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSwapSecondary();
                    }
                  }}
                  role={onSwapSecondary ? "button" : undefined}
                  tabIndex={onSwapSecondary ? 0 : undefined}
                  title={onSwapSecondary ? "Click to focus this window" : undefined}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 16,
                    background: "rgba(26, 26, 26, 0.95)",
                    borderRadius: 12,
                    padding: "12px 14px",
                    border: "1px solid rgba(255,255,255,0.1)",
                    cursor: onSwapSecondary ? "pointer" : "default"
                  }}
                >
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: "#ffffff" }}>
                      {secondary.title || "Minimized Video"}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
