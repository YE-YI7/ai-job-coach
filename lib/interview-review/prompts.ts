/**
 * 面试复盘 - Prompt 体系
 * P1~P6 六个核心 Prompt
 */

import { REVIEW_ROLES, type ReviewRoleId, type ReviewRole } from "./types";

// ===== 工具函数 =====

function getRoleDescription(roleId: ReviewRoleId): string {
  const r = REVIEW_ROLES[roleId];
  return `${r.name}（${r.tag}，${r.duty}）：${r.style}`;
}

function getRoleList(roleIds: ReviewRoleId[]): string {
  return roleIds.map(id => getRoleDescription(id)).join("\n- ");
}

function getSpeakerNames(roleIds: ReviewRoleId[]): string {
  return roleIds.map(id => REVIEW_ROLES[id].name).join("、");
}

// ===== P1: Parser Prompt（面试内容解析）=====

export function getParserPrompt(rawContent: string): string {
  return `你是一位专业的面试内容解析专家。用户将提供真实的面试对话记录（可能是文本粘贴、录音转文字、或笔记形式），你需要将其结构化切分为一问一答的形式。

【核心任务】
将面试原始内容拆分为多个 Q&A 对，每一对包含面试官的问题和用户的回答。

【解析规则】
1. 面试官的问题用 "question" 字段，用户的回答用 "answer" 字段
2. 如果面试官追问属于同一个话题，合并为一个大题
3. 如果用户回答中夹杂了面试官的追问，拆分为多题
4. 每一题自动推荐 1~3 个分类标签（从内容中推断，如"项目深挖"、"算法题"、"行为面"、"系统设计"、"自我介绍"、"八股基础"等）
5. 如果原文格式混乱、缺少明确的 Q/A 边界，尽力推断，在 answer 中标注"（原文不完整）"
6. 如果面试内容只有问题没有回答，answer 留空字符串
7. 序号从 1 开始

【容错要求】
- 支持各种格式：「面试官：」「Q：」「问：」「interviewer:」等开头
- 支持无格式的自然段落（推断哪些是问题，哪些是回答）
- 支持录音转文字的口语化内容

【输出格式】
严格输出 JSON 数组，不要添加任何其他文字或 markdown 标记：
[
  {
    "index": 1,
    "question": "面试官的原始问题",
    "answer": "用户的原始回答",
    "estimated_tags": ["标签1", "标签2"]
  },
  {
    "index": 2,
    "question": "...",
    "answer": "...",
    "estimated_tags": ["..."]
  }
]

【面试原始内容】
${rawContent}

请开始解析：`;
}

// ===== P2: Multi-Role Discussion Prompt（多角色讨论点评）=====

export function getMultiRoleDiscussionPrompt(
  question: string,
  answer: string,
  roleIds: ReviewRoleId[],
  resumeText?: string,
  questionIndex?: number,
  jobDescription?: string
): string {
  const rolesSection = getRoleList(roleIds);
  const speakerNames = getSpeakerNames(roleIds);
  const resumeSection = resumeText
    ? `\n【候选人简历摘要】\n${resumeText}\n`
    : "";
  const jdSection = jobDescription
    ? `\n【目标岗位 JD】\n${jobDescription}\n`
    : "";

  return `你需要模拟${roleIds.length}位面试复盘顾问围绕一道面试题展开自然讨论。他们各有不同的视角和风格。

【参与角色】
- ${rolesSection}

【讨论要求】
1. 对话要自然、真实，像几个朋友在帮你复盘面试
2. 角色之间要有互动——可以附和、补充、反驳
3. 每个角色严格符合其人设风格
4. **不要使用专业术语堆砌**，用通俗易懂的语言
5. 评价要结合实际场景，给出具体例子和建议
6. 如果有JD，要指出回答与岗位要求的匹配/差距
7. 如果有简历，要结合候选人的真实经历给建议
8. ${roleIds.length * 2}-${roleIds.length * 2 + 2}条对话，以一句简短共识收尾
9. 每条对话控制在40-100字，简洁有力
10. 只输出纯文本内容，不要使用 markdown 格式
${resumeSection}${jdSection}
【面试题 Q${questionIndex ?? ""}】
${question}

【候选人的回答】
${answer || "（候选人未提供回答）"}

【输出格式】
严格按以下 JSON 格式输出，不要添加任何其他文字：
[
  {"speaker": "${REVIEW_ROLES[roleIds[0]].name}", "role_id": "${roleIds[0]}", "content": "..."},
  {"speaker": "角色名", "role_id": "角色id", "content": "..."},
  ...
  {"speaker": "共识", "role_id": "consensus", "content": "一句话总结这道题的关键问题和改进方向"}
]

speaker 只能是以下值之一：${speakerNames}、共识
role_id 只能是以下值之一：${roleIds.join("、")}、consensus

请开始讨论：`;
}

