import {createHash} from 'node:crypto';
import {resolveResumeEdits} from './application-quality';
import {resumeConversationDraftContext} from './resume-conversation-context';
import {anchoredResumeExcerpt, type ResumeAgentTask} from './resume-task-types';
import type {ResumeChange} from '@/lib/opportunities/types';

type Source = {resume:string; changes:unknown[]; revision?:string};

/** Coordinates are editing context, never evidence of the candidate's work.
 * Only the server derives source ranges through the editor's existing edits. */
export interface ResumeConversationLocation {
  version: 1;
  document: 'resume' | 'currentDraft';
  quote: string;
  start: number;
  end: number;
  sourceStart: number;
  sourceEnd: number;
  sourceRevision: string | null;
  sourceSha256: string;
  draftSha256: string | null;
  generationId: string | null;
  changeIds: string[];
}

type LocationResult =
  | {status:'found'; sourceExcerpt:string; location?:ResumeConversationLocation}
  | {status:'unplaced'}
  | {status:'invalid'; reason:string};

const hash = (text:string) => createHash('sha256').update(text).digest('hex');

function uniqueQuote(text:string, quote:string) {
  const actual = anchoredResumeExcerpt(text,quote);
  if (!actual) return null;
  const start = text.indexOf(actual);
  if (start < 0 || text.indexOf(actual,start + 1) >= 0) return null;
  return {quote:actual,start,end:start + actual.length};
}

/** No semantic guess or model call: map current text back to immutable source
 * using precisely the ranges already resolved by the editor projection. */
export function resumeConversationLocator(source:Source, task:ResumeAgentTask) {
  const draft = resumeConversationDraftContext(source,task);
  const segments:Array<{
    start:number; end:number; sourceStart:number; sourceEnd:number; changeId?:string;
  }> = [];
  if (draft.projectionStatus === 'current') {
    const {edits} = resolveResumeEdits(source.resume,source.changes as ResumeChange[]);
    let cursor = 0, offset = 0;
    for (const edit of edits) {
      if (edit.start > cursor) {
        const length = edit.start - cursor;
        segments.push({start:offset,end:offset + length,sourceStart:cursor,sourceEnd:edit.start});
        offset += length;
      }
      if (edit.after.length) segments.push({
        start:offset,end:offset + edit.after.length,
        sourceStart:edit.start,sourceEnd:edit.end,changeId:edit.change.id,
      });
      offset += edit.after.length;
      cursor = edit.end;
    }
    if (cursor < source.resume.length) segments.push({
      start:offset,end:offset + source.resume.length - cursor,
      sourceStart:cursor,sourceEnd:source.resume.length,
    });
  }

  const resolve = (rawTarget:unknown, legacyExcerpt:unknown):LocationResult => {
    const explicit = rawTarget !== undefined;
    const target = rawTarget as {document?:unknown; excerpt?:unknown} | null;
    if (explicit && (!target || typeof target !== 'object'
      || !['resume','currentDraft'].includes(String(target.document))
      || typeof target.excerpt !== 'string')) {
      return {status:'invalid',reason:'修改位置的文档类型或引文无效'};
    }
    const quote = String(explicit ? target!.excerpt : legacyExcerpt || '').trim();
    if (!quote) return explicit
      ? {status:'invalid',reason:'已指定文档但没有可核对的修改位置'}
      : {status:'unplaced'};

    // Old recorded decisions remain readable. An original quotation stays an
    // original reference; otherwise only a uniquely mapped CURRENT quote works.
    const original = uniqueQuote(source.resume,quote);
    if (target?.document !== 'currentDraft' && original) {
      return {status:'found',sourceExcerpt:original.quote,...(explicit ? {location:{
        version:1,document:'resume',...original,sourceStart:original.start,sourceEnd:original.end,
        sourceRevision:source.revision || null,sourceSha256:hash(source.resume),
        draftSha256:draft.sha256,generationId:draft.generationId,changeIds:[],
      } as ResumeConversationLocation} : {})};
    }
    if (target?.document === 'resume') return {status:'invalid',reason:'原稿修改位置不能唯一核对'};
    if (draft.projectionStatus !== 'current' || draft.text === null) {
      return {status:'invalid',reason:'当前工作稿不能完整投影，不能使用该位置'};
    }
    const current = uniqueQuote(draft.text,quote);
    if (!current) return {status:'invalid',reason:'当前工作稿的修改位置不能唯一核对'};
    const touched = segments.filter(segment => segment.start < current.end && current.start < segment.end);
    if (!touched.length) return {status:'invalid',reason:'当前修改位置没有原稿坐标映射'};
    const first = touched[0], last = touched.at(-1)!;
    const sourceStart = first.changeId ? first.sourceStart
      : first.sourceStart + current.start - first.start;
    const sourceEnd = last.changeId ? last.sourceEnd
      : last.sourceStart + current.end - last.start;
    const excerpt = source.resume.slice(sourceStart,sourceEnd);
    if (!excerpt) return {status:'invalid',reason:'当前修改位置没有可用原稿范围'};
    return {status:'found',sourceExcerpt:excerpt,location:{
      version:1,document:'currentDraft',...current,sourceStart,sourceEnd,
      sourceRevision:source.revision || null,sourceSha256:hash(source.resume),
      draftSha256:draft.sha256,generationId:draft.generationId,
      changeIds:[...new Set(touched.flatMap(segment => segment.changeId ? [segment.changeId] : []))],
    }};
  };
  return {resolve};
}

/** Revalidate after the model returns AND before acquiring the editor lease.
 * Rejected/manual edits, changed source or another generation invalidate it. */
export function currentResumeConversationLocation(
  location:ResumeConversationLocation, source:Source, task:ResumeAgentTask,
) {
  const resolved = resumeConversationLocator(source,task).resolve({
    document:location.document,excerpt:location.quote,
  },undefined);
  if (resolved.status !== 'found' || !resolved.location) return false;
  const identity = (value:ResumeConversationLocation) => [
    value.version,value.document,value.quote,value.start,value.end,value.sourceStart,value.sourceEnd,
    value.sourceRevision,value.sourceSha256,value.draftSha256,value.generationId,value.changeIds,
  ];
  // jsonb may reorder object keys on persistence; compare identities, not key order.
  return JSON.stringify(identity(resolved.location)) === JSON.stringify(identity(location));
}
