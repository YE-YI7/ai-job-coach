/** F6 editorial map and optional teaching cards, adapted to the product's
 * anchored suggestion contract. The author reads; only the existing host
 * can validate, present or save the suggested text. */
export const F6_RESUME_WRITER = 'f6-editorial-v1';

const resources = {
  'spec.md': {
    description: '首屏扫读、贡献选材、事实边界及结构重排的详细方法。',
    text: [
      '只做会改变招聘方判断的改动。先从岗位和已有材料辨认最有区分度的能力；没 JD 不猜公司标准。',
      '扫读首屏、标题和领头句，确保能读出方向、准确身份和最强真实信号；不要为了钩子新写一个故事。',
      '细读时用具体判断、本人干预和验证支撑主张。只取读者需要的细节，不把工具、步骤或产出全列出来。',
      '保留归属、阶段、因果、数据方向和单位。不能把一个项目的做法、指标或推测拿来解释另一个项目。',
      '把无法证实的动机、候选解释和补问留在对话，正文只写已有证据；不删会改变主张的限定。',
      '能安全改的先交付。缺关键事实时只问一个可回答的问题；不要为了凑条数阻断或制造内容。',
    ].join('\n'),
  },
  S006: {
    description: '本人做了失败接续、又有对照口径时，取代工程模块清单；缺本人责任或验证就不套用。',
    text: [
      '教学案例（非候选人事实）。材料：难题失败后整轮重跑有重复开销；本人设计模型接力，失败时从检查点续跑。',
      '弱稿：搭建多模型协同流水线，接入截断、压缩、信息传递、检查点与增量恢复，实现降本增效。',
      '参考：为避免难题失败后整轮重跑，用补丁评测识别失败，再把失败证据交给下一模型从检查点续跑；',
      '以全量重跑作对照，比较难题通过率和单任务开销。',
      '保留能解释换手和恢复的细节；没证据就不写具体增幅，不搬用案例的项目、验证或结果。',
    ].join('\n'),
  },
  S007: {
    description: '有前后方案和单项结果时，写清改动与口径；没有数据时只学对比结构，不补结果。',
    text: [
      '教学案例（非候选人事实）。材料：从每次全量注入上下文改为按需注入，记录了 token 用量变化，没测质量和时延。',
      '弱稿：通过上下文工程优化，在保证质量的前提下降本增效。',
      '参考：将每次全量注入改为按需加载；记录到 token 用量下降。原始记录若确认了幅度，才可带入准确数字。',
      '写清选择了什么、实测了什么。不能从 token 用量变化推出质量、时延、业务或整站成本改善。',
    ].join('\n'),
  },
} as const;
type Id = keyof typeof resources;
const hasResource = (id: unknown): id is Id => typeof id === 'string' && Object.hasOwn(resources, id);
type Message = { role:'system'|'user'|'assistant'; content:string };
type Input = {
  resume:string; jd:string; facts:Array<{id:string;text:string}>; request:string; answers:unknown;
  decisions:unknown; scope:'whole'|'single'; format:unknown;
};
type Call = (messages:Message[], phase:'read_or_write'|'write', readIds:Id[])=>Promise<string>;

const map = [
  '你是 F6 简历作者。目标是增加面试机会：首屏要看清什么人、能做什么、凭什么信。只有会改变招聘方判断的改动才值得做。',
  '先通读整份授权材料。分清首屏扫读、细读、风险、面试追问四层。优先重写能说明本人判断、干预、交付及验证的经历，压缩重复动作、通用说法和清单。',
  '有 JD 才做岗位画像，区分硬门槛、加分项、未知。没有目标 JD 时按材料明确的方向优化，不猜公司偏好。',
  '案例是写法，不是事实。每个陈述只用同一经历的原文或明确属于该经历的本人补充。',
  '不得为写动机、反差或取舍而串项目、补因果、角色或结果。指标的方向、单位、比较基准和阶段与原文保持一致。',
  '把最能区分这个人的证据放在对应经历的领头位置。围绕一个贡献重新写，不保留原句的流水账。身份、联系方式和必要责任/阶段限定不动。',
  '段落式原稿用短句重写，不必逐句对应；已有列表保持列表与领头。用户明确范围优先，已采纳或拒绝的旧决定不悄悄改。',
  '若缺证据，一次只问一个确实会改变主张的细节。先改其他有证据的部分；不得给候选正文添加编造数字或占位符。',
].join('\n');
const writeContract = [
  '交稿工具 write_output：一个 JSON 对象，返回 {write_output:[{id,section,after,reason,sourceIds}],selectionReceipt?:string,recovery?:{sourceExcerpt,field,question}}。',
  '用下方 resume 的段落 id 交一段从头写成的可投递 after，不返回 before。不要提交未改段落、纠错清单或原句的缩写版。',
  '每条 sourceIds 为实际支持该 after 的事实编号，不能引用案例或别的项目。不得更换身份、联系方式、单列日期、章节标题和经历归属。',
  '按优先级给 0–6 个可独立确认的高价值修改，同一 id 只交一次。确无内容可改时 status:unchanged；确实缺关键事实且无可改时 status:needs_detail。',
  '选材回执只说明优先的贡献、验证依据与省掉的弱细节，不进入简历正文。recovery 的 sourceExcerpt 必须是原稿中 12–260 字连续原句。',
].join('\n');
const menu = JSON.stringify(Object.entries(resources).map(([id,value])=>({id,description:value.description})));

function parse(reply:string):Record<string,unknown>{
  const cleaned=reply.trim().replace(/^```(?:json)?\s*|\s*```$/g,'');
  const value=JSON.parse(cleaned);
  if(!value || typeof value!=='object' || Array.isArray(value))throw Error('F6_WRITER_PROTOCOL_INVALID');
  return value;
}

