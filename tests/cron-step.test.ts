import { describe, expect, it } from "vitest";
import { runStep } from "@/lib/cron-step";

describe("runStep", () => {
  it("returns the value or the error, so one failing step does not stop the next ones", async () => {
    expect(await runStep(async () => 3)).toEqual({ ok: true, value: 3 });
    expect(await runStep(async () => Promise.reject(new Error("Sin conexión")))).toEqual({ ok: false, error: "Sin conexión" });
    expect(await runStep(() => Promise.reject("raro"))).toEqual({ ok: false, error: "raro" });
  });
});
