import { Skeleton } from "@/components/ui/skeleton";

export default function FreightExchangeLoading() {
  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="border-b border-border/40 bg-card/60 px-4 py-3 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-5 w-5 rounded" />
            <div>
              <Skeleton className="h-5 w-36 mb-1" />
              <Skeleton className="h-4 w-56" />
            </div>
          </div>
          <Skeleton className="h-9 w-28" />
        </div>
      </div>

      {/* Filters */}
      <div className="border-b border-border/40 bg-card/30 px-4 py-2 sm:px-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <Skeleton className="h-9 w-full max-w-xs" />
          <Skeleton className="h-9 w-[140px]" />
          <Skeleton className="h-9 w-[140px]" />
          <Skeleton className="h-9 w-9" />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="grid gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="bg-card border border-border/50 rounded-lg p-4"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                    <Skeleton className="h-3 w-3 rounded" />
                  </div>
                  <Skeleton className="h-4 w-48 mb-2" />
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-4" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3 w-14" />
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Skeleton className="h-6 w-20" />
                  <Skeleton className="h-3 w-12" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
