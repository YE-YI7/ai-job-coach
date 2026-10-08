/**
 * 本轮辅导的目标、完成标准与终止判定（PRD 2026-10-08 §6 B1/B2）。
 *
 * 存在的理由：导师聊到第 N 轮还在讲，是因为链路上没有任何地方说「这一轮应该收口了」。
 * LEARNING_SYSTEM 写过「一次只推进一步」，但那是模型自觉；这里把三件事变成服务端事实：
 * 1. intent（学懂 / 练回答 / 改材料）从用户这句原话判，不靠界面模式按钮；
 * 2. 每次辅导有一个目标和一个可检验的完成标准，标准换了要升 criterionVersion；
 * 3. 闭环走到哪一步（讲解 / 引用反馈 / 收尾）由**用户真的开过口**决定，不由模型声明决定。
 *
 * 判定口径全部是纯字符串，不触网、不调模型（§8.4「不增加每轮隐形规划/模型复核」）。
 * 「用户有没有作答」判不准时一律往**漏认**靠：漏认只是这一轮不给表现判断，
 * 认错等于把没做过的事记成用户的成果——后者是 §9.1 的独立硬失败。
 */

/** 完成标准模板版本：改下面的 criterion 文案必须升版，旧成果的「已覆盖」不能跟新标准走。 */
export const TEACHING_CRITERION_VERSION = 1;

/** 三种 intent 就是 B1 的三种要求，不新增第四种。 */
export type TeachingIntent = "learn" | "practice" | "revise";
/** 闭环阶段：讲解（还没让用户开口）→ 引用反馈（用户刚答过）→ 收尾（标准走到头）。 */
export type TeachingStage = "explain" | "feedback" | "closing";

export interface TeachingTurn {
  id: string;
  question: string;
  answer: string;
  /** 导师主动开口的轮次：那句「问题」不是用户说的，永远不算尝试。 */
  proactive?: boolean;
  teaching?: {currentIsAttempt?: boolean; goal?: string; intent?: TeachingIntent; criterionVersion?: number; criterionSatisfied?: boolean};
}

export interface TeachingFrame {
  intent: TeachingIntent;
  /** 本次目标，一行可读；沿用会话首问，用户明确换题就切到新目标。 */
  goal: string;
  /** 可检验的完成标准，例：「不用看稿，自己说清 X 的一条机制」。 */
  criterion: string;
  criterionVersion: number;
  stage: TeachingStage;
  /** 用户真开口作答的历史轮次 id（服务端权威，成果表现判断只能挂在这些 id 上）。 */
  attemptTurnIds: string[];
  /** 本轮这条消息本身是不是用户的作答。 */
  currentIsAttempt: boolean;
  criterionSatisfied: boolean;
  /** 属于首批专项打磨的三个窄场景；场景外不展示任何「达标」口径。 */
  scenarioAudited: boolean;
}

/** 只表示收到/读过，不含任何用户自己的内容。 */
const ACK_ONLY = /^[^。！？\n]{0,8}(?:嗯+|好(?:的|吧|呀|了)?|行|收到|明白(?:了)?|懂(?:了|得)?|知道了|会了|可以|没问题|ok|okay|thanks|谢谢|辛苦)[!！。~\s]*$/i;

/**
 * 用户开口收尾：够了 / 结束 / 先这样 / 不用再练。
 * 长句里的「……就够了」是在说内容（「第二个数字就够了」），不是在结束这次辅导，
 * 所以只认短句——判不准时往漏认靠，代价只是这一轮不强行收尾。
 */
const CLOSING_SIGNAL = /够了|结束|先这样|就到这|先停|今天(就)?到这|不用(?:再)?练|不再练|不需要(?:再)?练/;
const CLOSING_MAX_CHARS = 18;

function isClosing(text: string): boolean {
  const trimmed = text.trim();
  return !!trimmed && trimmed.length <= CLOSING_MAX_CHARS && CLOSING_SIGNAL.test(trimmed);
}

/** 用户在陈述自己的答案，而不是在要一个答案。 */
const SELF_ANSWER = /^(?:我|我们)(?:的)?(?:理解|答案|思路|说法|回答|版本|判断|结论)|(?:我的?答案|答)[:：]|这样(?:说|写|答|讲|算)|我(?:的|这个)(?:方案|做法)(?:是|为)/;

/** 只是表态「我接下来要作答」，内容还没写下——记成尝试等于替用户宣称他做过了。 */
const PROMISE_TO_ANSWER = /我(?:来|自己|先|马上)?(?:试试|试着|说一下|说说|讲讲|答一?下|写一?遍|改写?一?版|按你的说法)/;

/** 索要讲解/草稿的句式：这是提问，不是作答。 */
const ASK_ONLY = /^\s*(?:请|帮我|麻烦|那|好(?:的)?[，,]?\s*(?:帮我|那))?(?:讲讲|教(?:一下|我)?|什么是|怎么|如何|为什么|能不能(?:讲|说|教)|直接给|给我一?版|先(?:讲|说说))/;

