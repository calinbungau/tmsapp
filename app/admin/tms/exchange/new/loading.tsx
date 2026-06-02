import { Skeleton } from "@/components/ui/skeleton";

export default function NewOfferLoading() {
  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="border-b border-border/40 bg-card/60 px-4 py-3 sm:px-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-5 w-5 rounded" />
            <div>
              <Skeleton className="h-5 w-40 mb-1" />
              <Skeleton className="h-4 w-64" />
            </div>
          </div>
          <Skeleton className="h-9 w-32" />
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Title Section */}
          <div className="bg-card border border-border/50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-4">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="h-10 w-full" />
          </div>

          {/* Route Section */}
          <div className="bg-card border border-border/50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-4">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-4 w-16" />
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              {[1, 2].map((col) => (
                <div key={col} className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-7 w-20" />
                  </div>
                  {[1, 2, 3, 4, 5].map((row) => (
                    <div key={row}>
                      <Skeleton className="h-3 w-16 mb-1" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Schedule Section */}
          <div className="bg-card border border-border/50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-4">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-4 w-20" />
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              {[1, 2].map((col) => (
                <div key={col} className="space-y-3">
                  <Skeleton className="h-4 w-28" />
                  <div className="grid grid-cols-2 gap-2">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Cargo Section */}
          <div className="bg-card border border-border/50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-4">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-4 w-32" />
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
            <div className="grid grid-cols-5 gap-4 mt-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          </div>

          {/* Pricing Section */}
          <div className="bg-card border border-border/50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-4">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-4 w-20" />
            </div>
            <div className="grid md:grid-cols-4 gap-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>

          {/* Notes Section */}
          <div className="bg-card border border-border/50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-4">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-4 w-16" />
            </div>
            <Skeleton className="h-20 w-full" />
          </div>

          {/* Bottom buttons */}
          <div className="flex justify-end gap-3 pb-6">
            <Skeleton className="h-9 w-20" />
            <Skeleton className="h-9 w-32" />
          </div>
        </div>
      </div>
    </div>
  );
}
