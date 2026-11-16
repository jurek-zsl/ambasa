"use client";
import type { ReactNode } from "react";
import {
  Dialog as Root,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
export function Dialog({
  title,
  onClose,
  children,
  className = "",
}: {
  title: string;
  onClose?: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Root
      open
      onOpenChange={(open) => {
        if (!open) onClose?.();
      }}
    >
      <DialogContent
        showCloseButton={!!onClose}
        className={`app-dialog max-h-[calc(100dvh-2rem)] overflow-y-auto p-6 sm:max-w-2xl ${className}`}
      >
        <DialogTitle render={<span />} className="sr-only">
          {title}
        </DialogTitle>
        {children}
      </DialogContent>
    </Root>
  );
}
