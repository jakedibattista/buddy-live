"use client";

import { forwardRef, useEffect } from "react";
import { cn } from "@/lib/utils";

interface CameraViewProps {
  stream: MediaStream | null;
  className?: string;
}

export const CameraView = forwardRef<HTMLVideoElement, CameraViewProps>(
  function CameraView({ stream, className }, ref) {
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
      </div>
    );
  },
);
