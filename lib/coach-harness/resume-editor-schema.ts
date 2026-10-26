import { resumeEditorialAnchors } from './resume-editorial-plan';

/** Positions and career evidence are disjoint namespaces. Provider-enforced
 * IDs prevent wasting the bounded repair on a syntactically valid wrong plan;
 * factual, value, document and final-save guards still run unchanged. */
export function resumeEditorSchema(resume: string, sourceIds: Set<string>) {
  const object = <P extends Record<string, unknown>>(properties: P) => ({
    type: 'object', properties, required: Object.keys(properties), additionalProperties: false,
  });
  const text = { type: 'string' };
  const anchorId = { type: 'string', enum: resumeEditorialAnchors(resume).map(anchor => anchor.anchorId) };
  const evidenceIds = { type: 'array', items: { type: 'string', enum: [...sourceIds] } };
  const plan = object({ mainline: text,
    claims: { type: 'array', items: object({ point: text, sourceIds: evidenceIds }) },
    priorities: { type: 'array', items: object({
      id: { type: 'string', enum: ['p1', 'p2', 'p3'] }, anchorId, goal: text,
    }) },
  });
  const recovery = object({ sourceExcerpt: text,
    field: { type: 'string', enum: ['context', 'action', 'deliverable', 'outcome', 'scope'] }, question: text,
  });
  return { name: 'resume_grounded_editor_v1', schema: object({
    status: { type: 'string', enum: ['draft', 'unchanged', 'needs_detail'] },
    editorialPlan: { ...plan, type: ['object', 'null'] },
    changes: { type: 'array', items: object({ section: text, anchorId, after: text, reason: text, sourceIds: evidenceIds }) },
    recovery: { ...recovery, type: ['object', 'null'] },
  }) };
}
