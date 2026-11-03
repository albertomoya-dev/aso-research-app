import { permanentRedirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { legacyAppId, legacyAppRedirect } from "@/lib/market-path";
import { marketRef } from "@/lib/products";

// Old app URLs (`/apps/[id]/…`, still in emails and bookmarks) answer with a 308 to the new one
// (`/a/[slug]/[country]/…`, see lib/market-path.ts `legacyAppRedirect`), keeping the query string.
// A route handler and not a page: a page would stream behind app/loading.tsx and the redirect could
// arrive as a <meta> tag with a 200 instead of a real 308. A non-numeric id (a future static
// `/apps/nueva` wins over this route anyway) or an unknown one is a 404.
export async function GET(request: NextRequest, ctx: RouteContext<"/apps/[id]/[[...rest]]">) {
  const { id, rest } = await ctx.params;
  const appId = legacyAppId(id);
  const market = appId ? await marketRef(appId) : null;
  const target = market ? legacyAppRedirect(market, rest, request.nextUrl.search) : null;
  if (!target) return new Response("Esta página no existe.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  permanentRedirect(target);
}
