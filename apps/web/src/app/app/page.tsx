import type { Metadata } from "next";
import { MessengerApp } from "@/components/messenger/messenger";

export const metadata: Metadata = { title: "Messenger", robots: { index: false } };

export default function AppPage() {
  return <MessengerApp />;
}
