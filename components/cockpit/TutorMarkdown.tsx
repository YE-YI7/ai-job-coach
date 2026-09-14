"use client";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "./AgentConversation.module.css";

// No raw HTML or remote images: model output is untrusted, including while streaming.
export default function TutorMarkdown({children}:{children:string}) {
  return <div className={styles.markdown}><Markdown remarkPlugins={[remarkGfm]} skipHtml components={{
    img:()=>null,
    a:({href,children})=><a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
  }}>{children.split("<followups>")[0]}</Markdown></div>;
}
