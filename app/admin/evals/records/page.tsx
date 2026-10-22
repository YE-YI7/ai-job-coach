import type {Metadata} from 'next';
import Link from 'next/link';
import {redirect} from 'next/navigation';
import {getCurrentUserFromRequest} from '@/lib/auth';
import {isEvalAdmin} from '@/lib/coach-harness/eval-access';
import RecordsClient from './RecordsClient';
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'开发记录 · 益职 Eval Lab',robots:{index:false,follow:false}};
export default async function RecordsPage(){
 const user=await getCurrentUserFromRequest();
 if(!user)redirect('/login?redirect=%2Fadmin%2Fevals%2Frecords');
 if(!isEvalAdmin(user))return <main><h1>需要管理员权限</h1><p>没有读取任何记录。</p><Link href="/cockpit">返回工作区</Link></main>;
 return <RecordsClient/>;
}
