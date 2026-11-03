"use client";

import { ErrorCard } from "@/components/error-card";

// Errors outside the shells. The shells have their own error.tsx inside their layout, so the sidebar stays.
export default function Error(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="px-4 py-10 md:px-8">
      <ErrorCard {...props} />
    </main>
  );
}
