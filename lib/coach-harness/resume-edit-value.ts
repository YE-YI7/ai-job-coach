/** Content selection is separate from factual grounding. Never alter source
 * facts here: personal disclaimers remain in the evidence/context as limits. */
const personalDisclaimer = /(?:^|[，,；;。.!！])\s*(?:(?:我|本人)(?:也|并)?|也|并)?(?:没有|并未|未曾|未|没)(?:亲自|直接)?(?:负责|参与|主导|承担|统计|记录|测量|验证|量化)/;
const clean = (text:string) => text.replace(/^\s*[-*•]\s*/gm,'').trim();

export function isPersonalDisclaimer(text:string){return personalDisclaimer.test(clean(text));}

// Only omit standalone disclaimer bullets/sentences. Mixed factual sentences
// are rejected for revision, never cut mid-clause or turned into positive claims.
export function omitStandaloneDisclaimers(text:string){
  return text.split(/\n+/).filter(line=>{
    const value=clean(line);
    return !(isPersonalDisclaimer(value)&&/^(?:(?:我|本人)(?:也|并)?|也|并)?(?:没有|并未|未曾|未|没)/.test(value)
      &&!/[；;。.!！]\s*\S/.test(value)&&!/[，,](?!\s*(?:也|并|没有|未|没))/.test(value));
  }).join('\n').trim();
}

const normalize=(text:string)=>text.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
const removeLabels=(text:string)=>text.replace(/(?:办公软件|办公工具|专业技能|个人技能|技能清单|掌握技能|技能|工具|软件|技术栈|常用工具|使用工具|工作内容|主要职责|项目职责|职责|个人简介|项目经历)\s*[:：]/g,'');

export function resumeEditValueIssues(before:string,after:string):string[]{
  const issues:string[]=[];
  if(isPersonalDisclaimer(after))issues.push('个人未负责/未参与/未统计的说明只作事实边界，不写进简历正文；只写实际做过的动作与交付，仍不得暗示承担被否定的工作');
  if((removeLabels(before)!==before||removeLabels(after)!==after)&&normalize(removeLabels(before))===normalize(removeLabels(after)))issues.push('仅改标签、标点或前缀，没有改善内容，不作为修改交付');
  // Reordering a short tool/skill list or adding a proficiency adjective is not
  // a useful edit (nor evidence of proficiency). Actual experience is exempt.
  const list=(text:string)=>removeLabels(text).replace(/熟练(?:使用|掌握)?|掌握|熟悉|擅长|精通/g,'').split(/[、,，;；\n/|]/).map(normalize).filter(Boolean).sort().join('|');
  if(before.length<100&&!/负责|整理|制作|开发|编写|设计|维护|处理|交付|参与|协助|分析|排查|记录/.test(before)&&list(before)===list(after))issues.push('技能列表的换序或修饰词变化不算有价值改稿');
  return [...new Set(issues)];
}

export type ResumeValueCheck={index:number;useful:boolean;kind:string;reason:string};
const valueKinds=new Set(['concision','structure','specificity','relevance','clarity']);
/** Explicit per-proposal review: absent, duplicate or vague verdicts fail closed. */
export function readResumeValueChecks(raw:unknown,count:number):ResumeValueCheck[]{
  if(!Array.isArray(raw))return [];
  return raw.filter((item):item is ResumeValueCheck=>Boolean(item&&typeof item==='object'&&Number.isInteger(item.index)&&item.index>=0&&item.index<count
    &&typeof item.useful==='boolean'&&valueKinds.has(item.kind)&&typeof item.reason==='string'&&item.reason.trim().length>=8));
}
export function usefulResumeIndexes(checks:ResumeValueCheck[]){
  return new Set(checks.filter(check=>check.useful&&checks.filter(other=>other.index===check.index).length===1).map(check=>check.index));
}
