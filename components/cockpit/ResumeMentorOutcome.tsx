'use client';
import type { ResumeAgentTask } from '@/lib/coach-harness/resume-task-types';
import TutorMarkdown from './TutorMarkdown';
import TutorReport from './TutorReport';
import styles from './ResumeAgentConversation.module.css';
import {currentF6MentorGuidance} from '@/lib/coach-harness/f6-mentor-guidance';

/** Separate the saved HR report from conversational delivery. No extra model,
 * summary inference, field rejection or loss of the original commentary. */
export default function ResumeMentorOutcome({result, pendingCount}: {
  result: ResumeAgentTask['result']; pendingCount?: number;
}) {
  const review = result?.applicationQuality?.reviews.find(item => item.reviewerType === 'independent_ai'
    && item.status === 'warning' && item.summary.startsWith('独立 HR 点评'))?.summary;
  const summary = result?.summary || '';
  const guidance = currentF6MentorGuidance(result?.f6Deliverables);
  const introduction = review && summary.endsWith(review) ? summary.slice(0, -review.length).trim() : summary;
  const status = result?.unchanged ? '本轮没有新增修改，原文保留。' : pendingCount === 0
    ? '修改已处理。你可以继续编辑，或导出 PDF。'
    : result?.partial ? '这轮完成了部分修改，先看看正文中的标记。' : '新稿已保存。先看看正文中的标记，再决定是否采纳。';
  return <>
    <p role="status"><strong>{status}</strong></p>
    {guidance && <div aria-label="导师的补强建议">
      <TutorMarkdown className={styles.reply}>{guidance}</TutorMarkdown>
    </div>}
    {introduction && <details className={styles.outcomeDetails}>
      <summary>查看本轮修改说明</summary>
      <TutorMarkdown className={styles.reply}>{introduction}</TutorMarkdown>
    </details>}
    {review && <details className={styles.outcomeDetails}>
      <summary>看看 HR 的建议</summary>
      <TutorReport>{review}</TutorReport>
    </details>}
  </>;
}
