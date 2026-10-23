import { getCurrentUserFromRequest } from "@/lib/auth";
import { isEvalAdmin } from "@/lib/coach-harness/eval-access";
import { redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";
export default async function EvalPage({searchParams}:{searchParams:Promise<{run?:string|string[]}>}) {
  const query=await searchParams;
  const run=typeof query.run==="string"?query.run:undefined;
  const validRun=!query.run||Boolean(run&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(run));
  const user = await getCurrentUserFromRequest();
  if (!user) redirect(`/login?redirect=${encodeURIComponent(`/admin/evals${validRun&&run?`?run=${run}`:""}`)}`);
  if (!isEvalAdmin(user))
    return (
      <main style={{ maxWidth: 640, margin: "15vh auto", padding: 32 }}>
        <h1>需要管理员权限</h1>
        <p>当前账号已登录，但不在站点管理员名单内。没有读取任何评测记录。</p>
        <Link href="/cockpit">返回工作区</Link>
      </main>
    );
  if(!validRun)return <main><h1>运行编号无效</h1><Link href="/admin/evals">返回运行列表</Link></main>;
  return (
    <iframe
      title="益职 Eval Lab 管理员工作台"
      src={`/eval-lab/index.html?live=1${run?`&run=${run}`:""}`}
      style={{ display: "block", width: "100%", height: "100dvh", border: 0 }}
    />
  );
}
