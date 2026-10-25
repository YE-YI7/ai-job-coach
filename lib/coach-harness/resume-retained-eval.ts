import type { EvalSpan } from './eval-observer';
import type { ResumeChange } from '@/lib/opportunities/types';
import { applyResumeChanges } from '@/lib/coach-harness';
import { checkResumeFormat, resumeStyleContract } from './resume-document-review';
import { readResumeEditorialPlan } from './resume-editorial-plan';

/** Read-only support for ONE review of captured candidates, never new writing. */
export function retainedResumeEvalInput(parent: Record<string, unknown>, retainedIds: string[]) {
  const input = parent.input as { resume?: unknown; jobDescription?: unknown } | undefined;
  if (parent.provenance !== 'real_model_deidentified_comparison' || parent.status !== 'blocked'
    || typeof input?.resume !== 'string' || input.resume.length > 30_000) return null;
  const spans = Array.isArray(parent.spans) ? parent.spans as EvalSpan[] : [];
  const proposals = spans.filter(span => span.code === 'proposals_checked').at(-1)?.output as { changes?: ResumeChange[] } | undefined;
  const rawPlan = spans.filter(span => span.code === 'editorial_plan_grounded').at(-1)?.output;
  if (!Array.isArray(proposals?.changes) || !retainedIds.length || new Set(retainedIds).size !== retainedIds.length) return null;
  const changes = proposals.changes.filter(change => retainedIds.includes(change.id));
  if (changes.length !== retainedIds.length) return null;
  const context = spans.find(span => span.code === 'own_materials_compiled')?.output as {
    allowedClaimIds?: string[]; unverifiedClaimIds?: string[];
  } | undefined;
  const allowed = new Set([...(context?.allowedClaimIds || []), ...(context?.unverifiedClaimIds || [])]);
  if (changes.some(change => (change.evidenceIds || [change.evidenceId]).some(id => !id || !allowed.has(id)))) return null;
  const plan = readResumeEditorialPlan(rawPlan, input.resume, allowed);
  if (!plan) return null;
  let facts: string | null = null;
  for (const span of spans.filter(span => span.kind === 'agent')) {
    const messages = (span.input as { messages?: Array<{ content: string }> })?.messages || [];
    for (const message of messages) {
      try { const data = JSON.parse(message.content); if (typeof data.facts === 'string') facts = data.facts; } catch { /* not a JSON data message */ }
    }
  }
  if (!facts || facts.length > 120_000) return null;
  const applied = applyResumeChanges(input.resume, changes);
  if (applied.findings.length || checkResumeFormat(input.resume, applied.text, changes, 'preserve').length) return null;
  return { original: input.resume, jd: String(input.jobDescription || ''), facts, plan, changes, preview: applied.text,
    styleContract: resumeStyleContract(input.resume, 'preserve') };
}
