'use client';
import type {Opportunity} from '@/lib/opportunities/types';
import TutorMarkdown from './TutorMarkdown';
import styles from './ResumeHrCommentary.module.css';

export default function ResumeHrCommentary({quality}:{quality:Opportunity['applicationQuality']}){
  const review=quality?.reviews.find(item=>item.reviewerType==='independent_ai'
    &&item.status==='warning'&&item.summary.startsWith('独立 HR 点评'));
  if(!review)return null;
  return <details className={styles.details}>
    <summary>查看 HR 点评 · 供核对</summary>
    <TutorMarkdown>{review.summary}</TutorMarkdown>
  </details>;
}
