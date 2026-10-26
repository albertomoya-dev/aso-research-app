const dash = <span className="text-muted">–</span>;

export function PopularityBar({ value }: { value: number | null }) {
  if (value == null) return dash;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 rounded-full bg-surface-muted" aria-hidden="true">
        <div className="h-1.5 rounded-full bg-brand" style={{ width: `${value}%` }} />
      </div>
      <span className="font-mono text-[13px]">{value}</span>
    </div>
  );
}

export function difficultyLabel(value: number): string {
  return value < 35 ? "Baja" : value < 65 ? "Media" : "Alta";
}

export function Difficulty({ value }: { value: number | null }) {
  if (value == null) return dash;
  return (
    <span className="text-[13px]">
      {difficultyLabel(value)} <span className="font-mono text-muted">{value}</span>
    </span>
  );
}

export function OpportunityBadge({ value }: { value: number | null }) {
  if (value == null) return dash;
  const tone = value >= 50 ? "bg-android-bg text-android-fg" : value >= 25 ? "bg-brand-soft text-brand-strong" : "bg-surface-muted text-ink-soft";
  return <span className={`inline-block min-w-9 rounded-md px-2 py-1 text-center font-mono text-[13px] font-semibold ${tone}`}>{value}</span>;
}
