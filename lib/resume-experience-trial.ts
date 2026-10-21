import { splitResumeBlocks } from './opportunities/resume-blocks';

export type ResumeTrialScope = { kind: 'experience_trial'; blockId: string; excerpt: string };
/** Fail closed on unrecognised/ambiguous layout; never treat the whole CV as a trial. */
export function resumeTrialTargets(resume: string): Array<ResumeTrialScope & { title: string }> {
  return splitResumeBlocks(resume).flatMap(block => {
    if (!['experience', 'project'].includes(block.kind) || block.synthetic) return [];
    if (block.kind === 'experience' && !/工作|实习|职业/.test(block.heading || '')) return [];
    const excerpt = block.lines.join('\n');
    const dates = excerpt.match(/\d{4}[.年/-]\d{1,2}月?\s*[-–—~～至]\s*(?:\d{4}[.年/-]\d{1,2}|至今|现在|present)/gi) || [];
    if (excerpt.length < 24 || excerpt.length > 1600 || dates.length > 1 || !resume.includes(excerpt)
      || resume.indexOf(excerpt) !== resume.lastIndexOf(excerpt)) return [];
    return [{kind: 'experience_trial' as const, blockId: block.id, excerpt, title: block.title}];
  });
}
export function resolveResumeTrialScope(resume: string, blockId: string): ResumeTrialScope | null {
  const target = resumeTrialTargets(resume).find(block => block.blockId === blockId);
  return target ? {kind: target.kind, blockId: target.blockId, excerpt: target.excerpt} : null;
}
export function inResumeTrialScope(scope: ResumeTrialScope, before: string, resume: string) {
  if (!before.trim() || !scope.excerpt.includes(before)) return false;
  const start = resume.indexOf(before), end = resume.lastIndexOf(before), scopeStart = resume.indexOf(scope.excerpt);
  return start === end && start >= scopeStart && start + before.length <= scopeStart + scope.excerpt.length;
}
