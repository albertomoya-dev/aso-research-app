"use client";

// Small form fields shared by the studio's sections.

export const fieldLabel = "flex flex-col gap-1.5 text-[13px] font-medium text-ink-soft";

/** A range input with its label and the current value (shown as `format(value)`). */
export function RangeField({
  label,
  value,
  min,
  max,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
}) {
  return (
    <label className={fieldLabel}>
      <span className="flex justify-between">
        {label} <span className="font-mono text-xs text-muted">{format(value)}</span>
      </span>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

export function CheckField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-[13px] text-ink-soft">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function ColorField({ label, value, onChange, onClear }: { label: string; value: string; onChange: (v: string) => void; onClear?: () => void }) {
  return (
    <label className={fieldLabel}>
      {label}
      <span className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 cursor-pointer rounded-md border border-line-strong bg-surface p-0.5"
        />
        <span className="font-mono text-xs text-muted">{value}</span>
        {onClear && (
          <button type="button" onClick={onClear} className="text-xs text-link hover:underline">
            Sin degradado
          </button>
        )}
      </span>
    </label>
  );
}
