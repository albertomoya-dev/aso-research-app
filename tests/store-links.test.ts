import { describe, expect, it } from "vitest";
import { storeLinkApp } from "@/lib/store-links";

describe("storeLinkApp", () => {
  it("reads the package of a Google Play link", () => {
    expect(storeLinkApp("https://play.google.com/store/apps/details?id=com.moyalogames.recordatorio&hl=es")).toEqual({ store: "android", id: "com.moyalogames.recordatorio" });
    expect(storeLinkApp("  https://play.google.com/store/apps/details?hl=es&id=com.a.b  ")).toEqual({ store: "android", id: "com.a.b" });
  });

  it("reads the id of an App Store link", () => {
    expect(storeLinkApp("https://apps.apple.com/es/app/recordatorio-pastillas/id1234567890")).toEqual({ store: "ios", id: "1234567890" });
    expect(storeLinkApp("https://apps.apple.com/us/app/x/id1234567890?l=es")).toEqual({ store: "ios", id: "1234567890" });
  });

  it("is null for anything else", () => {
    expect(storeLinkApp("recordatorio pastillas")).toBeNull();
    expect(storeLinkApp("com.moyalogames.recordatorio")).toBeNull();
    expect(storeLinkApp("https://play.google.com/store/search?q=x")).toBeNull();
    expect(storeLinkApp("https://play.google.com/store/apps/details?id=")).toBeNull();
    expect(storeLinkApp("https://example.com/id1234567890")).toBeNull();
  });
});
