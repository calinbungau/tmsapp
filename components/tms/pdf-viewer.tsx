"use client";

import { useState } from "react";
import { FileText, ExternalLink, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PdfViewerProps {
  fileUrl: string;
}

export function PdfViewer({ fileUrl }: PdfViewerProps) {
  const [scale, setScale] = useState(100);
  const [hasError, setHasError] = useState(false);

  if (!fileUrl) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <FileText className="h-12 w-12 opacity-30" />
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <FileText className="h-12 w-12 text-muted-foreground opacity-30" />
        <p className="text-sm text-muted-foreground">Could not render PDF preview</p>
        <a
          href={fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-primary underline flex items-center gap-1"
        >
          <ExternalLink className="h-3 w-3" /> Open in new tab
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Zoom controls */}
      <div className="flex items-center justify-center gap-2 py-1.5 border-b bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setScale(s => Math.max(50, s - 25))}>
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <span className="text-xs text-muted-foreground w-12 text-center">{scale}%</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setScale(s => Math.min(200, s + 25))}>
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
        <a
          href={fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-2"
        >
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </a>
      </div>

      {/* PDF embed - uses browser native PDF rendering */}
      <div className="flex-1 overflow-auto">
        <div style={{ width: `${scale}%`, minWidth: "100%", height: "100%" }}>
          <embed
            src={`${fileUrl}#toolbar=0&navpanes=0`}
            type="application/pdf"
            className="w-full h-full"
            onError={() => setHasError(true)}
          />
        </div>
      </div>
    </div>
  );
}
