import {resumeReviewSchema} from './resume-review-schema';
test('strict review shape retains value, factual and whole-document checks plus optional one-question recovery',()=>{
 const schema=resumeReviewSchema([{id:'one'},{id:'two'}]).schema;
 expect(schema.required).toEqual(['status','summary','findings','valueChecks','document','recovery']);
 expect(schema.additionalProperties).toBe(false);
 const p=schema.properties as any;
 expect(p.findings.items.properties.changeId.enum).toEqual(['one','two']);
 expect(p.valueChecks.items.properties.index.enum).toEqual([0,1]);
 expect(p.valueChecks.items.properties.impact.enum).toEqual(['correction','content']);
 expect(p.document.properties.findings.items.properties.category.enum).toContain('grounding');
 expect(p.recovery.type).toEqual(['object','null']);
});
test('retained-document review does not demand another edit or unrelated per-change output',()=>{
 expect(resumeReviewSchema([{id:'one'}],true).schema.required).toEqual(['document']);
});
