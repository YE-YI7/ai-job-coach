import { resumeEditorSchema } from './resume-editor-schema';

test('location IDs cannot be substituted for factual source IDs in a plan or edit', () => {
  const schema = resumeEditorSchema('项目实践：整理反馈清单，交给产品同事每周复盘。', new Set(['fact-1']));
  const p = schema.schema.properties;
  expect(p.editorialPlan.properties.claims.items.properties.sourceIds.items.enum).toEqual(['fact-1']);
  expect(p.changes.items.properties.sourceIds.items.enum).toEqual(['fact-1']);
  expect(p.changes.items.properties.anchorId.enum).toEqual(['a1']);
  expect(p.changes.items.additionalProperties).toBe(false);
  expect(p.editorialPlan.properties.priorities.items.properties.anchorId.enum).toEqual(['a1']);
});
test('no-op and missing-detail results stay representable without inventing a plan', () => {
  const schema = resumeEditorSchema('教育经历与已有技能，不强行重写。', new Set(['fact-1']));
  expect(schema.schema.properties.status.enum).toContain('unchanged');
  expect(schema.schema.properties.editorialPlan.type).toEqual(['object', 'null']);
  expect(schema.schema.properties.recovery.type).toEqual(['object', 'null']);
});
