"use client";
import { ThemeProvider, useTheme } from "next-themes";
import { useEffect } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toast";
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <ThemeChrome />
      <TooltipProvider delay={300}>
        <Toaster timeout={5000}>{children}</Toaster>
      </TooltipProvider>
    </ThemeProvider>
  );
}

/** Keep installed-app browser chrome in step with the chosen appearance. */
function ThemeChrome() {
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    if (!resolvedTheme) return;
    const color = resolvedTheme === "dark" ? "#171717" : "#f6f6f6";
    document
      .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
      .forEach((meta) => {
        meta.content = color;
        meta.removeAttribute("media");
      });
  }, [resolvedTheme]);
  return null;
}
