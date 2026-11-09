'use client';
import type {Opportunity} from '@/lib/opportunities/types';
import TutorMarkdown from './TutorMarkdown';
import styles from './ResumeHrCommentary.module.css';

export default function ResumeHrCommentary({quality,stale=false}:{quality:Opportunity['applicationQuality'];stale?:boolean}){
  const review=quality?.reviews.find(item=>item.reviewerType==='independent_ai'
    &&item.status==='warning'&&item.summary.startsWith('独立 HR 点评'));
  if(!review)return null;
  return <details className={styles.details}>
    <summary>{stale?'查看修改前 HR 点评':'查看 HR 点评 · 供核对'}</summary>
    {stale&&<p>简历已变动，以下点评不覆盖你后来的修改。</p>}
    <TutorMarkdown>{review.summary}</TutorMarkdown>
  </details>;
}
