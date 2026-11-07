import { projectF6Document } from './resume-f6-projection';
import { applyResumeChanges } from './application-quality';
import fc from 'fast-check';

function check(source: string, candidate: string) {
  const projected = projectF6Document(source,candidate);
  const changes = projected.map((change,index)=>({...change,id:String(index),section:'整稿',reason:'整体选材',
    evidenceId:null,status:'pending' as const}));
  expect(applyResumeChanges(source,changes)).toEqual({text:candidate,findings:[]});
  return changes;
}
test.each([
  ['姓名\n项目甲\n旧内容\n教育\n学校','姓名\n教育\n学校\n项目甲\n新内容'],
  ['姓名\n旧内容\n\n不变内容','姓名\n完全重构的内容\n\n不变内容'],
  ['原稿','原稿\n新增有据补充'],['原稿\n','新稿\n'],
  ['重复\n重复\n尾部','重复\n重写\n尾部'],['原稿',''],
  ['甲\r\n乙\r\n丙','甲\r\n新乙\r\n丙'],
])('source bytes map reversibly: %s',(source,candidate)=>{ check(source,candidate); });

test('large structural replacement is never silently cut at 2000 characters',()=>{
  const source='姓名\n'+('原事实甲\n原事实乙\n'.repeat(250))+'尾部';
  const candidate='姓名\n'+('重组已有事实乙\n重组已有事实甲\n'.repeat(200))+'尾部';
  expect(check(source,candidate)[0].after.length).toBeGreaterThan(2000);
});

test('projection/apply round trip across insertions, deletions, repeats and unicode',()=>{
  const text=fc.array(fc.constantFrom('甲','乙','丙','\n',' ','😀'),{minLength:1,maxLength:45}).map(a=>a.join(''));
  fc.assert(fc.property(text,text,(source,candidate)=>{check(source,candidate);}),{numRuns:180});
});
