import type { Metadata } from "next";
import { MessengerApp } from "@/components/messenger/messenger";

export const metadata: Metadata = { title: "Ambasa" };

export default function AppPage() {
  return <MessengerApp />;
}
