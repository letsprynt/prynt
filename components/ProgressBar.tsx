"use client";

export function ProgressBar({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div>
      <div className="progress">
        <div style={{ width: `${clamped}%` }} />
      </div>
      <div className="note">{clamped.toFixed(2)}% of the bonding curve sold</div>
    </div>
  );
}
