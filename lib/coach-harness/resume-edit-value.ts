/** Content selection is separate from factual grounding. Never alter source
 * facts here: personal disclaimers remain in the evidence/context as limits. */
const personalDisclaimer = /(?:^|[，,；;。.!！])\s*(?:(?:我|本人)(?:也|并)?|也|并)?(?:没有|并未|未曾|未|没)(?:亲自|直接)?(?:负责|参与|主导|承担|统计|记录|测量|验证|量化)/;
const clean = (text:string) => text.replace(/^\s*[-*•]\s*/gm,'').trim();

/** Shared by drafting and independent review, including the no-change verdict. */
export const RESUME_EDITORIAL_STANDARD = `简历编辑不只是保真压缩，还要筛掉随笔口吻。不要把“某年某月提出某机制的重要性”“思考某方向”“希望AI更好”当成一个成果卖点；时间不必占据bullet开头，日期对任职/项目范围有意义时才保留在对应位置。优先写清具体问题、本人已做的判断/动作、交付与实际用途，有什么写什么，不要求凑齐四项或数字。
只有设想、提案或产品判断时，先把已有的问题与具体提案写清楚，并明确保留“提出/建议/计划”等阶段；不能改成设计完成、落地、上线、持续运行或带来效果。能安全改的先交付；若值得深挖，再一问“这项提案目前推进到了哪一步？”，不要停稿等证明。不要把未负责事项塞进简历，也不把别人的交付写成自己的。原本清楚的短句不加解释性赘词凑修改；没有补入已有但遗漏的事实、消除真实歧义或改善信息取舍时，越改越长不算specificity或clarity，应保留原文。
教学对照（不是用户事实）：原句“某月提出提醒机制的重要性。协作周期长，信息不断变；希望系统在必要时提醒，而不是等人来问。”可以整理为“针对协作周期长、信息持续变化的问题，提出按需主动提醒的机制，减少对人工提问的依赖（提案）。”其中“减少依赖”只能是方案目的，绝不能变成已实现的结果。若来源没有具体提案，只问本人实际做过的一件事，不把泛泛思考美化成行动。每条短句一个要点，避免空泛标题和冗长说明。保留原稿段首概括与列表层级：概括空泛就改成具体概括，不因这条规则去掉加粗领头结构；原稿没有概括时也不强加。教学示例只示范内容选择，不能覆盖原稿的格式约定。
反例：原文已经说明用了什么技术、完成哪两个页面且处于原型阶段，把“使用…完成”换成“基于…开发”、把“两个页面”换成两个“页”，信息没有更清晰，不算改稿；已经写明测试数量和覆盖项目，再加“用例”“两类场景”也是赘写。不能以动词看起来更专业为由判定有价值。`;

export function isPersonalDisclaimer(text:string){return personalDisclaimer.test(clean(text));}

/** Include an existing list prefix when the model copied only its body.
 * Otherwise replacing “正文” with “• 新正文” leaves “• • 新正文”. */
export function resumeSourceBulletSpan(source:string,before:string){
  if(!before||/^\s*[-*•]\s+/.test(before))return before;
  const start=source.indexOf(before);
  if(start<0||start!==source.lastIndexOf(before))return before;
  const lineStart=source.lastIndexOf('\n',start-1)+1,prefix=source.slice(lineStart,start);
  return /^\s*[-*•]\s+$/.test(prefix)?prefix+before:before;
}

