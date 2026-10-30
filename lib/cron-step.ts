export type StepResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** Runs one step of the job; a failure is reported instead of aborting the steps after it. */
export async function runStep<T>(run: () => Promise<T>): Promise<StepResult<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
