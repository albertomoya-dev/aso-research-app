import { COUNTRIES } from "@/lib/countries";
import { inputClass } from "./ui";

export function CountrySelect({ defaultValue, name = "country" }: { defaultValue: string; name?: string }) {
  return (
    <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-soft">
      País
      <select name={name} defaultValue={defaultValue} className={inputClass}>
        {COUNTRIES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}
