import { STORE_LABEL, type Store } from "@/lib/stores/types";

export function StoreBadge({ store, country }: { store: Store; country?: string }) {
  const tone = store === "ios" ? "bg-ios-bg text-ios-fg" : "bg-android-bg text-android-fg";
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ${tone}`}>
      <StoreGlyph store={store} />
      {STORE_LABEL[store]}
      {country && ` · ${country.toUpperCase()}`}
    </span>
  );
}

function StoreGlyph({ store }: { store: Store }) {
  return store === "ios" ? (
    <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <path d="M8 17l6-10M16 17l-2-3.5M5 14h10M17 14h2" />
    </svg>
  ) : (
    <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M5 3.5v17l9.5-8.5L5 3.5zm11 7.2l2.8-1.6c.9.5.9 1.8 0 2.4L16 13.3l-1.2-1.3 1.2-1.3z" />
    </svg>
  );
}
