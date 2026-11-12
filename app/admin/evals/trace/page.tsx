import {getCurrentUserFromRequest} from '@/lib/auth';
import {isEvalAdmin} from '@/lib/coach-harness/eval-access';
import {redirect} from 'next/navigation';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export default async function TracePage({searchParams}: {
  searchParams:Promise<{run?:string}>;
}) {
  const {run} = await searchParams;
  const valid = !run || /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(run);
  const suffix = valid && run ? `?run=${encodeURIComponent(run)}` : '';
  const user = await getCurrentUserFromRequest();
  if (!user) redirect(`/login?redirect=${encodeURIComponent('/admin/evals/trace' + suffix)}`);
  if (!isEvalAdmin(user)) return <main><h1>需要管理员权限</h1><Link href="/cockpit">返回工作区</Link></main>;
  if (!valid) return <main><h1>运行编号无效</h1><Link href="/admin/evals/trace">返回最新运行</Link></main>;
  return <iframe title="Trace 竖向动线" src={`/eval-lab/brief.html${suffix}`}
    style={{display:'block',width:'100%',height:'100dvh',border:0}} />;
}
