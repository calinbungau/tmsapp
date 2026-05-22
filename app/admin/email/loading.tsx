import { LoadingSpinner } from "@/components/ui/loading";

export default function EmailLoading() {
  return (
    <div className="flex items-center justify-center h-screen bg-background">
      <div className="flex flex-col items-center gap-3">
        <LoadingSpinner />
        <p className="text-sm text-muted-foreground">Loading email...</p>
      </div>
    </div>
  );
}
