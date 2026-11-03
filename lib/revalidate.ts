import { revalidatePath } from "next/cache";
import { marketPath, type MarketRef, productPath } from "./market-path";
import { marketRef } from "./products";

type Target = number | MarketRef;

const resolve = async (target: Target) => (typeof target === "number" ? marketRef(target) : target);

/**
 * Revalidates a page of a market (`sub` like "/ficha"), or with "layout" every page under it.
 * The keywords page answers at both `/a/[app]/[market]` and `…/keywords`, so both are revalidated.
 * Takes the market id (looked up) or its slug and country. Does nothing for a market that no longer exists.
 */
export async function revalidateMarket(target: Target, sub = "", type?: "layout" | "page"): Promise<void> {
  const ref = await resolve(target);
  if (!ref) return;
  revalidatePath(marketPath(ref, sub), type);
  if (sub === "" && type !== "layout") revalidatePath(marketPath(ref, "/keywords"));
  if (sub === "/keywords") revalidatePath(marketPath(ref));
}

/**
 * Revalidates a page of the app as a whole (`sub` like "/creativos/logo"); with "layout" and no `sub`,
 * every page of the product, every market included.
 */
export async function revalidateProduct(target: Target, sub = "", type?: "layout" | "page"): Promise<void> {
  const ref = await resolve(target);
  if (!ref) return;
  revalidatePath(productPath(ref.productSlug, sub), type);
}
