import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserFromRequest } from "@/lib/auth";
import PhoneAuthForm from "@/components/auth/PhoneAuthForm";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";
export default async function PhoneAccountPage() {
  const user = await getCurrentUserFromRequest();
  if (!user) redirect("/login?redirect=%2Faccount%2Fphone");
  return <main className={styles.page}><div className={styles.content}>
    <Link href="/cockpit" className={styles.back}>返回工作区</Link>
    <h1>手机号与登录</h1>
    <p className={styles.intro}>给当前账号增加一种登录方式。不会新建账号，也不会移动你的简历、额度或作答。</p>
    <PhoneAuthForm purpose="bind" />
  </div></main>;
}
