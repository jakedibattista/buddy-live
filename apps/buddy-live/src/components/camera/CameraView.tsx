"use client";

import { forwardRef, useEffect } from "react";
import { cn } from "@/lib/utils";

interface CameraViewProps {
  stream: MediaStream | null;
  className?: string;
  /** Mirror preview for front-facing camera (default true). */
  mirrored?: boolean;
}

export const CameraView = forwardRef<HTMLVideoElement, CameraViewProps>(
  function CameraView({ stream, className, mirrored = true }, ref) {
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
          className={cn(
            "h-full w-full object-cover",
            mirrored && "[transform:scaleX(-1)]",
          )}
        />
      </div>
    );
  },
);