// ===== P3: Answer Rewrite Prompt（答案改写）=====

export function getAnswerRewritePrompt(
  question: string,
  originalAnswer: string,
  discussionSummary: string,
  resumeText?: string,
  jobDescription?: string
): string {
  const resumeSection = resumeText
    ? `\n【候选人简历/项目经历】\n${resumeText}\n`
    : "";
  const jdSection = jobDescription
    ? `\n【目标岗位 JD】\n${jobDescription}\n`
    : "";

  return `你是一位经验丰富的面试辅导教练。根据几位顾问的讨论意见，帮候选人改写出一个更好的参考回答。

【核心原则】
1. 这不是"标准答案"，而是"如果你这么说会更好"的参考
2. 必须贴合候选人自身的经历和背景（如有简历则参考）
3. 保留原回答中的真实经历和好的部分
4. 修正讨论中指出的问题（结构不清、缺少数据、逻辑断裂等）
5. 语气自然口语化，像候选人自己会说的话，不要书面腔
6. 如果有JD，回答要突出与岗位要求匹配的能力和经验
7. 用通俗易懂的语言，避免堆砌专业术语

【面试题】
${question}

【候选人的原始回答】
${originalAnswer || "（未提供回答）"}

【顾问讨论要点摘要】
${discussionSummary}
${resumeSection}${jdSection}
【输出要求】
1. 先给出回答骨架（3-5个关键要点，每个10字以内）
2. 再给出完整的改写回答（200-400字，口语化）
3. 不要使用 markdown 格式

【输出格式】
严格输出 JSON，不要添加任何其他文字：
{
  "skeleton": ["要点1", "要点2", "要点3"],
  "rewritten_answer": "改写后的完整回答..."
}

请开始改写：`;
}

// ===== P4: Follow-up Drill Prompt（追问出题）=====

export function getFollowUpDrillPrompt(
  question: string,
  answer: string,
  weaknessTags: string[],
  count: number = 3
): string {
  return `你是一位精准的面试追问出题专家。基于候选人在某道面试题上暴露的弱点，出${count}道精准追问题。

【追问目的】
不是为了难住候选人，而是帮助他们在弱点上集中突破训练。每道追问都要精准命中弱点。

【原始面试题】
${question}

【候选人的回答】
${answer || "（未提供回答）"}

【暴露的弱点标签】
${weaknessTags.join("、")}

【追问策略】
- 若"结构逻辑差" → 出需要分层、分点论述的题
- 若"项目讲不清" → 出深挖项目细节的连续追问（你的角色？遇到什么困难？怎么解决的？数据怎样？）
- 若"量化不足" → 出需要数据支撑的"结果量化"追问
- 若"基础薄弱" → 出原理解释题
- 若"沟通表达差" → 出需要清晰表达复杂概念的题
- 若"缺少亮点" → 出能展现候选人优势和差异化的题

【输出格式】
严格输出 JSON 数组，不要添加任何其他文字：
[
  {
    "question": "追问题1",
    "focus_area": "这道题在训练什么能力",
    "difficulty": "easy/medium/hard"
  },
  {
    "question": "追问题2",
    "focus_area": "...",
    "difficulty": "..."
  }
]

请出题：`;
}

