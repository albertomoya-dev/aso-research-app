import { describe, expect, it } from "vitest";
import { INTEGRATION_GUIDES } from "@/lib/integration-guides";
import { integrationStatuses } from "@/lib/settings";

describe("«Cómo conectar» guides", () => {
  it("exist for every integration, name only its variables and mention each required one in the steps", () => {
    for (const i of integrationStatuses({})) {
      const guide = INTEGRATION_GUIDES[i.id];
      expect(guide.steps.length, i.id).toBeGreaterThan(1);
      const names = i.vars.map((v) => v.name);
      for (const v of guide.vars) expect(names, `${i.id}: ${v}`).toContain(v);
      for (const v of i.vars.filter((x) => x.required)) {
        expect(guide.vars, `${i.id}: ${v.name}`).toContain(v.name);
        expect(guide.steps.join(" "), `${i.id}: ${v.name}`).toContain(v.name);
      }
    }
  });
});
