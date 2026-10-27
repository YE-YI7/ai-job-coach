import {verifyResumeGrounding as verifyCitations} from './citation-verifier';
test('short heading with body is not a truncated sentence, terminal heading still is',()=>{
  const sources=[{id:'s',text:'Harness重构，设计编排知识库调取。'}];
  const valid=verifyCitations({candidateText:'Harness重构：\n设计编排知识库调取。',sources});
  expect(valid.ok).toBe(true);
  expect(valid.verdicts.some(s=>s.status==='rejected'&&s.reason==='broken_tail')).toBe(false);
  const invalid=verifyCitations({candidateText:'Harness重构：',sources});
  expect(invalid.verdicts.some(s=>s.status==='rejected'&&s.reason==='broken_tail')).toBe(true);
  expect(verifyCitations({candidateText:'设计编排知识库调取，',sources}).verdicts.some(s=>s.status==='rejected'&&s.reason==='broken_tail')).toBe(true);
  expect(verifyCitations({candidateText:'已上线：\n内部工具原型。',sources:[{id:'s',text:'内部工具原型尚未上线。'}]}).ok).toBe(false);
});
