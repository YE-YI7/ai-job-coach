import type {ResumeChange} from '@/lib/opportunities/types';
import styles from './ResumeInlineReview.module.css';

/** Notices are attached to the exact candidate, not a new gate or verdict. */
export default function ResumeEvidenceNotices({change}:{change:ResumeChange}){
  const notices=(change.evidenceNotices||[]).filter(notice=>
    notice.start>=0&&notice.end>notice.start&&change.after.slice(notice.start,notice.end)===notice.quote);
  if(!notices.length)return null;
  return <div className={styles.evidenceNotices}>
    <p>有 {notices.length} 处依据待确认，仍可采纳或保留原文。</p>
    <ul aria-label="依据待确认的表述" tabIndex={0}>{notices.map(notice=>
      <li key={`${notice.code}:${notice.start}:${notice.end}`}>
        <mark>{notice.quote}</mark><span>{notice.message}</span>
      </li>)}</ul>
  </div>;
}