// ===== P5: Coach Summary Prompt（整场总结）=====

export function getCoachSummaryPrompt(
  questionsData: Array<{
    question: string;
    score: string;
    tags: string[];
    key_issues: string;
  }>,
  company: string,
  round: string,
  jobDescription?: string,
  resumeText?: string
): string {
  const questionsSection = questionsData
    .map((q, i) => `Q${i + 1}[${q.score}][${q.tags.join(",")}]: ${q.question}\n  关键问题: ${q.key_issues}`)
    .join("\n\n");

  const jdSection = jobDescription
    ? `\n【目标岗位 JD】\n${jobDescription}\n`
    : "";
  const resumeSection = resumeText
    ? `\n【候选人简历摘要】\n${resumeText}\n`
    : "";

  return `你是一位温柔但坦率的面试复盘总教练。基于对每道题的分析结果，给出本场面试的整体复盘总结。

【面试信息】
公司：${company || "未知"}
轮次：${round || "未知"}
${jdSection}${resumeSection}
【逐题分析结果】
${questionsSection}

【总结要求】
1. "one_line_summary"：一句话总结本场面试（20字以内，犀利且准确，用大白话）
2. "biggest_weakness"：最核心的一个短板（不要多个，就一个最要命的，说人话）
3. "biggest_strength"：最亮眼的一个优势
4. "training_suggestions"：3条具体、可执行的改进建议（不要空泛的"加强练习"，要具体到可以立刻去做的事情）
5. "overall_grade"：S/A+/A/A-/B+/B/B-/C+/C/D 打分
6. "recommended_tags"：推荐本场面试的标签（3~5个），用于历史分类
7. 如果有JD，评估候选人与岗位要求的匹配度，建议中要包含如何补齐与JD差距的具体行动
8. 如果有简历，结合候选人真实背景给出针对性建议
9. 用通俗易懂的语言，不要堆砌专业术语

【输出格式】
严格输出 JSON，不要添加任何其他文字：
{
  "overall_grade": "B+",
  "one_line_summary": "技术基础扎实但项目经验表达不够有力",
  "biggest_weakness": "项目成果缺少数据量化，说服力不足",
  "biggest_strength": "算法基础扎实，思路清晰",
  "training_suggestions": [
    "用STAR法则重新梳理3个核心项目经历，每个都准备量化数据",
    "针对系统设计题做5次限时口述练习",
    "准备3个能展现领导力的行为面故事"
  ],
  "recommended_tags": ["技术面", "项目深挖", "后端"]
}

请开始总结：`;
}

// ===== P6: Tag Recommendation Prompt（标签推荐）=====

export function getTagRecommendationPrompt(rawContent: string): string {
  return `你是一位面试内容分析专家。根据面试的原始内容，推荐合适的分类标签。

【标签用途】
帮助用户在历史记录中快速筛选和归类面试记录。

【参考标签池（不限于此，可以自由扩展）】
- 考察类型：项目深挖、结构化表达、业务理解、行为面（BQ）、八股基础、系统设计、算法题、场景题、反问质量
- 面试特征：压力面、轻松氛围、高难度、基础考察、文化匹配、薪资谈判
- 专业方向：前端、后端、全栈、移动端、算法、数据、产品、测试、运维
- 其他：自我介绍、职业规划、离职原因

【面试原始内容】
${rawContent}

【输出要求】
推荐 3~6 个最贴切的标签，不要过度打标。

【输出格式】
严格输出 JSON 数组，不要添加任何其他文字：
["标签1", "标签2", "标签3"]

请推荐标签：`;
}

// ===== P7: Question Score Prompt（单题打分）=====

