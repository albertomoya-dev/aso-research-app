import Link from "next/link";
import { Card } from "@/components/ui";

export default function NotFound() {
  return (
    <Card className="max-w-xl p-6">
      <h1 className="text-xl font-bold">No encontramos esa página</h1>
      <Link href="/" className="mt-3 inline-block text-sm text-brand underline">Volver al panel</Link>
    </Card>
  );
}
