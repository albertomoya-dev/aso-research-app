import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { integrationStatuses } from "@/lib/settings";

const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const ec = generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const serviceAccount = JSON.stringify({ type: "service_account", client_email: "rankeo@demo.iam.gserviceaccount.com", private_key: rsa });

const byId = (env: Record<string, string | undefined>) => new Map(integrationStatuses(env).map((i) => [i.id, i]));

describe("integrationStatuses", () => {
  it("lists every integration as not configured with an empty environment, except the database, which is required", () => {
    const s = byId({});
    expect([...s.keys()]).toEqual(["database", "password", "cron", "anthropic", "images", "email", "play", "asc"]);
    expect(s.get("database")!.state).toBe("invalid");
    for (const id of ["password", "cron", "anthropic", "images", "email", "play", "asc"] as const) expect(s.get(id)!.state).toBe("off");
    expect(s.get("play")!.write).toBeNull();
    expect([...s.values()].some((i) => i.testable)).toBe(false);
  });

  it("never returns the value of a variable, only whether it is set", () => {
    const env = {
      DATABASE_URL: "postgres://user:supersecret@host/db",
      ANTHROPIC_API_KEY: "sk-ant-secret-value",
      RESEND_API_KEY: "re_secret",
      ALERT_EMAIL: "me@example.com",
      GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: serviceAccount,
      ASC_ISSUER_ID: "issuer-123",
      ASC_KEY_ID: "KEY123",
      ASC_PRIVATE_KEY: ec,
      OPENAI_API_KEY: "sk-openai-secret",
    };
    const text = JSON.stringify(integrationStatuses(env));
    for (const secret of ["supersecret", "sk-ant-secret-value", "re_secret", "me@example.com", "BEGIN", "issuer-123", "KEY123", "sk-openai-secret"]) {
      expect(text).not.toContain(secret);
    }
    const s = byId(env);
    expect(s.get("anthropic")!.vars).toEqual([{ name: "ANTHROPIC_API_KEY", set: true, required: true }]);
  });

  it("marks Play and App Store Connect as read only unless writing is enabled", () => {
    const base = { GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: serviceAccount, ASC_ISSUER_ID: "i", ASC_KEY_ID: "k", ASC_PRIVATE_KEY: ec };
    let s = byId(base);
    expect(s.get("play")).toMatchObject({ state: "on", write: false, testable: true });
    expect(s.get("asc")).toMatchObject({ state: "on", write: false, testable: true });
    s = byId({ ...base, GOOGLE_PLAY_ALLOW_WRITE: "1", ASC_ALLOW_WRITE: "1" });
    expect(s.get("play")!.write).toBe(true);
    expect(s.get("asc")!.write).toBe(true);
  });

  it("flags broken configurations with the reason", () => {
    const s = byId({ GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: "not json", ASC_ISSUER_ID: "i", RESEND_API_KEY: "x", IMAGE_PROVIDER: "gemini" });
    expect(s.get("play")).toMatchObject({ state: "invalid", testable: false });
    expect(s.get("play")!.detail).toContain("no es un JSON válido");
    expect(s.get("asc")!.state).toBe("invalid");
    expect(s.get("email")).toMatchObject({ state: "invalid", detail: "Falta ALERT_EMAIL." });
    expect(s.get("images")!.state).toBe("invalid");
    expect(s.get("images")!.detail).toContain("GEMINI_API_KEY");
  });

  it("enables the email test only with both Resend variables, and picks the image provider from the key", () => {
    const s = byId({ RESEND_API_KEY: "x", ALERT_EMAIL: "y", GEMINI_API_KEY: "g" });
    expect(s.get("email")).toMatchObject({ state: "on", testable: true });
    expect(s.get("images")).toMatchObject({ state: "on", testable: false });
    expect(s.get("images")!.detail).toContain("Google Gemini");
  });

  it("treats blank values as not set", () => {
    const s = byId({ ANTHROPIC_API_KEY: "  ", APP_PASSWORD: "" });
    expect(s.get("anthropic")!.state).toBe("off");
    expect(s.get("password")!.state).toBe("off");
  });
});
