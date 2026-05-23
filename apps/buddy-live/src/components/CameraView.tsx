"use client";

import { forwardRef, useEffect } from "react";
import { cn } from "@/lib/utils";

interface CameraViewProps {
  stream: MediaStream | null;
  className?: string;
  recording?: boolean;
}

export const CameraView = forwardRef<HTMLVideoElement, CameraViewProps>(
  function CameraView({ stream, className, recording }, ref) {
    useEffect(() => {
      const v = (ref as React.MutableRefObject<HTMLVideoElement | null> | null)?.current;
      if (v && v.srcObject !== stream) {
        v.srcObject = stream;
      }
    }, [stream, ref]);

    return (
      <div className={cn("relative h-full w-full overflow-hidden rounded-2xl bg-black", className)}>
        <video
          ref={ref}
          autoPlay
          muted
          playsInline
          className="h-full w-full object-cover [transform:scaleX(-1)]"
        />
        {recording && (
          <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-red-600/90 px-3 py-1 text-sm font-semibold text-white shadow-lg">
            <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
            REC
          </div>
        )}
      </div>
    );
  },
);
