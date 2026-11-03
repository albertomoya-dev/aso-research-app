import { Card, Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Buscando">
      <Skeleton className="h-14 w-80" />
      <Skeleton className="h-20 w-full" />
      <div className="flex flex-wrap gap-6">
        <Card className="flex flex-[1_1_340px] flex-col gap-4 p-5">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex items-center gap-3.5">
              <Skeleton className="size-13" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </Card>
        <Card className="flex flex-[2_1_560px] flex-col gap-4 p-6">
          <Skeleton className="h-20 w-1/2" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-40 w-full" />
        </Card>
      </div>
    </div>
  );
}
