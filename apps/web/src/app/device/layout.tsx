import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "Connect a device", robots: { index: false } };

export default function DeviceLayout({ children }: { children: ReactNode }) {
  return children;
}
