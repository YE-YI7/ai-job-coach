import { createHash } from "node:crypto";
import compiledKnowledge from "@/data/knowledge-documents.generated.json";
import { BLOCKING_BODY_LIMIT, BLOCKING_BODY_SENTENCES, REASK_KINDS } from "./insufficiency-guard";
import { DEFAULT_GUARD_IDS } from "./guard-slots";
import { CITATION_VERIFIER_GUARD_INPUT } from "./citation-verifier";
import { repetitionAbortDecision } from "./guard-slots/stream.guards";
import { advanceStage, inferStageIntent } from "./stage-intent";
import type { OpportunityStage } from "@/lib/opportunities/types";
import { chooseChatModel, type ChatMode } from "./chat-options";
import { ECONOMY_MODEL_ID, PREMIUM_MODEL_IDS, SELECTABLE_MODEL_IDS } from "./model-catalog";

/**
 * 版本联合指纹（PRD FR-34）。
 *
 * 「这一版和那一版不一样」必须能拆成五个有名有姓的组件：提示词、检索配置、护栏
 * （阈值 + 四槽挂载清单）、模型路由、知识库编译产物。合成一个不透明哈希就无法回答
 * 「只动了一个组件吗」，两版之间动了两个组件时，评测差异也说不清是谁造成的。
 */
export const HARNESS_COMPONENTS = ["prompt", "retrieval", "guard", "modelRoute", "knowledge"] as const;
export type HarnessComponent = (typeof HARNESS_COMPONENTS)[number];
export interface HarnessFingerprint extends Record<HarnessComponent, string> {
  /** 五段串起来再取哈希：结果文件只要记这一个值，比对时回到五段看是谁动了。 */
  combined: string;
}

/**
 * 导师链路的检索配置。路由与评测回放必须共用这一份常量——回放挂的版本号
 * 若和线上跑的不是同一处定义，那份数据就不能用来做发布判断。
 */
export const TUTOR_RETRIEVAL_CONFIG = {
  task: "mock_interview",
  routeClass: "single_inference",
  maxInputTokens: 4000,
  knowledgeLimit: 2,
  claimSelectionVersion: "tutor-bounded-relevant-facts-v1",
} as const;

/**
 * 模型路由的探针：固定档位 × 固定问法，把 chooseChatModel 的实际选路结果一并哈希。
 * 路由表或分诊正则一改，探针结果就变——不用人工维护「路由版本号」。
 */
const ROUTE_MODES: ChatMode[] = ["auto", "fast", ...(SELECTABLE_MODEL_IDS as readonly string[]) as ChatMode[]];
const ROUTE_QUERIES = [
  "帮我改简历",
  "这道题不会做，带我练一遍",
  "Agent 架构与 RAG 召回怎么设计",
  "面试谈薪怎么开口",
  "两个 offer 怎么选",
  "明天二面，来一轮模拟",
  "SQL 数据查询怎么写",
  "这个岗位我够格投吗",
];
const ROUTE_CANDIDATES = [...PREMIUM_MODEL_IDS, ECONOMY_MODEL_ID, ...(SELECTABLE_MODEL_IDS as readonly string[])];

function hash(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 12);
}

function routeProbePayload() {
  const rows: Array<[string, string, string | null]> = [];
  for (const mode of ROUTE_MODES) {
    for (const query of ROUTE_QUERIES) rows.push([mode, query, chooseChatModel(mode, query, ROUTE_CANDIDATES)]);
  }
  return { catalog: ROUTE_CANDIDATES, probes: rows };
}

/**
 * 护栏的行为探针：与 modelRoute 段同一口径——哈希「这批固定输入现在跑出什么裁决」，
 * 不哈希表文本，也不哈希话术。改了判定才会变，改注释、改变量名、改文案都不会；
 * 反过来，任何一条在线上跑的判定（槽4 的阶段推进词表、槽2 的重复检测阈值）
 * 被改坏，指纹必须跟着动——否则两版评测分数会被当成可比。
 * 导出只为让测试能断言探针真有判别力（全 null / 全 pass 的探针哈希不出任何差别）。
 */
