import type { Metadata } from "next";
import HomeClient from "../HomeClient";

export const metadata: Metadata = {
  title: "益职 AI · 互动演示",
  robots: { index: false, follow: true },
};

// Only the existing fictional sample; no account, model or payment operation.
export default function DemoPage() { return <HomeClient />; }
