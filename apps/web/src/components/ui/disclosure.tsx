"use client";

import type { ReactNode } from "react";
import { ChevronRightIcon } from "@heroicons/react/24/outline";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./collapsible";
import { cn } from "@/lib/utils";

/** Shared disclosure motion; mounted panels preserve form state while closed. */
export function Disclosure({
  title,
  children,
  className,
  defaultOpen = false,
}: {
  title: ReactNode;
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
}) {
  return (
    <Collapsible
      defaultOpen={defaultOpen}
      className={cn("disclosure", className)}
    >
      <CollapsibleTrigger className="disclosure-trigger" type="button">
        <ChevronRightIcon className="disclosure-chevron" aria-hidden="true" />
        <span>{title}</span>
      </CollapsibleTrigger>
      <CollapsibleContent keepMounted>
        <div className="disclosure-body">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}
