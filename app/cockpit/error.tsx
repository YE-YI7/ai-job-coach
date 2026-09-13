"use client";
import {useTransition} from "react";
import {useRouter} from "next/navigation";
export default function CockpitError({reset}:{reset:()=>void}) {
 const router=useRouter();
 const [pending,startTransition]=useTransition();
 return <main style={{maxWidth:560,margin:"15vh auto",padding:24}}>
  <h1>暂时没能载入工作区</h1>
  <p>这不代表你的材料被删除了。请重新加载，不需要重新上传简历或粘贴 JD。</p>
  <button disabled={pending} onClick={()=>startTransition(()=>{router.refresh();reset();})}>{pending?"正在重新读取…":"重新加载我的资料"}</button>
 </main>;
}
