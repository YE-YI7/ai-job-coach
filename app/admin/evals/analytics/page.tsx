import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { isEvalAdmin } from "@/lib/coach-harness/eval-access";
import AnalyticsClient from "./AnalyticsClient";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "数据 · 益职 Eval Lab",
  robots: { index: false, follow: false },
};
export default async function AnalyticsPage() {
  const user = await getCurrentUserFromRequest();
  if (!user) redirect("/login?redirect=%2Fadmin%2Fevals%2Fanalytics");
  if (!isEvalAdmin(user))
    return (
      <main style={{ maxWidth: 640, margin: "15vh auto", padding: 32 }}>
        <h1>需要管理员权限</h1>
        <p>没有读取用户数据。</p>
        <Link href="/cockpit">返回工作区</Link>
      </main>
    );
  return <AnalyticsClient />;
}
