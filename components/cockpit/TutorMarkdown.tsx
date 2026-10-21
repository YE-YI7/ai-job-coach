"use client";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { memo } from 'react';
import styles from "./AgentConversation.module.css";
import contentStyles from './TutorMarkdown.module.css';
import {readableTutorText,stableTutorMarkdownPrefix} from "@/lib/coach-harness/tutor-format";

// No raw HTML or remote images: model output is untrusted, including while streaming.
export default memo(function TutorMarkdown({children,className='',streaming=false}:{children:string;className?:string;streaming?:boolean}) {
  const visible=children.split("<followups>")[0];
  return <div className={`${styles.markdown} ${contentStyles.content} ${className}`}><Markdown remarkPlugins={[remarkGfm]} skipHtml components={{
    img:()=>null,
    a:({href,children})=><a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
  }}>{readableTutorText(streaming?stableTutorMarkdownPrefix(visible):visible)}</Markdown></div>;
});
