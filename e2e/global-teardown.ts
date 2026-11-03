import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { OverflowRecord } from "./fixtures";

/** Writes test-results/overflow.md: per route and width, the worst document and <main> overflow. */
export default function globalTeardown() {
  const file = "test-results/overflow.jsonl";
  if (!existsSync(file)) return;
  const records = readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as OverflowRecord);
  const worst = new Map<string, OverflowRecord>();
  for (const r of records) {
    const key = `${r.route}|${r.width}`;
    const prev = worst.get(key);
    const excess = (x: OverflowRecord) => Math.max(x.scrollWidth - x.innerWidth, x.mainScrollWidth - x.mainClientWidth);
    if (!prev || excess(r) > excess(prev)) worst.set(key, r);
  }
  const routes = [...new Set(records.map((r) => r.route))];
  const cell = (r?: OverflowRecord) => {
    if (!r) return "–";
    const doc = r.scrollWidth > r.innerWidth ? `**${r.scrollWidth}**` : `${r.scrollWidth}`;
    const main = r.mainScrollWidth > r.mainClientWidth ? ` · main **${r.mainScrollWidth}**/${r.mainClientWidth}` : "";
    return `${doc}${main}`;
  };
  const lines = [
    "| Ruta | 390 px (scrollWidth) | 1440 px (scrollWidth) | Elemento que sobresale |",
    "|---|---|---|---|",
    ...routes.map((route) => {
      const m = worst.get(`${route}|390`);
      const d = worst.get(`${route}|1440`);
      return `| ${route} | ${cell(m)} | ${cell(d)} | ${m?.widest ?? d?.widest ?? ""} |`;
    }),
  ];
  writeFileSync("test-results/overflow.md", lines.join("\n") + "\n");
  console.log("\nDesbordamiento horizontal (peor app por ruta):\n" + lines.join("\n"));
}
