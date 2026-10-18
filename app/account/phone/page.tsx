import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { getDbClient } from "@/lib/db";
import PhoneAuthForm from "@/components/auth/PhoneAuthForm";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";
export default async function PhoneAccountPage({searchParams}:{searchParams:Promise<{recover?:string}>}) {
  const user = await getCurrentUserFromRequest();
  const recovery=(await searchParams).recover==='1';
  const returnPath=recovery?'/account/phone?recover=1':'/account/phone';
  if (!user) redirect(`/login?method=email&redirect=${encodeURIComponent(returnPath)}`);
  const db=await getDbClient();
  const {data:account,error}=db?await db.from('users').select('provider,nickname').eq('id',user.id).single():{data:null,error:true};
  if(error||!account)throw new Error('暂时无法核对账号，请刷新重试；没有修改任何资料。');
  const chooseOriginal=recovery&&account.provider==='phone';
  return <main className={styles.page}><div className={styles.content}>
    <Link href="/cockpit" className={styles.back}>返回工作区</Link>
    <h1>{chooseOriginal?'找回原来的工作区':recovery?'给原账号关联手机号':'手机号与登录'}</h1>
    <p className={styles.intro}>{chooseOriginal?'先用原来的方式登录，再验证手机号。已有简历、岗位和作答继续留在原账号。':recovery?`已登录原账号${account.nickname?` · ${account.nickname}`:''}。接下来验证你要用于登录的手机号。`:'给当前账号增加一种登录方式。不会新建账号，也不会移动你的简历、额度或作答。'}</p>
    {chooseOriginal?<nav className={styles.recoveryChoices} aria-label="验证原账号">
      <Link href="/api/auth/watcha/authorize?redirect=%2Faccount%2Fphone%3Frecover%3D1">用原观猹账号继续 <span aria-hidden="true">→</span></Link>
      <Link href="/login?method=email&redirect=%2Faccount%2Fphone%3Frecover%3D1">用原邮箱 / 邀请码继续 <span aria-hidden="true">→</span></Link>
      <p>这里只增加手机号登录，不会把两个账号的内容混在一起。</p>
    </nav>:<PhoneAuthForm purpose="bind" recovery={recovery} />}
    {!recovery&&account.provider==='phone'&&<Link className={styles.back} href="/account/phone?recover=1">以前有求职资料？找回原来的工作区</Link>}
  </div></main>;
}
