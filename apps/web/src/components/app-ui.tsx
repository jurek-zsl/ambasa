"use client";
/** Base UI controls with shared native-style appearance and HTML form semantics. */
import type { ComponentProps } from "react";
import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { Button as StyledButton } from "@/components/ui/button";
import { Input as StyledInput } from "@/components/ui/input";
import { Textarea as StyledTextarea } from "@/components/ui/textarea";
import {
  NativeSelect as StyledSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function Button({
  className = "",
  type = "submit",
  ...props
}: ComponentProps<"button">) {
  const classes = className.split(/\s+/);
  if (!classes.includes("btn")) {
    const control = (
      <ButtonPrimitive type={type} className={className} {...props} />
    );
    return classes.includes("icon-btn") && props["aria-label"] ? (
      <Tooltip>
        <TooltipTrigger render={control} />
        <TooltipContent>{props["aria-label"]}</TooltipContent>
      </Tooltip>
    ) : (
      control
    );
  }
  const variant = classes.includes("danger")
    ? "destructive"
    : classes.includes("pri")
      ? "default"
      : classes.includes("text")
        ? "ghost"
        : "outline";
  const compact = classes.includes("sm");
  const extra = classes
    .filter((c) => !["btn", "pri", "sec", "text", "sm", "danger"].includes(c))
    .join(" ");
  return (
    <StyledButton
      type={type}
      variant={variant}
      size={compact ? "sm" : "default"}
      className={cn(
        compact
          ? "h-auto min-h-7 whitespace-normal px-2.5 py-1"
          : "h-auto min-h-8 whitespace-normal px-3 py-1.5",
        extra,
      )}
      {...props}
    />
  );
}
export function Input({ className, ...props }: ComponentProps<"input">) {
  return <StyledInput className={cn("h-8", className)} {...props} />;
}
export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <StyledTextarea
      className={cn(
        props.id === "composer"
          ? "min-h-6 resize-none rounded-none border-0 bg-transparent px-0 py-2 shadow-none focus-visible:ring-0"
          : "min-h-24",
        className,
      )}
      {...props}
    />
  );
}
export function NativeSelect(props: ComponentProps<typeof StyledSelect>) {
  return <StyledSelect {...props} />;
}
export { NativeSelectOption };
