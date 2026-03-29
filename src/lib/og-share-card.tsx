import { McqChoiceMark } from "./og-mcq-mark";

export function OgShareCard() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "72px 80px",
        background:
          "linear-gradient(125deg, #020617 0%, #0f172a 42%, #022c22 78%, #064e3b 100%)",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 28,
          flex: 1,
          maxWidth: 720,
        }}
      >
        <div
          style={{
            fontSize: 64,
            fontWeight: 700,
            color: "#f8fafc",
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
          }}
        >
          Cognitive MCQ Analyzer
        </div>
        <div
          style={{
            fontSize: 30,
            fontWeight: 400,
            color: "rgba(226,232,240,0.88)",
            lineHeight: 1.35,
          }}
        >
          Upload or paste MCQs for Gemini-powered scoring, explanations, and a
          downloadable PDF report.
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: 16,
            marginTop: 8,
          }}
        >
          <div
            style={{
              fontSize: 22,
              fontWeight: 600,
              color: "#6ee7b7",
              padding: "10px 20px",
              borderRadius: 999,
              background: "rgba(16,185,129,0.15)",
              border: "1px solid rgba(52,211,153,0.35)",
            }}
          >
            AI evaluation
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 600,
              color: "#94a3b8",
            }}
          >
            PDF export
          </div>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginLeft: 40,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 56,
            borderRadius: 48,
            background: "rgba(15,23,42,0.55)",
            border: "3px solid rgba(16,185,129,0.5)",
            boxShadow: "0 24px 80px rgba(0,0,0,0.45)",
          }}
        >
          <McqChoiceMark dotSize={72} gap={22} borderPx={4} />
        </div>
      </div>
    </div>
  );
}
