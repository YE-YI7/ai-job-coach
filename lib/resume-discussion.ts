/**
 * 简历对谈持久化层
 * 管理对谈历史的 localStorage 读写、hash去重等
 */

// ─── Types ───────────────────────────────────────────────

export type DiscussionTurn =
  | { type: "message"; speaker: string; content: string; timestamp: string }
  | { type: "divider"; label: string; timestamp: string }
  | { type: "user-question"; content: string; timestamp: string }
  | { type: "system"; content: string; timestamp: string };

export interface ResumeDiscussionStore {
  turns: DiscussionTurn[];
  lastResumeSnapshot: string;
  lastDiscussionSummary: string;
  updatedAt: string;
}

// ─── Constants ───────────────────────────────────────────

const STORAGE_KEY = "ajc_resumeDiscussion";
const MAX_VISIBLE_ROUNDS = 50; // 前端最多显示50条，但存储保留全量

// ─── Hash ────────────────────────────────────────────────

/**
 * 简单的字符串hash，用于判断简历内容是否变化
 */
export function hashContent(content: string): string {
  let hash = 0;
  const str = content.trim();
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(36);
}

// ─── Storage ─────────────────────────────────────────────

/**
 * 从 localStorage 加载对谈历史
 */
export function loadDiscussionStore(): ResumeDiscussionStore | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const store: ResumeDiscussionStore = JSON.parse(raw);
    if (!store.turns || !Array.isArray(store.turns)) return null;
    return store;
  } catch {
    return null;
  }
}

/**
 * 保存对谈历史到 localStorage
 */
export function saveDiscussionStore(store: ResumeDiscussionStore): void {
  try {
    const toSave = {
      ...store,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch (e) {
    console.error("保存对谈历史失败:", e);
  }
}

/**
 * 清空对谈历史
 */
export function clearDiscussionStore(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.error("清空对谈历史失败:", e);
  }
}

// ─── Helpers ─────────────────────────────────────────────

/**
 * 向对谈历史中追加消息（自动持久化）
 */
export function appendToDiscussion(
  store: ResumeDiscussionStore,
  newTurns: DiscussionTurn[]
): ResumeDiscussionStore {
  const updated: ResumeDiscussionStore = {
    ...store,
    turns: [...store.turns, ...newTurns],
    updatedAt: new Date().toISOString(),
  };
  saveDiscussionStore(updated);
  return updated;
}

/**
 * 从对谈记录中生成摘要（传给下一轮LLM）
 * 取最近一轮对谈的内容
 */
export function getLastRoundSummary(turns: DiscussionTurn[]): string {
  // 从后往前找最近的一个 divider 或起点
  let startIdx = 0;
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i].type === "divider") {
      startIdx = i + 1;
      break;
    }
  }

  const recentTurns = turns.slice(startIdx);
  return recentTurns
    .filter((t): t is Extract<DiscussionTurn, { type: "message" }> => t.type === "message")
    .map((t) => `${t.speaker}：${t.content}`)
    .join("\n");
}

/**
 * 获取可见的对谈记录（限制条数，避免过长）
 */
export function getVisibleTurns(turns: DiscussionTurn[]): DiscussionTurn[] {
  if (turns.length <= MAX_VISIBLE_ROUNDS) return turns;
  
  // 保留最近的 N 条，但确保从 divider 或起点开始
  const startFrom = turns.length - MAX_VISIBLE_ROUNDS;
  let adjustedStart = startFrom;
  
  // 往前找最近的 divider 作为起点
  for (let i = startFrom; i >= 0; i--) {
    if (turns[i].type === "divider") {
      adjustedStart = i;
      break;
    }
  }
  
  return turns.slice(adjustedStart);
}

/**
 * 创建一个空的 store
 */
export function createEmptyStore(): ResumeDiscussionStore {
  return {
    turns: [],
    lastResumeSnapshot: "",
    lastDiscussionSummary: "",
    updatedAt: new Date().toISOString(),
  };
}
