import { getCurrentUserFromRequest } from "@/lib/auth";
import { isEvalAdmin } from "@/lib/coach-harness/eval-access";
import { redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";
export default async function EvalPage() {
  const user = await getCurrentUserFromRequest();
  if (!user) redirect("/login?redirect=%2Fadmin%2Fevals");
  if (!isEvalAdmin(user))
    return (
      <main style={{ maxWidth: 640, margin: "15vh auto", padding: 32 }}>
        <h1>需要管理员权限</h1>
        <p>当前账号已登录，但不在站点管理员名单内。没有读取任何评测记录。</p>
        <Link href="/cockpit">返回工作区</Link>
      </main>
    );
  return (
    <iframe
      title="益职 Eval Lab 管理员工作台"
      src="/eval-lab/index.html?live=1"
      style={{ display: "block", width: "100%", height: "100dvh", border: 0 }}
    />
  );
}
