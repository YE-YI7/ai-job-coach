/**
 * W6-① 介入可见性的纯前端视图模型。
 *
 * 守卫（insufficiency guard）返回的 level/needsMoreInput/blocked/collapsed/
 * downgradedRedundantAsk/claimsHedged 落在每轮 learning_trace.insufficiency 里，
 * 此前前端一个字都没消费——「拦下来问」和「降级先答」两种轮次渲染得一模一样。
 *
 * 规则（每轮至多一条小注，不做徽章 parade）：
 * - 正文永远先渲染，小注只解释「这轮回答为什么换了形状」；
 * - 多种信号同时出现时按 拦截 > 误拦降级 > 部分作答 取第一条，不叠加；
 * - 措辞是平实的中文句子，不用警告语气、不用三角符号。
 */

export interface InsufficiencyTrace {
  level?: "blocking" | "partial" | null;
  needsMoreInput?: boolean;
  blocked?: boolean;
  collapsed?: boolean;
  downgradedRedundantAsk?: "document_handover" | "stated_in_material" | null;
  providedMaterials?: string[];
  claimsHedged?: number;
}

export type TurnIntervention = {
  /** blocked = 导师拦下来先问一件事；answered-partially = 按现有信息先答；no-repeat-ask = 不再重复索要已有材料 */
  kind: "blocked" | "answered-partially" | "no-repeat-ask";
  text: string;
};

/** 从一轮的 learning_trace 里读守卫字段；历史轮与实时轮走同一条判定。 */
export function insufficiencyFromTrace(trace: unknown): InsufficiencyTrace | null {
  if (!trace || typeof trace !== "object") return null;
  const value = (trace as { insufficiency?: unknown }).insufficiency;
  if (!value || typeof value !== "object") return null;
  return value as InsufficiencyTrace;
}

export function turnIntervention(insuff?: InsufficiencyTrace | null): TurnIntervention | null {
  if (!insuff) return null;
  const downgraded = insuff.downgradedRedundantAsk === "document_handover" || insuff.downgradedRedundantAsk === "stated_in_material";
  if (insuff.blocked || insuff.needsMoreInput) {
    // collapsed = 模型本想过完一轮长答，被守卫收敛成一句澄清；值得说一句。
    return {
      kind: "blocked",
      text: insuff.collapsed
        ? "这一步还缺一个关键信息，导师把长回答先收住，只问你这一个问题。"
        : "这一步的信息还不够，导师先问清这一件事，再继续往下带。",
    };
  }
  if (downgraded) {
    return {
      kind: "no-repeat-ask",
      text: insuff.downgradedRedundantAsk === "document_handover"
        ? "你要重交的材料其实已经在了，导师不再重复索要，直接用已提供的原文作答。"
        : "你想问的那条事实原文里已经写了，导师不再回头盘问你，直接从它出发。",
    };
  }
  if (insuff.level === "partial") {
    return {
      kind: "answered-partially",
      text: "导师按你已给的信息先答了；缺的那部分在正文末尾，补上会更准。",
    };
  }
  return null;
}
