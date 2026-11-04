import { describe, expect, it } from "vitest";
import { productListingUpdate } from "@/lib/products";

// The product's title and icon follow its primary market's listing (the lowest apps.id).

describe("productListingUpdate", () => {
  const product = { title: "Recordatorio", icon: "icon-old" };

  it("takes the new title and icon from the primary market", () => {
    expect(productListingUpdate(3, [7, 3, 9], product, { title: "Recordatorio: pastillas", icon: "icon-new" })).toEqual({
      title: "Recordatorio: pastillas",
      icon: "icon-new",
    });
  });

  it("ignores the other markets, whatever their listing says", () => {
    expect(productListingUpdate(7, [7, 3, 9], product, { title: "Pill Reminder", icon: "icon-us" })).toBeNull();
    expect(productListingUpdate(7, [], product, { title: "Pill Reminder", icon: "icon-us" })).toBeNull();
  });

  it("changes nothing when the listing is the same, and keeps a value the store left empty", () => {
    expect(productListingUpdate(3, [3], product, { title: "Recordatorio", icon: "icon-old" })).toBeNull();
    expect(productListingUpdate(3, [3], product, { title: "  ", icon: "icon-new" })).toEqual({ title: "Recordatorio", icon: "icon-new" });
    expect(productListingUpdate(3, [3], product, { title: "Nuevo", icon: "" })).toEqual({ title: "Nuevo", icon: "icon-old" });
  });
});
