// Browser-only helper: saves a CSV the user exported (table selection, candidates…).

/** Downloads `csv` as `<name>.csv`. The BOM makes Excel read the accents as UTF-8. */
export function downloadCsv(name: string, csv: string): void {
  const url = URL.createObjectURL(new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.replace(/[^\p{L}\p{N}-]+/gu, "-")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
