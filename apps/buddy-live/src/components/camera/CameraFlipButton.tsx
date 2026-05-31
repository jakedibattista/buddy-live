"use client";

import { SwitchCamera } from "lucide-react";
import { cn } from "@/lib/utils";

interface CameraFlipButtonProps {
  onFlip: () => void;
  disabled?: boolean;
  className?: string;
}

export function CameraFlipButton({ onFlip, disabled, className }: CameraFlipButtonProps) {
  return (
    <button
      type="button"
      onClick={onFlip}
      disabled={disabled}
      aria-label="Switch camera"
      className={cn(
        "btn-glass flex h-10 w-10 items-center justify-center disabled:opacity-50",
        className,
      )}
    >
      <SwitchCamera size={18} />
    </button>
  );
}