export function getQuestionScorePrompt(
  question: string,
  answer: string,
  discussionContent: string,
  jobDescription?: string
): string {
  const jdHint = jobDescription
    ? `\n注意：结合目标岗位JD要求进行评分，如果回答与岗位需求高度匹配可适当加分。\n`
    : "";

  return `基于面试题和回答内容，以及顾问讨论的要点，给这道题打一个评级分数。
${jdHint}
【面试题】
${question}

【候选人回答】
${answer || "（未提供）"}

【顾问讨论要点】
${discussionContent}

【评级标准】
- S：完美回答，远超预期
- A+/A/A-：优秀，要点齐全，有亮点
- B+/B/B-：合格，基本覆盖但有不足
- C+/C：及格线边缘，明显短板
- D：不及格，需要大幅改进

只输出一个评级字母（如 "B+" ），不要其他任何文字。`;
}

// ===== P8: Follow-up Answer Feedback Prompt（追问回答即时反馈）=====

export function getFollowUpFeedbackPrompt(
  followUpQuestion: string,
  focusArea: string,
  userAnswer: string,
  originalQuestion?: string
): string {
  const contextSection = originalQuestion
    ? `\n【原始面试题（上下文）】\n${originalQuestion}\n`
    : "";

  return `你是一位精准的面试回答评估专家。对候选人的追问回答进行即时反馈，从三个维度简短点评。
${contextSection}
【追问题目】
${followUpQuestion}

【训练方向】
${focusArea}

【候选人回答】
${userAnswer}

【评估维度】
1. 结构（structure）：回答是否有清晰的逻辑结构和分层
2. 深度（depth）：是否展现了足够的技术深度或思考深度
3. 说服力（persuasion）：是否有数据、案例或具体细节支撑

【输出格式】
严格输出 JSON，不要添加任何其他文字：
{
  "grade": "B+",
  "structure": "一句话评价结构（15字以内）",
  "depth": "一句话评价深度（15字以内）",
  "persuasion": "一句话评价说服力（15字以内）",
  "suggestion": "一句最关键的改进建议（30字以内）"
}

请评估：`;
}

// ===== P9: Training Task Generation Prompt（训练任务生成）=====

export function getTrainingTaskPrompt(
  questions: Array<{
    question: string;
    answer: string;
    score: string;
    tags: string[];
    consensus: string;
    training_tasks: string[];
  }>,
  summary: {
    biggest_weakness: string;
    training_suggestions: string[];
  }
): string {
  const questionsSection = questions
    .map((q, i) => `Q${i + 1}[${q.score}][${q.tags.join(",")}]: ${q.question}\n  共识: ${q.consensus}\n  已有建议: ${q.training_tasks.join("; ")}`)
    .join("\n\n");

  return `你是一位精准的面试训练计划制定专家。基于面试复盘的分析结果，为每道题和整场面试生成具体、可执行的训练任务。

【逐题分析结果】
${questionsSection}

【整场核心短板】
${summary.biggest_weakness}

【整场改进建议】
${summary.training_suggestions.map((s, i) => `${i + 1}. ${s}`).join("\n")}

【任务生成规则】
1. 每道题生成 1~2 个训练任务（聚焦该题暴露的最核心弱点）
2. 整场面试生成 1~2 个综合训练任务（聚焦整体短板）
3. 任务必须是具体、可操作的（"用STAR法则重写项目经历" 而不是 "加强表达能力"）
4. title 控制在 20 字以内，description 控制在 50 字以内
5. task_type 分类：
   - practice：答题结构练习（分点论述、STAR法则）
   - review：知识复习（八股、原理、概念）
   - drill：模拟追问训练（连续深挖）
   - expression：表达优化（量化数据、简洁表述）

【输出格式】
严格输出 JSON，不要添加任何其他文字：
{
  "question_tasks": [
    {
      "question_index": 0,
      "tasks": [
        {
          "title": "用STAR重写项目成果",
          "description": "将项目经历用Situation-Task-Action-Result结构重新组织，补充量化数据",
          "task_type": "practice"
        }
      ]
    }
  ],
  "summary_tasks": [
    {
      "title": "准备3个量化案例",
      "description": "每个核心项目准备至少2个可量化的成果数据点",
      "task_type": "expression"
    }
  ]
}

请生成训练任务：`;
}
