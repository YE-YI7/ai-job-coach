import {resumeSources,renderGroundedResume,needsResumeGrounding} from './resume-grounding';
test('改写交付有可复制正文、行级依据、修改说明和确认，不替换原简历',()=>{
 const before='参与企业权限灰度上线。团队留存提升7个百分点。';
 const output=renderGroundedResume(JSON.stringify({bullets:[{sourceId:'resume-text',before,after:before,reason:'保留参与职责与团队结果',risks:['确认留存统计口径']}]}),[{id:'resume-text',text:before}]);
 expect(output).toContain('简历改写草稿');expect(output).toContain('**改写后**');expect(output).toContain('> 参与企业权限灰度上线');expect(output).toContain('**待确认**');expect(output).toContain('原简历未被替换');
});
test('改写不能把参与升级成主导，不能拼出没有做过的AI项目',()=>{
 const before='参与企业权限灰度上线。团队留存提升7个百分点。';
 for(const after of ['主导企业权限灰度上线。留存提升7个百分点。','上线大模型，提升留存7个百分点。'])expect(()=>renderGroundedResume(JSON.stringify({bullets:[{sourceId:'resume-text',before,after}]}),[{id:'resume-text',text:before}])).toThrow();
});
test('未知来源和截去否定的依据阻断改写',()=>{
 expect(()=>renderGroundedResume(JSON.stringify({bullets:[{sourceId:'resume-text',before:'上线模型。',after:'上线模型。'}]}),[{id:'resume-text',text:'没有上线模型。'}])).toThrow();
});
test('报告里的输出bullet请求进入事实编辑，而不是泛聊',()=>{expect(needsResumeGrounding('基于已确认的简历事实，输出两条可直接替换进简历的经历 bullet')).toBe(true);});
test('简历来源只用上传原文和已确认事实，不混入请求、JD、导师示例',()=>{
 const sources=resumeSources({attachments:[{id:'resume-text',text:'参与企业权限灰度上线。团队留存提升7个百分点。'},{id:'jd',text:'需要AI经历'}],claims:[{id:'fact',status:'confirmed',displayText:'没有独立AI项目经历。'},{id:'pending',status:'pending',displayText:'计划训练模型'}]});
 expect(sources.map(s=>s.id)).toEqual(['resume-text','fact']);
 expect(renderGroundedResume(JSON.stringify({resumeQuotes:[{sourceId:'resume-text',quote:'参与企业权限灰度上线。'},{sourceId:'current',quote:'基于已确认简历写两条bullet'}]}),sources)).toContain('参与企业权限灰度上线');
 expect(renderGroundedResume(JSON.stringify({resumeQuotes:[{sourceId:'current',quote:'基于已确认简历写两条bullet'}]}),sources)).not.toContain('基于已确认简历');
});
test('不允许从没有上线截取上线，不允许编造数字',()=>{
 const sources=[{id:'resume-text',text:'没有上线模型。参与客户访谈。'}];
 const output=renderGroundedResume(JSON.stringify({resumeQuotes:[{sourceId:'resume-text',quote:'上线模型。'},{sourceId:'resume-text',quote:'主导30次访谈。'}]}),sources);
 expect(output).not.toContain('- 上线模型');expect(output).not.toContain('主导30次');
});
