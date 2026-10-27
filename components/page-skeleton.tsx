import { Card, Skeleton } from "./ui";

/** Placeholder shown while a page's data loads, so navigation responds at once. */
export function PageSkeleton({ label = "Cargando" }: { label?: string }) {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label={label}>
      <div className="flex items-center gap-3.5">
        <Skeleton className="size-14" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
      <Card className="flex flex-col gap-3 p-6">
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="h-10 w-full" />
      </Card>
      <Card className="flex flex-col gap-3 p-6">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </Card>
    </div>
  );
}
