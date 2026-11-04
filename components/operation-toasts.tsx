"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { getOperations, getServerOperations, isOperationPage, markNotified, stepIndex, subscribeOperations } from "@/lib/long-operations";

/**
 * Mounted once in app/layout.tsx (inside Suspense: it reads the query). While a long AI operation runs and the user is on another page, a
 * loading toast shows its step; when it ends there, the toast turns into «… listo» with «Ver
 * resultado». On the page where it started, the page itself shows the progress and the result.
 */
export function OperationToasts() {
  const operations = useSyncExternalStore(subscribeOperations, getOperations, getServerOperations);
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const running = operations.some((o) => o.status === "running");

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);

  useEffect(() => {
    for (const op of operations) {
      // Path and query: the listing editor of another language is another page.
      const onPage = isOperationPage(op.href, search ? `${pathname}?${search}` : pathname);
      // An "always" operation has no progress on its page (a floating bar started it), so it toasts here too.
      const here = onPage && op.notify === "away";
      if (op.status === "running") {
        if (here) toast.dismiss(op.key);
        else {
          const step = op.steps[stepIndex(op.steps.length, op.stepMs, now - op.startedAt)];
          toast.loading(op.label, { id: op.key, description: step, duration: Infinity });
        }
        continue;
      }
      if (op.notified) continue;
      markNotified(op.key);
      if (here) {
        toast.dismiss(op.key);
        continue;
      }
      const action = onPage ? undefined : { label: "Ver resultado", onClick: () => router.push(op.href) };
      if (op.status === "error") toast.error(op.label, { id: op.key, description: op.error, action, duration: 10_000 });
      else toast.success(op.doneLabel, { id: op.key, description: undefined, action, duration: 15_000 });
    }
  }, [operations, pathname, search, now, router]);

  return null;
}
