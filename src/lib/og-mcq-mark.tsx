type McqChoiceMarkProps = {
  dotSize: number;
  gap: number;
  borderPx: number;
};

export function McqChoiceMark({ dotSize, gap, borderPx }: McqChoiceMarkProps) {
  const rows = [0, 1, 2];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap,
      }}
    >
      {rows.map((i) => {
        const isSelected = i === 1;

        return (
          <div
            key={String(i)}
            style={{
              width: dotSize,
              height: dotSize,
              borderRadius: dotSize / 2,
              background: isSelected ? "#10b981" : "rgba(255,255,255,0.12)",
              border: isSelected
                ? "none"
                : `${borderPx}px solid rgba(255,255,255,0.38)`,
            }}
          />
        );
      })}
    </div>
  );
}
