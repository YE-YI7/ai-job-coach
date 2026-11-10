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
  const repairIncomplete = result?.f6Deliverables?.reviewExecution?.status === 'author_response_incomplete';
  const introduction = review && summary.endsWith(review) ? summary.slice(0, -review.length).trim() : summary;
  const status = repairIncomplete ? '草稿已保留，但返修还没完成，暂时不要当作终稿。'
    : result?.unchanged ? '本轮没有新增修改，原文保留。' : pendingCount === 0
    ? '修改已处理。你可以继续编辑，或导出 PDF。'
    : result?.partial ? '这轮完成了部分修改，先看看正文中的标记。' : '新稿已保存。先看看正文中的标记，再决定是否采纳。';
  return <>
    <p role="status"><strong>{status}</strong></p>
    {guidance && !repairIncomplete && <div aria-label="导师的补强建议">
      <TutorMarkdown className={styles.reply}>{guidance}</TutorMarkdown>
    </div>}
    {guidance && repairIncomplete && <details className={styles.outcomeDetails}>
      <summary>此前草稿的辅导 · 返修未完成</summary>
      <TutorMarkdown className={styles.reply}>{guidance}</TutorMarkdown>
    </details>}
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
