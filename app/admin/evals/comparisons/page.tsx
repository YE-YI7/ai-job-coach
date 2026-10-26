import type {Metadata} from 'next';
import {redirect} from 'next/navigation';
import Link from 'next/link';
import {getCurrentUserFromRequest} from '@/lib/auth';
import {isEvalAdmin} from '@/lib/coach-harness/eval-access';
import ComparisonClient from './ComparisonClient';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {title: '简历六列对照 · 益职 Eval', robots: {index: false, follow: false}};
export default async function Page() {
  const user = await getCurrentUserFromRequest();
  if (!user) redirect('/login?redirect=%2Fadmin%2Fevals%2Fcomparisons');
  if (!isEvalAdmin(user)) return <main><h1>需要管理员权限</h1><Link href="/cockpit">返回工作区</Link></main>;
  return <ComparisonClient/>;
}