const STAGE_INTENT_PROBES = [
  "我投了字节的产品岗",
  "教我怎么谈薪",
  "刚拿到 offer",
  "还没投递",
  "约了三面，聊得还行",
  "如果拿到 offer 呢？",
];
const STAGE_ADVANCE_PROBES: Array<[OpportunityStage, OpportunityStage]> = [
  ["captured", "applied"],
  ["applied", "interviewing"],
  ["interviewing", "evaluating"],
  ["won", "applied"],
];
/** 30 字 × 6 遍：尾巴取 60 字时正好满足「≥30 字 + 连续三份相同」。 */
const REPEAT_UNIT = "这一段回答在原地重复没有推进任何内容只为了触发流式守卫的阈值";
/** 22 字：插在两次复读之间，用来验「全文出现过重复但当前不在原地卡死」不该停。 */
const FILLER_UNIT = "这一句在正常推进新内容不是复读所以不该被停下";

/**
 * 护栏段的探针。**故意点名调守卫实现，不走 runSlot**：指纹要记的是
 * 「这几条判定此刻怎么裁决」，runSlot 只给整槽结果，摘掉一条守卫就变成
 * 少了个裁决而不是变了个值——哈希会跟着动，但说不出是谁动的。
 * 摘守卫这件事由同一哈希里的 mountedGuards 负责记账，两者分工不重叠。
 */
export const GUARD_PROBE_PAYLOAD = {
  stageIntent: STAGE_INTENT_PROBES.map((message) => [message, inferStageIntent(message)] as const),
  stageAdvance: STAGE_ADVANCE_PROBES.map(([current, intent]) => [current, intent, advanceStage(current, intent)] as const),
  repetition: [
    repetitionAbortDecision(REPEAT_UNIT.repeat(6)).outcome,
    // 四份 = 最大粒度下的两份（120 字）：够得着检测窗口，但连续三份才该停。
    // 把判定改成「两份就停」，这一条立刻变红。
    repetitionAbortDecision(REPEAT_UNIT.repeat(4)).outcome,
    repetitionAbortDecision(`${REPEAT_UNIT}${REPEAT_UNIT}${FILLER_UNIT}${REPEAT_UNIT}${REPEAT_UNIT}`).outcome,
  ],
};

// 编译产物的 updated_at 每次 build 都会重写，不代表知识变了，所以不进哈希。
let cachedKnowledgeHash: string | undefined;
function knowledgePayloadHash(): string {
  if (!cachedKnowledgeHash) {
    cachedKnowledgeHash = hash({
      version: compiledKnowledge.version,
      documents: compiledKnowledge.documents,
    });
  }
  return cachedKnowledgeHash;
}

export function harnessFingerprint(input: {
  promptVersion: string;
  systemPrompt: string;
  /**
   * 检索与装配配置。`materials` 是料注册表的取数结果（每条料的优先级、
   * 是否保护区、预算）——改一条料的预算就等于改了装配，指纹必须认。
   */
  retrieval?: { task: string; routeClass?: string; maxInputTokens?: number; knowledgeLimit?: number; materials?: unknown };
}): HarnessFingerprint {
  const components: Record<HarnessComponent, string> = {
    prompt: hash({ promptVersion: input.promptVersion, systemPrompt: input.systemPrompt }),
    retrieval: hash(input.retrieval ?? TUTOR_RETRIEVAL_CONFIG),
    guard: hash({
      blockingBodyLimit: BLOCKING_BODY_LIMIT,
      blockingBodySentences: BLOCKING_BODY_SENTENCES,
      reaskKinds: [...REASK_KINDS],
      // 引用回指闸的三张判定表：动词表/蕴含表/连接词表改一个字都算动了护栏。
      citationVerifier: CITATION_VERIFIER_GUARD_INPUT,
      // 四槽当前挂了哪几条守卫、按什么顺序跑，也是护栏组件的一部分：
      // 挂上一条/摘掉一条 = 动了 guard 段，两版评测分数就不许直接对比。
      mountedGuards: [...DEFAULT_GUARD_IDS],
      // 线上真在跑的另外两处判定：槽4 的阶段推进词表、槽2 的重复检测阈值。
      behaviorProbes: GUARD_PROBE_PAYLOAD,
    }),
    modelRoute: hash(routeProbePayload()),
    knowledge: knowledgePayloadHash(),
  };
  return { ...components, combined: hash(components) };
}

/** 两版之间动了哪些组件。返回长度 > 1 时，这两版的评测分数不许直接对比。 */
export function fingerprintDiff(
  a: HarnessFingerprint,
  b: HarnessFingerprint,
): HarnessComponent[] {
  return HARNESS_COMPONENTS.filter((c) => a[c] !== b[c]);
}
