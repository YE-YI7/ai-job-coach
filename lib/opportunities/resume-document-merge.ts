import type {ResumeChange} from './types';
import {applyResumeChanges} from '../coach-harness/application-quality';

/** A whole-document F6 suggestion is not an overlapping paragraph suggestion.
 * Keep the previous confirmed text as the existing reversible decision shape;
 * never silently accept the new document or discard it because old accepted
 * ranges lie inside it. Rejection restores the exact prior choices and IDs. */
export function mergeResumeDocumentChanges(source:string,previous:ResumeChange[],proposed:ResumeChange[]):ResumeChange[]{
  if(!previous.some(change=>change.status!=='pending'))return proposed;
  const next=applyResumeChanges(source,proposed);
  const decided=previous.filter(change=>change.status!=='pending');
  const baseline=applyResumeChanges(source,decided);
  if(next.findings.length||baseline.findings.length)throw Error('F6_DOCUMENT_DECISION_MAPPING_FAILED');
  if(next.text===baseline.text)return decided;
  if(!proposed.length)return decided;
  return [{...proposed[0],before:source,after:next.text,status:'pending',
    evidenceIds:[...new Set(proposed.flatMap(change=>change.evidenceIds||(change.evidenceId?[change.evidenceId]:[])))],
    previousDecision:{after:baseline.text,status:'accepted',
      reason:'保留本轮重写之前已经确认的内容；不是采纳本轮新稿。',
      evidenceId:null,
      documentChanges:structuredClone(previous),
      evidenceIds:[...new Set(decided.flatMap(change=>change.evidenceIds||(change.evidenceId?[change.evidenceId]:[])))],
    },
  }];
}
