import {resumeSources,renderGroundedResume,needsResumeGrounding} from './resume-grounding';
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
