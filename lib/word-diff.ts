/**
 * Word diff of two texts (the AI proposal against the editor), for showing it inline: what stays,
 * what is added and what is removed. LCS over tokens (words, single punctuation marks and runs of
 * whitespace), so concatenating the `same` and `removed` parts gives the old text back, and the `same`
 * and `added` parts give the new one: line breaks and spaces are preserved exactly.
 */

export type DiffPart = { type: "same" | "added" | "removed"; text: string };

/** Words (letters, digits, combining accents and inner apostrophes), whitespace runs, and any other character alone. */
const TOKEN = /[\p{L}\p{N}\p{M}]+(?:['’][\p{L}\p{N}\p{M}]+)*|\s+|[^\s\p{L}\p{N}\p{M}]/gu;

export function wordTokens(text: string): string[] {
  return text.match(TOKEN) ?? [];
}

/** Above this many cells the LCS table is skipped and the middle shows as one replacement (never hit by store fields). */
const MAX_CELLS = 8_000_000;

export function wordDiff(before: string, after: string): DiffPart[] {
  const a = wordTokens(before);
  const b = wordTokens(after);
  // Common start and end first: proposals usually keep most of the text, which shrinks the table a lot.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const parts: DiffPart[] = [];
  const push = (type: DiffPart["type"], text: string) => {
    if (!text) return;
    const last = parts.at(-1);
    if (last && last.type === type) last.text += text;
    else parts.push({ type, text });
  };
  push("same", a.slice(0, start).join(""));
  for (const p of middle(a.slice(start, endA), b.slice(start, endB))) push(p.type, p.text);
  push("same", a.slice(endA).join(""));
  return tidy(parts);
}

function middle(a: string[], b: string[]): DiffPart[] {
  const n = a.length;
  const m = b.length;
  if (n === 0 || m === 0 || (n + 1) * (m + 1) > MAX_CELLS) {
    return [
      { type: "removed", text: a.join("") },
      { type: "added", text: b.join("") },
    ];
  }
  // lcs[i][j]: LCS length of a[i..] and b[j..], flattened.
  const w = m + 1;
  const lcs = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * w + j] = a[i] === b[j] ? lcs[(i + 1) * w + j + 1] + 1 : Math.max(lcs[(i + 1) * w + j], lcs[i * w + j + 1]);
    }
  }
  const out: DiffPart[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: "same", text: a[i++] });
      j++;
    } else if (lcs[(i + 1) * w + j] >= lcs[i * w + j + 1]) out.push({ type: "removed", text: a[i++] });
    else out.push({ type: "added", text: b[j++] });
  }
  while (i < n) out.push({ type: "removed", text: a[i++] });
  while (j < m) out.push({ type: "added", text: b[j++] });
  return out;
}

const isBlank = (s: string) => /^\s+$/.test(s);

/**
 * Readable groups: a lone space kept between two changes («a b» → «x y» would show a, space, b crossed
 * out around x and y) is folded into them, and within each run of changes the removed text goes first
 * and the added text after, as one block each.
 */
function tidy(parts: DiffPart[]): DiffPart[] {
  const expanded: DiffPart[] = [];
  parts.forEach((p, k) => {
    const prev = parts[k - 1];
    const next = parts[k + 1];
    if (p.type === "same" && isBlank(p.text) && prev && next && prev.type !== "same" && next.type !== "same") {
      expanded.push({ type: "removed", text: p.text }, { type: "added", text: p.text });
    } else expanded.push(p);
  });
  const out: DiffPart[] = [];
  let removed = "";
  let added = "";
  const flush = () => {
    if (removed) out.push({ type: "removed", text: removed });
    if (added) out.push({ type: "added", text: added });
    removed = "";
    added = "";
  };
  for (const p of expanded) {
    if (p.type === "removed") removed += p.text;
    else if (p.type === "added") added += p.text;
    else {
      flush();
      const last = out.at(-1);
      if (last?.type === "same") last.text += p.text;
      else out.push({ ...p });
    }
  }
  flush();
  return out;
}

/** The old text (`same` + `removed`) and the new one (`same` + `added`), to check a diff. */
export function diffSides(parts: DiffPart[]): { before: string; after: string } {
  return {
    before: parts.filter((p) => p.type !== "added").map((p) => p.text).join(""),
    after: parts.filter((p) => p.type !== "removed").map((p) => p.text).join(""),
  };
}
