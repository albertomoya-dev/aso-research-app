import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { getDb, schema } from "@/db";

/** Serves a generated logo from the database. Rows never change, so browsers may cache them. */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  const row = await getDb().query.generatedImages.findFirst({ where: eq(schema.generatedImages.id, id) });
  if (!row) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return new NextResponse(Buffer.from(row.data, "base64"), {
    headers: { "content-type": row.mime, "cache-control": "private, max-age=31536000, immutable" },
  });
}
