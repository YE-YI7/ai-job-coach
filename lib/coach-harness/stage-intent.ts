import type { OpportunityStage } from "@/lib/opportunities/types";

// 用户在对话里说出的真实动作（"我投了""约到二面了""在谈薪了"），
// 导师据此推进岗位阶段——不再有独立的投递跟踪页去手动点。
// 这里只做纯字符串判断，不触网、不调模型；识别不到就不改阶段。

/** 阶段在求职流程里的先后；用于「只前进不后退」。 */
const RANK: Partial<Record<OpportunityStage, number>> = {
  captured: 0,
  evaluating: 1,
  preparing_application: 2,
  applied: 3,
  interviewing: 4,
  negotiating: 5,
  won: 6,
};

/** 求教/假设/疑问句里出现的动作词是"想知道怎么做"，不是"已经做了"，一律不推进。 */
const NOT_AN_ACTION =
  /怎么|怎样|咋|如何|教我|请教|该不该|要不要|能不能|可不可以|如果|假如|要是|倘若|若是|万一|该注意|要注意|吗\s*[？?]?|呢\s*[？?]?$|[？?]$|\?/i;

/** 从用户这句话里推断他声称发生的动作；没有明确动作返回 null。 */
export function inferStageIntent(message: string): OpportunityStage | null {
  const text = String(message ?? "").trim();
  if (!text) return null;
  // 反向信号优先：先说"没投/还没投/还没面"就不能被后面的关键词误判。
  if (/还没(投|投递|约面|面试|进入|到)|还没投过|没(投|投递)了|尚未投递/.test(text)) return null;
  // 求教/假设/疑问（"教我怎么谈薪""如果我拿到 offer 呢？"）：动作词只是被问的对象，不是已发生的事实。
  if (NOT_AN_ACTION.test(text)) return null;
  if (/谈薪|谈offer|谈 offer|offer.*谈|薪资.*谈|已经在谈|收到offer.*(谈|沟通)|发 offer|给了offer/i.test(text)) return "negotiating";
  if (/拿到offer|拿到 offer|接了offer|accepted.*offer|通过了.*全部|拿到意向/i.test(text)) return "won";
  if (/约面|约到|面试约|安排了.*(面|试)|收到.*(面试|邀约)|在面试|面完|面了|第[一二三四五1-9]面|一?面结束|刚面完|约了.*面|进入面试/i.test(text)) return "interviewing";
  if (/投了|已经投|刚投|投过|投递了|已投递|提交了?(简历|申请)|投了简历|海投了|apply(ed)?\b/i.test(text)) return "applied";
  return null;
}

/** 只允许前进（含并列），不允许把已推进的阶段拉回。返回需要写入的新阶段，或 null 表示不改。 */
export function advanceStage(current: OpportunityStage, intent: OpportunityStage | null): OpportunityStage | null {
  if (!intent) return null;
  const now = RANK[current];
  const next = RANK[intent];
  if (next === undefined) return null;
  // 终态（lost/withdrawn/archived）或未知当前阶段：不自动改写，交给用户显式处理。
  if (now === undefined) return null;
  if (next <= now) return null;
  return intent;
}
