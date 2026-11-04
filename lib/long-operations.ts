"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

// Long AI operations (20 to 60 s: ideas, «Optimizar con IA», «Adaptar», review analysis, release
// notes, relevance) outlive the component that started them. The server action keeps running when
// the user navigates away (Next's router lets a navigation pre-empt it, but the caller's promise
// still resolves), so its result is kept here, keyed by what it is about, and the page shows it again
// on return. components/operation-toasts.tsx tells the user, with «Ver resultado», when it finishes
// somewhere else. Server actions stay as they are: this only wraps the call.

export type OperationStatus = "running" | "done" | "error";

export type Operation = {
  key: string;
  /** What is running, for the toast: «Analizando las reseñas». */
  label: string;
  /** What the toast says when it finishes: «Análisis de reseñas listo». */
  doneLabel: string;
  /** "away" (default): toasts only when the user left the page, which shows the progress itself. "always": toasts here too. */
  notify: "away" | "always";
  /** Where the result shows (path and query when it started). */
  href: string;
  /** Labels shown one after another while the action runs (time-based: the server reports no progress). */
  steps: string[];
  stepMs: number;
  startedAt: number;
  status: OperationStatus;
  /** The action's last return value. */
  state: unknown;
  error?: string;
  /** Set once the finish has been told (toast or page), so it is told once. */
  notified: boolean;
};

const operations = new Map<string, Operation>();
const listeners = new Set<() => void>();
let snapshot: Operation[] = [];
const EMPTY: Operation[] = [];

function emit() {
  snapshot = [...operations.values()];
  for (const l of listeners) l();
}

function update(key: string, patch: Partial<Operation>) {
  const op = operations.get(key);
  if (!op) return;
  operations.set(key, { ...op, ...patch });
  emit();
}

export function subscribeOperations(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const getOperations = () => snapshot;
export const getServerOperations = () => EMPTY;

/** Forgets a finished operation (its result was used: saved, applied or discarded). */
export function clearOperation(key: string) {
  const op = operations.get(key);
  if (!op || op.status === "running") return;
  operations.delete(key);
  emit();
}

export function markNotified(key: string) {
  if (operations.get(key)?.notified === false) update(key, { notified: true });
}

/** Index of the step to show `elapsed` ms after the start; the last one stays until the action ends. */
export function stepIndex(steps: number, stepMs: number, elapsed: number): number {
  if (steps <= 0) return -1;
  return Math.min(steps - 1, Math.max(0, Math.floor(elapsed / stepMs)));
}

/** An action's `{ error }` field, if any: most of ours report failures that way. */
function errorOf(state: unknown): string | undefined {
  if (state && typeof state === "object" && "error" in state) {
    const e = (state as { error?: unknown }).error;
    if (typeof e === "string" && e) return e;
  }
  return undefined;
}

export type LongActionOptions<S = unknown> = {
  label: string;
  /** Or a function of the result: «12 de 14 valoradas con IA». */
  doneLabel: string | ((state: S) => string);
  notify?: "away" | "always";
  steps: string[];
  /** Time per step label; 8 s by default. */
  stepMs?: number;
};

/**
 * Query parameters that start an operation when a page opens (`?adaptar=1` on the listing editor). They are
 * never kept in an operation's `href`: «Ver resultado» would open the page with them and pay for it again.
 */
export const AUTO_RUN_PARAMS = ["adaptar"] as const;

/** Query parameters of an overlay on the page (the keyword panel, `?k=`): they do not make it another page. */
const OVERLAY_PARAMS = ["k"];

/** `pathname` + `search` without the auto-run parameters: where an operation's result shows. */
export function operationHref(pathname: string, search: string): string {
  const q = new URLSearchParams(search);
  for (const p of AUTO_RUN_PARAMS) q.delete(p);
  return q.size ? `${pathname}?${q}` : pathname;
}

/** Whether `current` (path and query) is the page an operation started on: same path and same query, in any order. */
export function isOperationPage(href: string, current: string): boolean {
  const normal = (h: string) => {
    const [path, search = ""] = h.split("?");
    const q = new URLSearchParams(search);
    for (const p of [...AUTO_RUN_PARAMS, ...OVERLAY_PARAMS]) q.delete(p);
    q.sort();
    return `${path}?${q}`;
  };
  return normal(href) === normal(current);
}

/** Whether an operation is kept under `key`, running or with a result not yet used. */
export const hasOperation = (key: string) => operations.has(key);

/** Starts `run` under `key` unless it is already running. */
export function startOperation<S>(key: string, options: LongActionOptions<S>, run: (prev: S | null) => Promise<S>) {
  const previous = operations.get(key);
  if (previous?.status === "running") return;
  const href = typeof window === "undefined" ? "" : operationHref(window.location.pathname, window.location.search);
  operations.set(key, {
    key,
    label: options.label,
    doneLabel: typeof options.doneLabel === "string" ? options.doneLabel : options.label,
    notify: options.notify ?? "away",
    href,
    steps: options.steps,
    stepMs: options.stepMs ?? 8000,
    startedAt: Date.now(),
    status: "running",
    state: previous?.state ?? null,
    notified: false,
  });
  emit();
  run((previous?.state as S | undefined) ?? null).then(
    (state) => {
      const error = errorOf(state);
      const doneLabel = typeof options.doneLabel === "function" && !error ? options.doneLabel(state) : undefined;
      update(key, { status: error ? "error" : "done", state, error, ...(doneLabel ? { doneLabel } : {}) });
    },
    () => update(key, { status: "error", error: "No se pudo terminar. Comprueba la conexión y vuelve a intentarlo." }),
  );
}

/** The current step label of a running operation, ticking every second. */
export function useOperationStep(op: Operation | undefined): { index: number; label: string | null } {
  const running = op?.status === "running";
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);
  if (!op || !running) return { index: -1, label: null };
  const index = stepIndex(op.steps.length, op.stepMs, Math.max(0, now - op.startedAt));
  return { index, label: op.steps[index] ?? null };
}

/**
 * `useActionState` for a long action: `[state, dispatch, pending, op]`. The state lives in the store
 * above under `key`, so it survives leaving the page, and `dispatch` returns at once (a form using it
 * as `action` is not held in a transition while the AI works).
 */
export function useLongAction<S>(
  key: string,
  action: (prev: S | null, formData: FormData) => Promise<S>,
  /** Or a function of the submitted form, when one action has several intents. */
  options: LongActionOptions<S> | ((formData: FormData) => LongActionOptions<S>),
): [S | null, (formData: FormData) => void, boolean, Operation | undefined] {
  const all = useSyncExternalStore(subscribeOperations, getOperations, getServerOperations);
  const op = all.find((o) => o.key === key);
  const dispatch = (formData: FormData) =>
    startOperation<S>(key, typeof options === "function" ? options(formData) : options, (prev) => action(prev, formData));
  return [(op?.state as S | undefined) ?? null, dispatch, op?.status === "running", op];
}
