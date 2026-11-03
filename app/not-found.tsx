import Link from "next/link";
import { Card } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="px-4 py-10 md:px-8">
      <Card className="max-w-xl p-6">
        <h1 className="text-page-title font-semibold">No encontramos esa página</h1>
        <Link href="/" className="mt-3 inline-flex min-h-11 items-center text-sm text-link underline md:min-h-8">
          Volver al inicio
        </Link>
      </Card>
    </main>
  );
}
