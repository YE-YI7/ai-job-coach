/**
 * 面试复盘 - 类型定义
 */

// ===== 角色体系 =====
// 命名风格参考多邻国（Duolingo）：简短 2~4 字母，有记忆点，跨文化友好
// 插画风格符合项目UI：全身简约矢量，透明底，浅色基底+轻渐变，圆润几何，lucide-react线性图标风格

export type ReviewRoleId = "kay" | "mia" | "rex" | "vivi" | "coco" | "lu";

export interface ReviewRole {
  id: ReviewRoleId;
  name: string;
  tag: string;
  duty: string;              // 角色职责：在面试复盘中负责的具体任务
  style: string;
  colorClass: string;       // tailwind 图标色
  bgClass: string;           // tailwind 背景色
  borderClass: string;       // tailwind 边框色
  bubbleBgClass: string;     // 气泡背景色
  accentHex: string;         // 角色主色 hex
  avatar?: string;           // 角色插画路径（全身简约矢量，透明底）
}

export const REVIEW_ROLES: Record<ReviewRoleId, ReviewRole> = {
  kay: {
    id: "kay",
    name: "Kay",
    tag: "大厂技术总监",
    duty: "负责诊断技术短板，指出技术深度不足和系统思维缺失，追问架构设计思路",
    style: "犀利直接，关注技术深度和系统思维，多用「这个地方不够深入」「你需要思考底层逻辑」",
    colorClass: "text-indigo-600",
    bgClass: "bg-indigo-50",
    borderClass: "border-indigo-300",
    bubbleBgClass: "bg-indigo-50",
    accentHex: "#4f46e5",
  },
  mia: {
    id: "mia",
    name: "Mia",
    tag: "面霸学姐",
    duty: "负责给出标准/参考答案，分享面试话术和通关技巧，提供高分回答模板",
    style: "亲切鼓励，分享通关技巧和话术，多用「我当时也遇到过」「你可以这么说」",
    colorClass: "text-emerald-600",
    bgClass: "bg-emerald-50",
    borderClass: "border-emerald-300",
    bubbleBgClass: "bg-emerald-50",
    accentHex: "#059669",
  },
  rex: {
    id: "rex",
    name: "Rex",
    tag: "创业公司CTO",
    duty: "负责评估项目实战能力，追问落地细节和量化数据，考察解决问题的思路",
    style: "务实坦率，关注落地能力和成长潜力，多用「实际项目中你会怎么做」「这个能不能量化」",
    colorClass: "text-orange-600",
    bgClass: "bg-orange-50",
    borderClass: "border-orange-300",
    bubbleBgClass: "bg-orange-50",
    accentHex: "#ea580c",
  },
  vivi: {
    id: "vivi",
    name: "Vivi",
    tag: "资深猎头",
    duty: "负责点评沟通表达和职业形象，从面试官视角解读问题意图，提供软实力建议",
    style: "温柔但毒舌，关注软实力和沟通表达，多用「面试官其实想听的是」「你的表达方式可以再调一下」",
    colorClass: "text-violet-600",
    bgClass: "bg-violet-50",
    borderClass: "border-violet-300",
    bubbleBgClass: "bg-violet-50",
    accentHex: "#7c3aed",
  },
  coco: {
    id: "coco",
    name: "Coco",
    tag: "同期求职者",
    duty: "负责情绪支持和共情，从面试者视角分享真实感受，缓解面试焦虑",
    style: "共情打气，提供面试者视角，多用「我也遇到过这种」「别灰心」「下次可以...」",
    colorClass: "text-rose-500",
    bgClass: "bg-rose-50",
    borderClass: "border-rose-300",
    bubbleBgClass: "bg-rose-50",
    accentHex: "#f43f5e",
  },
  lu: {
    id: "lu",
    name: "Prof. Lu",
    tag: "高校导师",
    duty: "负责检验基础功底，纠正原理性错误和逻辑漏洞，确保技术概念理解准确",
    style: "学术严谨，关注基础功底和逻辑表达，多用「从原理上来说」「你的逻辑链条断了」",
    colorClass: "text-amber-700",
    bgClass: "bg-amber-50",
    borderClass: "border-amber-300",
    bubbleBgClass: "bg-amber-50",
    accentHex: "#b45309",
  },
};

// ===== 解析结果 =====

export interface ParsedQuestion {
  index: number;
  question: string;
  answer: string;
  estimated_tags: string[];
}

// ===== 单题分析 =====

export interface DiscussionTurn {
  speaker: string;
  role_id: ReviewRoleId | "consensus";
  content: string;
}

