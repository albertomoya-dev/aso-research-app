"use client";

import { ErrorCard } from "@/components/error-card";

export default function Error(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorCard {...props} />;
}