type Anchor={text:string; sourceIds:string[]};
function toProductChanges(value:Record<string,unknown>, anchors:Map<string,Anchor>, originalReply:string) {
  // The older anchored shape remains readable during migration; newer F6
  // authors do not need to reproduce the original in a separate output field.
  if(!Object.hasOwn(value,'write_output'))return originalReply;
  if(Object.hasOwn(value,'changes') || !Array.isArray(value.write_output) || value.write_output.length>6){
    throw Error('F6_WRITE_OUTSIDE_SCOPE');
  }
  const used=new Set<string>();
  const changes=value.write_output.map((entry:unknown)=>{
    if(!entry||typeof entry!=='object'||Array.isArray(entry))throw Error('F6_WRITE_OUTSIDE_SCOPE');
    const {id,section,after,reason,sourceIds}=entry as Record<string,unknown>;
    if(typeof id!=='string'||!anchors.has(id)||used.has(id)||typeof after!=='string'||!after.trim()||after.length>2000){
      throw Error('F6_WRITE_OUTSIDE_SCOPE');
    }
    used.add(id);
    const anchor=anchors.get(id)!;
    const modelIds=Array.isArray(sourceIds)?sourceIds.filter((item):item is string=>typeof item==='string'):[];
    return {
      section,before:anchor.text,after,reason,
      sourceIds:[...new Set([...anchor.sourceIds,...modelIds.filter(item=>item!==id)])],
    };
  });
  const rest={...value};
  delete rest.write_output;
  return JSON.stringify({...rest,changes});
}

export async function runF6ResumeWriter(input:Input, call:Call, onRead:(ids:Id[])=>void) {
  const counts=new Map<string,number>();
  const lines=input.resume.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
  for(const line of lines)counts.set(line,(counts.get(line) ?? 0)+1);
  const sameFact=(fact:string,line:string)=>fact.trim()===line;
  const anchors=new Map<string,Anchor>(lines.flatMap((line,index)=>
    counts.get(line)===1 && line.length>=8 && line.length<=2000 && !/^#{1,6}\s/.test(line)
      ? [[`p${index+1}`,{text:line,sourceIds:input.facts.filter(fact=>sameFact(fact.text,line)).map(fact=>fact.id)}] as const] : []));
  const messages:Message[]=[
    {role:'system',content:map},
    {role:'user',content:JSON.stringify({
      resume:lines.map((text,index)=>{
        const id=`p${index+1}`, anchor=anchors.get(id);
        return anchor?{id,...anchor}:{text};
      }),
      jd:input.jd,facts:input.facts.filter(fact=>!lines.some(line=>sameFact(fact.text,line))),
      editingRequest:input.request,answers:input.answers,priorDecisions:input.decisions,format:input.format,
      scope:input.scope==='single'?'只改本次授权经历，不得改其他段落。':'整份简历选材，按经历分别交付。',
    })},
    {role:'system',content:[
      '此步只做编辑准备，不写简历正文。决定是否需要可选资源，只返回 JSON：{"read_file":["资源 ID"]}。',
      '最多选两个；如果无需参考可返回 {"read_file":[]}。不要承诺已经完成改稿。',
      '目录：'+menu,
    ].join('\n')},
  ];
  const first=await call(messages,'read_or_write',[]);
  const parsed=parse(first);
  if(!Object.hasOwn(parsed,'read_file'))return toProductChanges(parsed,anchors,first);
  if(Object.keys(parsed).length!==1 || !Array.isArray(parsed.read_file)
    || parsed.read_file.length>2 || !parsed.read_file.every(hasResource)
    || new Set(parsed.read_file).size!==parsed.read_file.length)throw Error('F6_READ_OUTSIDE_CATALOGUE');
  const ids=parsed.read_file;
  if(ids.length)onRead(ids);
  const final=await call([...messages,
    {role:'assistant',content:first},
    ...(ids.length?[{role:'user' as const,content:JSON.stringify({read_file:ids.map(id=>({id,text:resources[id].text}))})}]:[]),
    {role:'system',content:'现在写一版能交给招聘方的改稿，案例不是候选人经历。\n'+writeContract},
  ],'write',ids);
  const written=parse(final);
  if(Object.hasOwn(written,'read_file'))throw Error('F6_READ_BUDGET_EXHAUSTED');
  return toProductChanges(written,anchors,final);
}

/** Losing the verb around the same number changes a measured delta into a
 * metric level. A direction-bearing value may be dropped altogether when
 * legitimate, but must not survive as an unqualified numeric claim. */
export function f6MetricDirectionIssues(before:string, after:string):string[]{
  const norm=(s:string)=>s.normalize('NFKC').replace(/\s/g,'').replace(/个(?=百分点)/g,'');
  const a=norm(after), b=norm(before);
  const change=/(提升|提高|增加|增长|上升|改善|下降|降低|减少|下滑|回落)(?:了|约|达|近)?(\d+(?:\.\d+)?)(个百分点|百分点|pp|%)/gi;
  const issue='保留指标数值时必须保留增减方向；不能把变化量写成指标当前水平。';
  for(const match of b.matchAll(change)){
    const [,verb,n,unit]=match;
    const scalar=n.replace('.','\\.')+'(?:'+(unit.toLowerCase()==='%'?'%':'百分点|pp')+')';
    const present=new RegExp('(?<![\\d.])'+scalar,'i');
    const direction=/提升|提高|增加|增长|上升|改善/.test(verb)?'提升|提高|增加|增长|上升|改善|\\+':'下降|降低|减少|下滑|回落|-';
    if(present.test(a)&&!new RegExp('(?:'+direction+')(?:了|约|达|近)?'+scalar,'i').test(a))return [issue];
  }
  return [];
}
