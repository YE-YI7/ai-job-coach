import {guardInsufficientReply,reaskReason,DEFAULT_CLARIFY_QUESTION,BLOCKING_BODY_LIMIT,type ProvidedMaterial} from "./insufficiency-guard";

const LONG_BODY="首先我们来梳理方法论。"+ "第一步要看岗位JD里的硬性门槛，第二步再对照你的经历逐条找证据，缺一不可。".repeat(12);
// 与 golden set GS-004 的构造材料同形：技能栏里确实写了 SQL。
const JD:ProvidedMaterial={kind:"jd",text:"岗位：AI 产品经理（Agent 方向）。要求：1) 3 年以上经验；2) 熟练使用 SQL 做数据查询。"};
const RESUME:ProvidedMaterial={kind:"resume",text:"教育：本科。实习：某 SaaS 公司产品经理实习生。技能：SQL 查询、Axure、Python 基础。"};

describe("insufficiency guard",()=>{
 test("blocking: 模型硬编超长伪完整回答 → 收敛为简短澄清问句",()=>{
  const answer=`<clarify level="blocking">这份简历要投的是哪个岗位的JD？</clarify>\n${LONG_BODY}`;
  const r=guardInsufficientReply({answer,suggestions:["请带我改简历","我想看例子"],userText:"帮我看看简历行不行"});
  expect(r.blocked).toBe(true);expect(r.needsMoreInput).toBe(true);
  expect(r.collapsed).toBe(true);
  expect(r.level).toBe("blocking");
  expect(r.answer).toBe("这份简历要投的是哪个岗位的JD？");
  expect(r.answer.length).toBeLessThan(80);
  expect(r.answer).not.toContain("clarify");
  expect(r.suggestions).toEqual(["请带我改简历"]);
 });
 test("blocking: 模型守约（一句必要说明+标签）→ 保留说明与问句，不判为收敛",()=>{
  const r=guardInsufficientReply({answer:"先停一下，缺了前提推不动。\n<clarify level=\"blocking\">你投的是哪个岗位？</clarify>",suggestions:[],userText:"帮我改简历"});
  expect(r.blocked).toBe(true);expect(r.collapsed).toBe(false);
  expect(r.answer).toContain("先停一下");expect(r.answer).toContain("你投的是哪个岗位？");
  expect(r.answer).not.toContain("clarify");
 });
 test("blocking: 标签为空时兜底澄清句，绝不返回空正文",()=>{
  const r=guardInsufficientReply({answer:`<clarify level="blocking"></clarify>\n${LONG_BODY}`,suggestions:[],userText:"问题"});
  expect(r.answer).toBe(DEFAULT_CLARIFY_QUESTION);
  expect(r.blocked).toBe(true);expect(r.collapsed).toBe(true);
 });
 test("blocking: 漏写闭合标签也能识别并剥离",()=>{
  const r=guardInsufficientReply({answer:`${LONG_BODY}\n<clarify level='blocking'>当前会话绑定的是哪个岗位？`,suggestions:[],userText:"问题"});
  expect(r.level).toBe("blocking");expect(r.blocked).toBe(true);
  expect(r.answer).toBe("当前会话绑定的是哪个岗位？");
 });
 test("blocking: 正文从正文里取问句的边界（超长正文含问号）",()=>{
  const long=LONG_BODY+"关键问题是：你现在手上有JD吗？后面再展开。";
  expect(long.length).toBeGreaterThan(BLOCKING_BODY_LIMIT);
  const r=guardInsufficientReply({answer:`<clarify level="blocking"></clarify>${long}`,suggestions:[],userText:"问题"});
  // 标签为空 → pickQuestion(rest) 取到第一句问号，仍是一句澄清。
  expect(r.answer.endsWith("？")).toBe(true);
  expect(r.answer.length).toBeLessThan(200);
 });
 test("non-blocking/partial: 正常放行正文，补充提示保留为末句且不重复",()=>{
  const base="指标拆解分三步：先定口径，再拆分子分母，最后归因。这一步你可以先按GMV=订单数×客单价来练。";
  const r=guardInsufficientReply({answer:`${base}\n<clarify level="partial">如果能补充近三个月的实际数字，判断会更准</clarify>`,suggestions:["请带我拆解这个指标"],userText:"指标怎么拆"});
  expect(r.blocked).toBe(false);expect(r.needsMoreInput).toBe(false);expect(r.collapsed).toBe(false);
  expect(r.level).toBe("partial");
  expect(r.answer.startsWith(base)).toBe(true);
  expect(r.answer).toContain("如果能补充近三个月的实际数字");
  expect(r.answer).not.toContain("clarify");
  expect(r.suggestions).toEqual(["请带我拆解这个指标"]);
 });
 test("partial: 提示已在正文中出现时不重复追加",()=>{
  const r=guardInsufficientReply({answer:"如果补充JD原文会更准。\n<clarify level=\"partial\">如果补充JD原文会更准</clarify>",suggestions:[],userText:"帮我改简历"});
  expect(r.answer.match(/补充JD原文/g)).toHaveLength(1);
  expect(r.blocked).toBe(false);
 });
 test("non-blocking: 无标记回答原样放行（含超长）",()=>{
  const answer="回答".repeat(3000);
  const r=guardInsufficientReply({answer,suggestions:["请继续"],userText:"讲讲漏斗"});
  expect(r.answer).toBe(answer);expect(r.suggestions).toEqual(["请继续"]);
  expect(r.blocked).toBe(false);expect(r.needsMoreInput).toBe(false);expect(r.claimsHedged).toBe(0);
 });
 test("无依据的“已掌握/已确认”断言就地降级为待确认",()=>{
  const r=guardInsufficientReply({answer:"你已掌握指标拆解，可以进入下一题。这段经历已确认，直接写进简历。",suggestions:[],userText:"这道题怎么做"});
  expect(r.answer).toContain("你已掌握（待你确认）");
  expect(r.answer).toContain("这段经历已确认（待你确认）");
  expect(r.claimsHedged).toBe(2);
 });
 test("用户本轮原话佐证的断言不改写",()=>{
  const r=guardInsufficientReply({answer:"你已经掌握了指标拆解，我们做迁移题。",suggestions:[],userText:"我确认过口径，已经掌握这部分了"});
  expect(r.answer).toBe("你已经掌握了指标拆解，我们做迁移题。");
  expect(r.claimsHedged).toBe(0);
 });
 test("疑问/假设/否定语气不误伤；blocking 轮断言同样被降级",()=>{
  expect(guardInsufficientReply({answer:"如果你已掌握，我们进入下一题。",userText:""}).claimsHedged).toBe(0);
  expect(guardInsufficientReply({answer:"你还没有掌握指标拆解。",userText:""}).claimsHedged).toBe(0);
  const blocked=guardInsufficientReply({answer:`<clarify level="blocking">你已掌握的范围是哪一步</clarify>\n${LONG_BODY}`,userText:"教教我"});
  expect(blocked.answer).toContain("你已掌握（待你确认）");
 });
 test("边界：空回答/含<followups>残留/非法输入都不崩",()=>{
  const empty=guardInsufficientReply({answer:"",suggestions:[],userText:""});
  expect(empty.answer).toBe("");expect(empty.blocked).toBe(false);expect(empty.level).toBe(null);
  const leftover=guardInsufficientReply({answer:"正常回答。<followups>[\"请继续\"]</followups>",userText:"问题"});
  expect(leftover.answer).toBe("正常回答。<followups>[\"请继续\"]</followups>");
  const dirty=guardInsufficientReply({answer:"<clarify level=\"blocking\"></clarify>",suggestions:undefined as unknown as string[],userText:undefined});
  expect(dirty.answer).toBe(DEFAULT_CLARIFY_QUESTION);expect(dirty.blocked).toBe(true);
 });
 test("before 快照保留守卫介入前的原文，便于审计对比",()=>{
  const answer=`<clarify level="blocking">投的哪个岗位？</clarify>\n${LONG_BODY}`;
  const r=guardInsufficientReply({answer,suggestions:["请继续"],userText:"问题"});
  expect(r.before).toEqual({answer,suggestions:["请继续"]});
 });
 test("放行时不吞掉表格/段落前的空行（否则 GFM 表格塌成一行）",()=>{
  const answer="所以更稳的规则是：\n\n| 调研结果 | 走哪条 |\n|---|---|\n| P0 或 P1 | 正常流程 |";
  const r=guardInsufficientReply({answer,userText:"问题"});
  expect(r.answer).toBe(answer);
  expect(r.answer).toContain("：\n\n| 调研结果");
 });
 // GS-004 的两个真形状：① 要用户重交已在上下文里的文档；② 问原文里已经写明的技能。
 test("索要上下文里已有的 JD 原文 → 判为 document_handover，放行正文并丢掉那句",()=>{
  const answer=`<clarify level="blocking">方便把 JD 原文发我一下吗？</clarify>\n${LONG_BODY}`;
  const r=guardInsufficientReply({answer,suggestions:["请带我过一遍"],userText:"这个岗位我该怎么准备",providedMaterials:[JD,RESUME]});
  expect(r.blocked).toBe(false);expect(r.needsMoreInput).toBe(false);
  expect(r.downgradedRedundantAsk).toBe("document_handover");expect(r.collapsed).toBe(false);
  expect(r.level).toBe("blocking");
  expect(r.answer).not.toContain("方便把 JD 原文发我");
  expect(r.answer.length).toBeGreaterThan(BLOCKING_BODY_LIMIT);
  expect(r.suggestions).toEqual(["请带我过一遍"]);
 });
 test("简历技能栏已写 SQL，模型仍标 blocking 问「有没有用过 SQL」→ 放行正文，那句留作收尾追问（GS-004）",()=>{
  const q="你实习期间有没有实际用 SQL 查过数据、或参与过任何“效果好坏怎么判断”的工作？";
  const answer=`<clarify level="blocking">${q}</clarify>\n${LONG_BODY}`;
  const r=guardInsufficientReply({answer,suggestions:[],userText:"对照这个岗位，我还差什么",providedMaterials:[JD,RESUME]});
  expect(r.blocked).toBe(false);expect(r.downgradedRedundantAsk).toBe("stated_in_material");
  expect(r.collapsed).toBe(false);
  expect(r.answer.startsWith(LONG_BODY)).toBe(true);
  expect(r.answer.endsWith(q)).toBe(true);
 });
 test("材料没给全时仍然拦：索要没在上下文里的简历",()=>{
  const askResume=`<clarify level="blocking">你还没有提供简历原文，能把简历发我一次吗？</clarify>\n${LONG_BODY}`;
  const jdOnly=guardInsufficientReply({answer:askResume,userText:"帮我改简历",providedMaterials:[JD]});
  expect(jdOnly.blocked).toBe(true);expect(jdOnly.downgradedRedundantAsk).toBe(null);
  const none=guardInsufficientReply({answer:askResume,userText:"帮我改简历"});
  expect(none.blocked).toBe(true);
 });
 test("降级只在正文非空时发生：空正文不许守卫凭空放行",()=>{
  const r=guardInsufficientReply({answer:`<clarify level="blocking">能发我一下 JD 吗？</clarify>`,suggestions:[],userText:"怎么准备",providedMaterials:[JD]});
  expect(r.blocked).toBe(true);expect(r.downgradedRedundantAsk).toBe(null);
  expect(r.answer).toBe("能发我一下 JD 吗？");
 });
 test("问的是原文里没写的事 → 该拦的仍然拦（不误把 blocking 全放行）",()=>{
  const answer=`<clarify level="blocking">简历里的这段实习你给我讲讲具体做了什么？</clarify>\n${LONG_BODY}`;
  const r=guardInsufficientReply({answer,userText:"帮我看看",providedMaterials:[RESUME]});
  expect(r.blocked).toBe(true);expect(r.downgradedRedundantAsk).toBe(null);
 });
 test("reaskReason：只认挨着的索要句式与拉丁词钩子",()=>{
  expect(reaskReason("方便提供一下 JD 吗？",[JD])).toBe("document_handover");
  expect(reaskReason("把你的简历发我看看？",[RESUME])).toBe("document_handover");
  expect(reaskReason("你用过 Python 吗？",[RESUME])).toBe("stated_in_material");
  expect(reaskReason("简历我看过了，这段实习你给我讲讲？",[RESUME])).toBe(null);
  expect(reaskReason("你现在想投哪个方向？",[RESUME])).toBe(null);
  expect(reaskReason("你用过 SQL 吗？",[JD])).toBe("stated_in_material");
  expect(reaskReason("你用过 SQL 吗？",[])).toBe(null);
 });
});