/** Fix an unambiguous model list delimiter, not source prose or numeric ranges. */
export function normalizeResumeBulletBreaks(text:string,before=''){
  const normalized = /^\s*[-*•]\s+/.test(text)?text.replace(/[；;]\s*[-*•]\s+(?=\S)/g,'\n- '):text;
  // A single rewritten list item must not silently become a plain paragraph.
  // Only restore an unambiguous source marker; never invent lists/headings.
  const marker = before.match(/^\s*([-*•])\s+[^\n]+$/)?.[1];
  return marker && normalized && !normalized.includes('\n') && !/^\s*(?:[-*•#]|\d+[.)])\s/.test(normalized)
    ? `${marker} ${normalized}` : normalized;
}

// Only omit standalone disclaimer bullets/sentences. Mixed factual sentences
// are rejected for revision, never cut mid-clause or turned into positive claims.
export function omitStandaloneDisclaimers(text:string){
  return text.split(/\n+/).filter(line=>{
    const value=clean(line);
    return !(isPersonalDisclaimer(value)&&/^(?:(?:我|本人)(?:也|并)?|也|并)?(?:没有|并未|未曾|未|没)/.test(value)
      &&!/[；;。.!！]\s*\S/.test(value)&&!/[，,](?!\s*(?:也|并|没有|未|没))/.test(value));
  }).join('\n').trim();
}

/** A model's deletion label is not résumé content. Only translate it to an
 * empty replacement when the entire source is an eligible disclaimer. */
export function normalizeResumeDeletion(before:string,after:string){
  const label=clean(after).replace(/[（）()。.!！]/g,'').trim();
  return before.trim()&&!omitStandaloneDisclaimers(before).trim()&&/^(?:删除|删去|移除)(?:该|此|这)(?:条|段)$/.test(label)?'':after;
}

/** Propose, never apply, omission of standalone personal disclaimers. Both
 * exact source citation and independent review/user acceptance still follow. */
export function proposeStandaloneDisclaimerDeletions(resume:string,proposals:Array<{before?:unknown}>,sources:Array<{id:string;text:string}>){
  return resume.split('\n').map(line=>line.trim()).filter(line=>line.length>=6&&line.length<=260
    &&!omitStandaloneDisclaimers(line).trim()&&resume.indexOf(line)===resume.lastIndexOf(line)
    &&!proposals.some(item=>String(item.before||'').includes(line)||line.includes(String(item.before||'\u0000'))))
    .flatMap(before=>{
      const source=sources.find(item=>item.text.includes(before)||clean(item.text).includes(clean(before)));
      return source?[{section:'经历表述',before,after:'',reason:'独立的未负责事项仅保留为内部事实边界，建议从投递正文中删除；并不表示承担了这些工作。',sourceIds:[source.id]}]:[];
    }).slice(0,Math.max(0,6-proposals.length));
}

const normalize=(text:string)=>text.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
const removeLabels=(text:string)=>text.replace(/(?:办公软件|办公工具|专业技能|个人技能|技能清单|掌握技能|技能|工具|软件|技术栈|常用工具|使用工具|工作内容|主要职责|项目职责|职责|个人简介|项目经历)\s*[:：]/g,'');

export function resumeEditValueIssues(before:string,after:string):string[]{
  const issues:string[]=[];
  if(/^(?:删除|删去|移除)(?:该|此|这)(?:条|段)$/.test(clean(after).replace(/[（）()。.!！]/g,'').trim()))issues.push('编辑指令不能作为简历正文；删除必须返回空 after，且不能删除真实贡献');
  if(/(?:提出|认识到|意识到|强调).{0,28}(?:的)?重要性/.test(after))issues.push('“提出/认识到重要性”仍是随笔口吻；用来源已有的具体问题和提案重写，保留提案阶段，不冒称实施成果');
  if(isPersonalDisclaimer(after))issues.push('个人未负责/未参与/未统计的说明只作事实边界，不写进简历正文；只写实际做过的动作与交付，仍不得暗示承担被否定的工作');
  if(/由(?:其他|别的|另外的)(?:同学|同事|成员|团队)(?:负责|开发|完成|承担)/.test(after))issues.push('其他人的分工只作内部归属边界，不作为本人的经历bullet；保留本人实际动作，不得把他人的开发或成果写成本人负责');
  if((removeLabels(before)!==before||removeLabels(after)!==after)&&normalize(removeLabels(before))===normalize(removeLabels(after)))issues.push('仅改标签、标点或前缀，没有改善内容，不作为修改交付');
  // Reordering a short tool/skill list or adding a proficiency adjective is not
  // a useful edit (nor evidence of proficiency). Actual experience is exempt.
  const list=(text:string)=>removeLabels(text.replace(/(^|[;；\n])\s*[^:：;；\n]{1,16}[:：]/g,'$1')).replace(/熟练(?:使用|掌握)?|掌握|熟悉|擅长|精通/g,'').split(/[、,，;；\n/|]/).map(normalize).filter(Boolean).sort().join('|');
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