export interface QuestionAnalysisResult {
  question_index: number;
  question: string;
  answer: string;
  tags: string[];
  score: string; // S/A/B/C/D
  discussion: DiscussionTurn[];
  answer_skeleton: string[];
  rewritten_answer: string;
  training_tasks: string[];
}

// ===== 整场汇总 =====

export interface ReviewSummary {
  overall_grade: string;
  one_line_summary: string;
  biggest_weakness: string;
  biggest_strength: string;
  training_suggestions: string[];
  recommended_tags: string[];
}

// ===== 追问出题 =====

export interface FollowUpQuestion {
  question: string;
  focus_area: string;
  difficulty: "easy" | "medium" | "hard";
}

// ===== 追问回答反馈 =====

export interface FollowUpFeedback {
  grade: string;           // S/A/B/C/D
  structure: string;       // 结构评价（一句话）
  depth: string;           // 深度评价（一句话）
  persuasion: string;      // 说服力评价（一句话）
  suggestion: string;      // 改进建议（一句话）
}

// ===== 训练任务 =====

export type TaskType = "practice" | "review" | "drill" | "expression";
export type TaskSource = "question" | "summary" | "manual";
export type TaskStatus = "pending" | "completed";

export interface TrainingTask {
  id: string;
  user_id: string;
  session_id: string | null;
  question_index: number | null;
  title: string;
  description: string;
  task_type: TaskType;
  source: TaskSource;
  status: TaskStatus;
  completed_at: string | null;
  context: {
    company?: string;
    round?: string;
    question?: string;
    score?: string;
  };
  created_at: string;
  updated_at: string;
}

// ===== Session =====

export interface ReviewSession {
  id: string;
  user_id: string;
  company: string;
  round: string;
  interview_time: string;
  tags: string[];
  resume_snapshot?: string;
  raw_content: string;
  parsed_questions: ParsedQuestion[];
  analysis_results: QuestionAnalysisResult[];
  summary: ReviewSummary | null;
  created_at: string;
  updated_at: string;
}

// ===== API Types =====

export interface CreateSessionRequest {
  company: string;
  round: string;
  interview_time: string;
  tags: string[];
  resume_text?: string;
}

export interface ParseRequest {
  session_id: string;
  raw_content: string;
}

export interface AnalyzeRequest {
  session_id: string;
  questions: ParsedQuestion[];
  resume_text?: string;
  selected_roles?: ReviewRoleId[];
}

export interface FollowUpRequest {
  session_id: string;
  question_index: number;
  question: string;
  answer: string;
  weakness_tags: string[];
}

// ===== 角色选择逻辑 =====

/**
 * 根据面试类型选择 3~4 个角色参与讨论
 */
export function selectRolesForRound(round: string, tags: string[]): ReviewRoleId[] {
  const tagSet = new Set(tags.map(t => t.toLowerCase()));
  const allRoles: ReviewRoleId[] = ["kay", "mia", "rex", "vivi", "coco", "lu"];

  // 权重映射
  const weights: Record<ReviewRoleId, number> = {
    kay: 1,
    mia: 1,
    rex: 1,
    vivi: 1,
    coco: 1,
    lu: 1,
  };

  // 根据轮次加权
  if (round.includes("技术") || round.includes("一面") || round.includes("二面")) {
    weights.kay += 3;
    weights.rex += 2;
    weights.lu += 1;
  }
  if (round.includes("HR") || round.includes("终面")) {
    weights.vivi += 3;
    weights.coco += 2;
    weights.mia += 1;
  }
  if (round.includes("项目")) {
    weights.rex += 3;
    weights.kay += 2;
  }
  if (round.includes("总监")) {
    weights.kay += 3;
    weights.vivi += 2;
  }

  // 根据标签加权
  if (tagSet.has("八股") || tagSet.has("基础")) {
    weights.lu += 2;
    weights.kay += 1;
  }
  if (tagSet.has("行为面") || tagSet.has("bq")) {
    weights.vivi += 2;
    weights.mia += 1;
  }
  if (tagSet.has("系统设计")) {
    weights.kay += 2;
    weights.rex += 2;
  }
  if (tagSet.has("项目深挖")) {
    weights.rex += 2;
    weights.kay += 1;
  }

  // 按权重排序，选前 3~4 个
  const sorted = allRoles.sort((a, b) => weights[b] - weights[a]);
  const count = Math.random() > 0.5 ? 4 : 3;
  return sorted.slice(0, count);
}