/**
 * 首批专项打磨的三个窄场景（PRD §6 B2）：经历表达、RAG 评估口径、
 * Agent 任务分工与上下文边界。场景外照旧正常对话，但链路上不给任何
 * 「已达标」形状的口径，卡片也只说本题表现。
 */

function clean(text: unknown): string {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

/**
 * 「用户自己开口作答」的判定：有实质内容、不是附和、不是纯提问、不只是表态。
 * 判不准时一律往漏认靠：漏认只是这一轮不给表现判断，认错等于把没做过的事记成成果。
 */
export function isUserAttempt(text: unknown): boolean {
  const t = String(text ?? "").trim();
  if (!t || ACK_ONLY.test(t) || isClosing(t)) return false;
  if (/[？?]$/.test(t) && !/[。！]/.test(t.replace(/[？?]/g, "")) && !SELF_ANSWER.test(t)) return false;
  if (ASK_ONLY.test(t) && !SELF_ANSWER.test(t)) return false;
  if (!SELF_ANSWER.test(t) && /不(?:太)?(?:懂|理解|明白|会)|能不能|教我|帮我|请讲|怎么|为什么|换.{0,6}例子/.test(t)) return false;
  // 「那我按你的说法自己写一遍」是表态不是答案；只有接着写出内容（够长）才算开口。
  if (PROMISE_TO_ANSWER.test(t) && !SELF_ANSWER.test(t) && t.length < 30) return false;
  return SELF_ANSWER.test(t) || t.length >= 20;
}

/** 用户这句想做的是哪件事：改材料 > 练回答 > 学懂。 */
export function detectTeachingIntent(message: unknown): TeachingIntent {
  const t = String(message ?? "");
  if (/改(?:一?句|一?版|一下|好|成|简历|经历|文案|这句|这段)|润色|重写成|改写|优化这?句|直接给(?:我)?草稿|能放进简历|这段怎么改/.test(t)) return "revise";
  if (/练(?:一|这|道|题|一下)?|再练|出题|来一题|模拟(?:面试|我问)|问我一?下|试着答一/.test(t)) return "practice";
  return "learn";
}

const CRITERION: Record<TeachingIntent, (short: string) => string> = {
  learn: (s) => `不用看稿，用自己的话说清${s ? `「${s}」` : "这件事"}里的一个机制点，并说它什么时候不成立`,
  practice: (s) => `独立答完这题${s ? `（${s}）` : ""}，答案对上完成标准那一条，不复述导师原话`,
  revise: (s) => `草稿里每个动作和数字都能回到你给过的原话，你能指出这一版改在哪里${s ? `（${s}）` : ""}`,
};

/** 换题就切目标，但原草稿留在原会话里不丢（B1）。 */
const TOPIC_SWITCH = /换个话题|换个主题|改学|不聊.{0,6}了|先不学了|今天不聊/;

function goalOf(message: string, turns: TeachingTurn[]): string {
  const switched = [...turns].reverse().find(turn => !turn.proactive && TOPIC_SWITCH.test(turn.question));
  const latest = [...turns].reverse().find(turn => turn.teaching?.goal);
  const opening = turns.find((turn) => !turn.proactive && clean(turn.question).length >= 6);
  const base = TOPIC_SWITCH.test(message) ? message : latest?.teaching?.goal || switched?.question || clean(opening?.question || "") || message;
  const trimmed = clean(base).slice(0, 100);
  return trimmed || clean(message).slice(0, 100);
}

/**
 * 装配本轮辅导框架。turns 必须是本会话已落库、按时间正序的轮次
 * （proactive 轮保留，靠它把「系统主动问的那句」从尝试证据里剔掉）。
 */
export function teachingFrame(input: { message: string; turns: TeachingTurn[] }): TeachingFrame {
  const message = clean(input.message);
  const turns = (input.turns || []).filter((turn) => clean(turn.question));
  const explicit = /改(?:一?句|一?版|一下|好|成|简历|经历|文案|这句|这段)|润色|改写|重写|(?:让我|带我|我要|再)练|出题|模拟|(?:我要|想|先)学|讲讲|教我|什么是/.test(message);
  const lastIntent = [...turns].reverse().find(turn => !turn.proactive && (turn.teaching?.intent || detectTeachingIntent(turn.question) !== 'learn'));
  const intent = explicit || TOPIC_SWITCH.test(message) ? detectTeachingIntent(message) : lastIntent?.teaching?.intent ?? (lastIntent ? detectTeachingIntent(lastIntent.question) : 'learn');
  const switchIndex = turns.findLastIndex(turn => !turn.proactive && TOPIC_SWITCH.test(turn.question));
  const scoped = TOPIC_SWITCH.test(message) ? [] : turns.slice(Math.max(0,switchIndex));
  const attemptTurnIds = scoped.filter((turn, index) => {
    if (turn.proactive) return false;
    if (typeof turn.teaching?.currentIsAttempt === 'boolean') return turn.teaching.currentIsAttempt && isUserAttempt(turn.question);
    const previous = scoped[index-1]?.answer || '';
    return isUserAttempt(turn.question) && (SELF_ANSWER.test(turn.question) || /你来|你先|试试|试着|你答|自己(?:说|写|设计|答)|举一?个例子/.test(previous));
  }).map((turn) => turn.id);
  const spoken = turns.filter((turn) => !turn.proactive);
  const lastAnswer = clean(spoken.at(-1)?.answer);
  // 上一轮导师请他开口（讲完给练习、或要求重试）——本轮用户的话才是对提示的作答。
  const invited = /你来|你先|试试|试着|你答|答一?次|写一?版|自己(?:说|写|设计|答)|举一?个例子|重说一?遍/.test(lastAnswer);
  const currentIsAttempt = !TOPIC_SWITCH.test(message) && isUserAttempt(message) && (invited || SELF_ANSWER.test(message));
  const goal = goalOf(message, turns);
  const stage: TeachingStage = currentIsAttempt
    ? "feedback"
    : isClosing(message) || (attemptTurnIds.length > 0 && (ACK_ONLY.test(message) || scoped.at(-1)?.teaching?.criterionSatisfied === true && /^(?:继续|收尾|就这样)[。！\s]*$/.test(message)))
      ? "closing"
      : "explain";
  return {
    intent,
    goal,
    criterion: CRITERION[intent](goal.length > 24 ? goal.slice(0, 24) : goal),
    criterionVersion: Math.max(TEACHING_CRITERION_VERSION, turns.at(-1)?.teaching?.criterionVersion ?? (TEACHING_CRITERION_VERSION + turns.filter(turn => !turn.proactive && TOPIC_SWITCH.test(turn.question)).length)) + Number(TOPIC_SWITCH.test(message)),
    stage,
    attemptTurnIds,
    currentIsAttempt,
    criterionSatisfied: scoped.at(-1)?.teaching?.criterionSatisfied === true,
    // 关键词只能说明适用范围，不能自封已通过内容评测。
    scenarioAudited: false,
  };
}

const STAGE_MOVE: Record<TeachingStage, string> = {
  explain:
    "这一步用户还没开口：只讲他缺的那一点，配一个标明「练习示例」的小案例，末尾请他自己作答一次。不铺整门课，不重讲已答过的部分，本轮不判定表现。",
  feedback:
    "用户这一轮自己作答了：先逐句核对他的原话，再对照原来的本题标准反馈。用户已经明确说过的限制或条件不能再作为缺口；不能扩写新标准。用户多补充的合理内容不算错误，例如「结果由用户确认」不应因本题只练两个Agent的职责就要求删除。标准已经覆盖时明确本题完成，openIssue 留空，正文也不得给「需要补充/收紧」的必改清单，只给结束或可选再练。只有原话中能定位到的错误或原标准未覆盖项才指出一个关键缺口；给缺口时 outcome.openIssue 必须与正文一致，不能一面说有缺口一面说全部完成。不要求每题都迁移，不重新倾倒讲解。",
  closing:
    "用户要收尾：只引用他自己实际说过的内容，不能把导师讲解或示范说成用户已经回答。标准尚未确认时就说尚未检验，不得因为用户说懂了或结束而宣称完成。已确认覆盖时可说本题完成，只给「结束这次 / 再练一个」两个选择。不虚构新缺口，不得说他已经掌握、已达标或已独立检验通过。",
};

const INTENT_LABEL: Record<TeachingIntent, string> = { learn: "学懂", practice: "练回答", revise: "改材料" };

/** 渲染成提示词里的一条料；调用方把它注册成 teaching_frame。 */
export function renderTeachingFrame(frame: TeachingFrame): string {
  const lines = [
    `本次 intent：${INTENT_LABEL[frame.intent]}（用户这句原话决定，不是界面按钮）。`,
    `本次目标：${frame.goal}`,
    `完成标准（v${frame.criterionVersion}）：${frame.criterion}`,
    `当前阶段：${frame.stage === "feedback" ? "用户刚作答" : frame.stage === "closing" ? "收尾" : "讲解与邀请尝试"}。`,
    `已落库的本题观察：${frame.criterionSatisfied ? "上次实际作答覆盖当前标准" : "尚未确认覆盖当前标准；收尾不等于完成"}。`,
    STAGE_MOVE[frame.stage],
    frame.attemptTurnIds.length
      ? `已观察到用户本人作答 ${frame.attemptTurnIds.length} 次；表现判断只能针对这些作答，不得扩写成能力结论。`
      : "还没有观察到用户本人作答：不得给任何表现判断，也不得说他已练过。",
    "本轮只记录本题观察；专项内容评测尚未签收，不给永久能力或已专项验收的说法。这是内部证据边界，不向用户讲专项评测、签收、完成标准模板等内部工作流术语。",
    frame.intent === "revise" ? "改材料只给用户可直接使用的草稿，草稿里每个事实都要能回到用户原话；不调用练习、不布置课程。" : "",
  ];
  return lines.filter(Boolean).join("\n");
}
