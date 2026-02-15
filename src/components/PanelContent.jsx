import React from "react";

export default function PanelContent({ title, iframeUrl, onClose }) {
  return (
    <div style={{ height: "100%" }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16
        }}
      >
        <div>
          <h1
            style={{
              margin: "0 0 12px 0",
              fontSize: "28px",
              fontWeight: 600,
              color: "#ffffff"
            }}
          >
            {title || "Selected Video"}
          </h1>
        </div>

        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 12px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(255,255,255,0.08)",
              color: "#ffffff",
              fontSize: 12,
              letterSpacing: 0.6,
              cursor: "pointer"
            }}
            aria-label="Back to default view"
            title="Back to default view"
          >
            Back
          </button>
        ) : null}
      </div>

      {iframeUrl ? (
        <iframe
          src={iframeUrl}
          style={{
            width: "100%",
            height: "calc(100vh - 140px)",
            border: "none",
            borderRadius: "8px",
            backgroundColor: "#ffffff"
          }}
          title={title || "Embedded video"}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          loading="lazy"
        />
      ) : (
        <div
          style={{
            padding: "40px",
            textAlign: "center",
            opacity: 0.5,
            fontSize: "14px"
          }}
        >
          No content available for this face
        </div>
      )}
    </div>
  );
}
