import { appendFileSync, mkdirSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { test as base, type Page } from "@playwright/test";

export type E2eApp = { id: number; title: string; keywordId: number | null };

/** Every followed app in the test database, with one of its keywords for the detail page. */
async function loadApps(): Promise<E2eApp[]> {
  const sql = neon(process.env.E2E_RESOLVED_DATABASE_URL!);
  const rows = (await sql`
    select a.id, a.title, min(ak.keyword_id) as keyword_id
    from apps a left join app_keywords ak on ak.app_id = a.id
    group by a.id, a.title order by a.id`) as { id: number; title: string; keyword_id: number | null }[];
  return rows.map((r) => ({ id: Number(r.id), title: r.title, keywordId: r.keyword_id == null ? null : Number(r.keyword_id) }));
}

export const test = base.extend<object, { apps: E2eApp[] }>({
  apps: [
    async ({}, use) => {
      await use(await loadApps());
    },
    { scope: "worker" },
  ],
});

export { expect } from "@playwright/test";

export const VIEWPORTS = [
  { name: "móvil", width: 390, height: 844 },
  { name: "escritorio", width: 1440, height: 900 },
] as const;

/** Console errors and uncaught exceptions while the page is open. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

export type OverflowRecord = {
  route: string;
  path: string;
  width: number;
  /** document.documentElement.scrollWidth and window.innerWidth: the page itself scrolls sideways when the first is larger. */
  scrollWidth: number;
  innerWidth: number;
  /** <main> scrolls on its own from `md` up, so on desktop the overflow shows up here instead. */
  mainScrollWidth: number;
  mainClientWidth: number;
  /** The element that sticks out the most without a scrolling ancestor to contain it. */
  widest?: string;
};

/**
 * Horizontal overflow of the document and of <main>, and the element responsible. Recorded, not
 * asserted, until the redesign removes it (DESIGN.md: the body never scrolls sideways).
 */
export async function measureOverflow(page: Page): Promise<Omit<OverflowRecord, "route" | "path" | "width">> {
  return page.evaluate(() => {
    const innerWidth = window.innerWidth;
    const scrollWidth = document.documentElement.scrollWidth;
    const main = document.querySelector("main");
    const mainScrollWidth = main?.scrollWidth ?? 0;
    const mainClientWidth = main?.clientWidth ?? 0;
    const mainRight = main ? main.getBoundingClientRect().right : innerWidth;
    let widest: string | undefined;
    const limit = scrollWidth > innerWidth ? innerWidth : mainScrollWidth > mainClientWidth ? mainRight : null;
    if (limit != null) {
      let max = limit + 1;
      // A scrolling ancestor contains its in-flow children, but an absolutely positioned element
      // (an sr-only label, a tooltip) escapes it unless that ancestor, or one below it, is positioned.
      const contained = (el: HTMLElement) => {
        let absolute = getComputedStyle(el).position === "absolute";
        for (let p = el.parentElement; p && p !== main && p !== document.body; p = p.parentElement) {
          const style = getComputedStyle(p);
          if (style.overflowX !== "visible" && !absolute) return true;
          if (absolute && style.position !== "static") absolute = style.overflowX !== "visible" ? false : style.position === "absolute";
          if (!absolute && style.overflowX !== "visible") return true;
        }
        return false;
      };
      for (const el of Array.from(document.body.querySelectorAll<HTMLElement>("main *, body > div > nav *"))) {
        const right = el.getBoundingClientRect().right;
        if (right > max && !contained(el)) {
          max = right;
          const cls = typeof el.className === "string" ? el.className.split(" ").slice(0, 3).join(".") : "";
          widest = `${el.tagName.toLowerCase()}${cls ? "." + cls : ""} (${Math.round(right)}px)`;
        }
      }
    }
    return { scrollWidth, innerWidth, mainScrollWidth, mainClientWidth, widest };
  });
}

export function recordOverflow(record: OverflowRecord) {
  mkdirSync("test-results", { recursive: true });
  appendFileSync("test-results/overflow.jsonl", JSON.stringify(record) + "\n");
}
