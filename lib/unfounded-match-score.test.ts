import {readFileSync} from 'node:fs';
import {withoutUnfoundedMatchScores} from './unfounded-match-score';
test('new generated output cannot carry fabricated match scores; old input and other scores are untouched',()=>{
 const source={targetCompanies:[{name:'示例公司',matchScore:80,notes:'待核对职责'}],match_score:99,interview:{score:72}};
 expect(withoutUnfoundedMatchScores(source)).toEqual({targetCompanies:[{name:'示例公司',notes:'待核对职责'}],interview:{score:72}});
 expect(source.targetCompanies[0].matchScore).toBe(80);
});
test('legacy surfaces and generators no longer publish matching percentages',()=>{
 for(const file of ['components/Whiteboard.tsx','components/WhiteboardCanvas.tsx','components/ResumeTailorPanel.tsx']){
  expect(readFileSync(file,'utf8')).not.toMatch(/\{(?:company|result)\.matchScore\}/);
 }
 const api=readFileSync('app/api/analyze/route.ts','utf8');
 expect(api).toContain('withoutUnfoundedMatchScores(JSON.parse');
 expect(api).not.toContain('"matchScore": 85');
 expect(readFileSync('app/api/resume/tailor/route.ts','utf8')).not.toMatch(/matchScore:|"match_score"/);
 expect(readFileSync('lib/orchestrator/models/application_strategy.ts','utf8')).not.toMatch(/matchScore:/);
});
