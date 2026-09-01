/**
 * 模拟面试模块 - LLM 调用封装
 * 支持真实 LLM 调用和 stub 模式自动降级
 */

import { callLLM } from "@/lib/llm";
import { v4 as uuidv4 } from "uuid";
import type {
  GenerateInputs,
  InterviewQuestion,
  Assessment,
  RoundType,
  Tips,
} from "./types";

// ========== 简历数据格式化 ==========

/**
 * 将解析后的简历数据格式化为面试 prompt 可用的文本
 */
export function formatResumeForPrompt(parsed: any): string {
  if (!parsed) return "";
  
  const parts: string[] = [];

  // 个人信息 / 姓名
  if (parsed.name) parts.push(`姓名：${parsed.name}`);
  if (parsed.email) parts.push(`邮箱：${parsed.email}`);
  if (parsed.phone) parts.push(`电话：${parsed.phone}`);

  // 教育背景
  if (parsed.education && Array.isArray(parsed.education) && parsed.education.length > 0) {
    const eduText = parsed.education
      .map((edu: any) => {
        const p = [];
        if (edu.school) p.push(edu.school);
        if (edu.degree) p.push(edu.degree);
        if (edu.major) p.push(edu.major);
        if (edu.time) p.push(edu.time);
        return p.join(" | ");
      })
      .join("\n");
    parts.push(`教育背景：\n${eduText}`);
  }

  // 工作/实习经历
  if (parsed.experiences && Array.isArray(parsed.experiences) && parsed.experiences.length > 0) {
    const expText = parsed.experiences
      .map((exp: any) => {
        const p = [];
        if (exp.company) p.push(`公司：${exp.company}`);
        if (exp.title) p.push(`职位：${exp.title}`);
        if (exp.time) p.push(`时间：${exp.time}`);
        if (exp.text) p.push(exp.text);
        return p.join("\n");
      })
      .join("\n---\n");
    parts.push(`工作/实习经历：\n${expText}`);
  }

  // 项目经历
  if (parsed.projects && Array.isArray(parsed.projects) && parsed.projects.length > 0) {
    const projText = parsed.projects
      .map((proj: any) => {
        const p = [];
        if (proj.title) p.push(`项目：${proj.title}`);
        if (proj.role) p.push(`角色：${proj.role}`);
        if (proj.start && proj.end) p.push(`时间：${proj.start} - ${proj.end}`);
        if (proj.text) p.push(proj.text);
        return p.join("\n");
      })
      .join("\n---\n");
    parts.push(`项目经历：\n${projText}`);
  }

  // 技能
  if (parsed.skills && Array.isArray(parsed.skills) && parsed.skills.length > 0) {
    parts.push(`技能：${parsed.skills.join("、")}`);
  }

  // 自我评价
  if (parsed.summary) {
    parts.push(`自我评价：${parsed.summary}`);
  }

  // 如果是纯文本简历（rawText）
  if (parts.length === 0 && parsed.rawText) {
    // 截取前2000字符避免过长
    return parsed.rawText.substring(0, 2000);
  }

  return parts.join("\n\n");
}

// ========== 生成面试题 ==========

/**
 * Stub 模式：生成多个面试题目（基于现有模板）
 */
function generateStubQuestions(
  roundType: RoundType,
  count: number,
  sessionId?: string
): InterviewQuestion[] {
  // 基于不同轮次类型的模板问题
  const questionTemplates: Record<RoundType, Array<{ q: string; tips: Tips }>> = {
    业务面: [
      {
        q: "请介绍一下你最近负责的一个产品项目，包括项目背景、你的角色、关键决策和最终成果。",
        tips: {
          intent: "考察产品思维、项目管理和结果导向能力",
          keyPoints: [
            "项目背景和目标要清晰",
            "突出个人在项目中的核心贡献",
            "关键决策要有理有据",
            "成果要量化，最好有数据支撑",
          ],
          framework: "背景 → 目标 → 我的角色 → 关键决策 → 执行过程 → 结果指标",
          industryNotes: "产品经理需要具备从0到1的产品能力，以及跨部门协作能力",
          pitfalls: ["只讲过程不讲结果", "没有突出个人贡献", "缺乏数据支撑"],
          proTips: ["用 STAR 法则组织回答", "准备1-2个具体的数据指标", "体现产品思维和用户视角"],
        },
      },
      {
        q: "请描述一次你如何平衡用户需求和商业目标，并给出具体的决策过程。",
        tips: {
          intent: "考察商业思维和决策能力",
          keyPoints: ["理解用户需求", "理解商业目标", "平衡决策", "执行效果"],
          framework: "需求分析 → 目标对齐 → 方案设计 → 执行验证",
          pitfalls: ["只考虑用户或只考虑商业", "缺乏数据支撑", "决策过程不清晰"],
          proTips: ["用数据说话", "展示多方案对比", "体现长期思维"],
        },
      },
      {
        q: "请讲一个你通过数据分析发现并解决产品问题的案例。",
        tips: {
          intent: "考察数据驱动思维和问题解决能力",
          keyPoints: ["数据发现", "问题分析", "解决方案", "效果验证"],
          framework: "数据观察 → 问题假设 → 验证分析 → 解决方案 → 效果评估",
          pitfalls: ["数据解读错误", "缺乏验证", "解决方案不具体"],
          proTips: ["展示完整的数据分析链路", "用数据验证假设", "量化结果"],
        },
      },
    ],
    技术面: [
      {
        q: "请详细描述一个你解决过的技术难题，包括问题背景、分析过程、解决方案和最终效果。",
        tips: {
          intent: "考察技术深度、问题解决能力和技术思维",
          keyPoints: [
            "问题要具体且有挑战性",
            "分析过程要体现技术思维",
            "解决方案要合理且可执行",
            "效果要有量化指标",
          ],
          framework: "问题描述 → 问题分析 → 解决方案 → 实施过程 → 效果验证",
          industryNotes: "技术面试更关注解决问题的思路和技术深度",
          pitfalls: ["问题描述不清晰", "缺乏技术细节", "没有体现思考过程"],
          proTips: ["准备一个能体现技术深度的案例", "突出解决问题的思路", "准备技术细节"],
        },
      },
      {
        q: "请介绍一个你设计的技术架构，包括设计思路、技术选型和权衡考虑。",
        tips: {
          intent: "考察架构设计能力和技术视野",
          keyPoints: ["架构设计", "技术选型", "权衡考虑", "可扩展性"],
          framework: "需求分析 → 架构设计 → 技术选型 → 权衡分析 → 实施验证",
          pitfalls: ["缺乏设计思路", "选型理由不充分", "没有考虑扩展性"],
          proTips: ["展示架构图", "说明选型理由", "体现技术深度"],
        },
      },
      {
        q: "请描述一次你优化系统性能的经历，包括问题定位、优化方案和效果。",
        tips: {
          intent: "考察性能优化能力和问题定位能力",
          keyPoints: ["性能问题定位", "优化方案", "效果验证"],
          framework: "性能分析 → 瓶颈定位 → 优化方案 → 效果验证",
          pitfalls: ["定位不准确", "优化方案不具体", "缺乏效果数据"],
          proTips: ["用工具定位问题", "展示优化前后对比", "量化性能提升"],
        },
      },
    ],
    项目深挖: [
      {
        q: "请用 STAR 法则详细描述一个你主导的项目，包括 Situation、Task、Action 和 Result。",
        tips: {
          intent: "深挖项目细节，考察项目管理和执行能力",
          keyPoints: [
            "Situation 要清晰描述背景",
            "Task 要明确你的任务和目标",
            "Action 要详细说明具体行动",
            "Result 要有量化的结果",
          ],
          framework: "Situation → Task → Action → Result",
          industryNotes: "项目深挖通常关注项目的复杂度和你的贡献",
          pitfalls: ["缺乏具体细节", "没有量化结果", "没有体现个人贡献"],
          proTips: ["准备多个 STAR 案例", "每个案例准备3-5个追问点", "结果要量化"],
        },
      },
      {
        q: "请详细说明你在项目中遇到的最大挑战，以及你是如何克服的。",
        tips: {
          intent: "考察应对挑战的能力和解决问题的能力",
          keyPoints: ["挑战描述", "应对策略", "解决过程", "经验总结"],
          framework: "挑战识别 → 策略制定 → 执行过程 → 结果总结",
          pitfalls: ["挑战描述不具体", "应对策略不清晰", "缺乏经验总结"],
          proTips: ["选择有代表性的挑战", "展示思考过程", "总结可复用的经验"],
        },
      },
      {
        q: "请描述你在项目中如何协调跨部门资源，确保项目顺利推进。",
        tips: {
          intent: "考察跨部门协作和资源协调能力",
          keyPoints: ["资源识别", "协调策略", "沟通技巧", "推进效果"],
          framework: "资源分析 → 协调策略 → 沟通执行 → 效果评估",
          pitfalls: ["协调方式不具体", "缺乏沟通技巧", "效果不明显"],
          proTips: ["展示具体的协调案例", "体现沟通技巧", "量化协调效果"],
        },
      },
    ],
    HR面: [
      {
        q: "请介绍一下你的职业规划，以及为什么选择我们公司？",
        tips: {
          intent: "考察职业规划、动机和匹配度",
          keyPoints: [
            "职业规划要清晰且有逻辑",
            "要体现对公司/岗位的了解",
            "要说明为什么匹配",
            "要体现长期发展意愿",
          ],
          framework: "职业规划 → 公司了解 → 匹配度分析 → 未来展望",
          industryNotes: "HR 面更关注软技能和文化匹配",
          pitfalls: ["职业规划不清晰", "对公司了解不足", "缺乏匹配度说明"],
          proTips: ["提前了解公司文化和业务", "准备职业规划的回答", "体现学习能力和成长意愿"],
        },
      },
      {
        q: "请描述一次你在工作中遇到的最大挫折，以及你是如何应对的。",
        tips: {
          intent: "考察抗压能力和自我调节能力",
          keyPoints: ["挫折描述", "应对方式", "反思总结", "成长收获"],
          framework: "挫折识别 → 应对策略 → 反思总结 → 成长收获",
          pitfalls: ["挫折描述不具体", "应对方式不积极", "缺乏反思"],
          proTips: ["选择有代表性的挫折", "展示积极应对", "体现成长思维"],
        },
      },
      {
        q: "请谈谈你的优缺点，以及你如何改进自己的缺点。",
        tips: {
          intent: "考察自我认知和改进能力",
          keyPoints: ["优点描述", "缺点识别", "改进计划", "执行效果"],
          framework: "优点分析 → 缺点识别 → 改进计划 → 执行验证",
          pitfalls: ["优点不具体", "缺点不真实", "改进计划不清晰"],
          proTips: ["优点要结合岗位", "缺点要真实可改进", "展示改进行动"],
        },
      },
    ],
    总监面: [
      {
        q: "请谈谈你对行业趋势的理解，以及你认为未来3-5年这个行业会如何发展？",
        tips: {
          intent: "考察行业认知、战略思维和前瞻性",
          keyPoints: [
            "要体现对行业的深度理解",
            "要有自己的观点和判断",
            "要结合公司业务谈发展",
            "要体现战略思维",
          ],
          framework: "行业现状 → 趋势分析 → 未来预测 → 对业务的影响",
          industryNotes: "总监面更关注战略思维和行业认知",
          pitfalls: ["缺乏深度思考", "观点不够独特", "没有结合业务"],
          proTips: ["关注行业动态和趋势", "准备1-2个独特的观点", "体现战略思维"],
        },
      },
      {
        q: "请描述你对这个岗位的理解，以及你认为如何在这个岗位上创造价值。",
        tips: {
          intent: "考察岗位理解和价值创造能力",
          keyPoints: ["岗位理解", "价值创造", "执行计划", "预期效果"],
          framework: "岗位分析 → 价值识别 → 执行计划 → 效果预期",
          pitfalls: ["岗位理解不深入", "价值创造不具体", "执行计划不清晰"],
          proTips: ["深入理解岗位职责", "结合自身优势", "展示价值创造思路"],
        },
      },
      {
        q: "请谈谈你对团队管理的理解，以及你如何带领团队达成目标。",
        tips: {
          intent: "考察团队管理和领导能力",
          keyPoints: ["团队管理理念", "目标设定", "执行策略", "效果评估"],
          framework: "管理理念 → 目标设定 → 执行策略 → 效果评估",
          pitfalls: ["管理理念不清晰", "目标设定不合理", "执行策略不具体"],
          proTips: ["展示管理案例", "体现领导力", "量化管理效果"],
        },
      },
    ],
  };

  const templates = questionTemplates[roundType] || questionTemplates["业务面"];
  const questions: InterviewQuestion[] = [];

  for (let i = 0; i < count; i++) {
    const template = templates[i % templates.length];
    questions.push({
      id: uuidv4(),
      session_id: sessionId || "", // 如果提供了 sessionId 则使用，否则留空
      question_text: template.q,
      tips: template.tips,
      created_at: new Date().toISOString(),
    });
  }

  return questions;
}

/**
 * 生成面试题目
 * 
 * @param jd 职位描述
 * @param roundType 面试轮次类型
 * @param count 题目数量
 * @param sessionId 会话ID（可选，如果提供则填充到题目中）
 * @param resumeText 候选人简历文本（可选，用于个性化出题）
 * @returns 面试题目数组
 */
export async function generateInterviewQuestions(
  jd: string,
  roundType: RoundType,
  count: number,
  sessionId?: string,
  resumeText?: string,
  knowledgeContext?: string,
): Promise<InterviewQuestion[]> {
  // 检查是否使用 stub 模式（显式启用 stub）
  const useStub = process.env.LLM_STUB === "1";
  
  if (useStub) {
    console.warn("使用 stub 模式生成面试题（LLM_STUB=1）");
    return generateStubQuestions(roundType, count, sessionId);
  }

  try {
    // 构建 prompt
    const systemPrompt = `你是一名专业的互联网大厂面试官，你了解所有岗位的用人标准。请基于以下信息生成个性化面试题。

任务：
1. 生成 ${count} 个面试问题
2. 每个问题都需要包含 TIPS（面试官评估逻辑）
3. 避免废话，保持问题具体、深入、有针对性
4. 使用严格 JSON 格式输出

输出格式要求：
- 必须是一个 JSON 数组
- 每个元素包含 "q"（问题）和 "tips"（提示信息）
- tips 必须包含：intent、keyPoints、framework、pitfalls、proTips
- 禁止输出任何其他内容，只输出 JSON`;

    const candidateRecord = resumeText
      ? resumeText
      : "暂无（用户未上传简历）";

    const userPrompt = `【岗位 JD】
${jd}

【面试轮次】
${roundType}

【候选人过往记录】
${candidateRecord}

${knowledgeContext || ""}

${resumeText ? "请根据候选人的简历内容，结合岗位JD，生成有针对性的个性化面试问题。重点追问简历中的项目经历、技能匹配度和潜在的弱点。" : ""}
请生成 ${count} 个针对性的面试问题，每个问题都要有完整的 tips 信息。

输出格式（严格 JSON 数组）：
[
  {
    "q": "问题内容",
    "tips": {
      "intent": "考察意图",
      "keyPoints": ["要点1", "要点2", "要点3"],
      "framework": "回答框架",
      "pitfalls": ["避坑点1", "避坑点2"],
      "proTips": ["窍门1", "窍门2"]
    }
  }
]

注意：只输出 JSON，不要有任何其他文字。`;

    // 调用 LLM（使用与 chat 相同的模型配置）
    // 使用较长的超时时间，因为生成多个面试题需要较长时间
    const response = await callLLM(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      {
        model: process.env.LLM_MODEL_CHAT, // 使用与 chat 相同的模型
        temperature: 0.7,
        maxTokens: 2000,
        timeoutMs: 60000, // 60 秒超时，给 LLM 足够时间生成多个题目
        maxRetries: 2,
      }
    );

    // 解析 JSON 响应
    let cleaned = response.trim();
    
    // 移除可能的 markdown 代码块标记
    if (cleaned.startsWith("```json")) {
      cleaned = cleaned.replace(/^```json\n?/i, "").replace(/```\n?$/i, "");
    } else if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```\n?/i, "").replace(/```\n?$/i, "");
    }
    
    cleaned = cleaned.trim();

    // 尝试从 LLM 文本中提取 JSON（优先匹配数组，如果没有则匹配对象）
    let extracted = cleaned.match(/\[[\s\S]*\]/);
    if (!extracted) {
      // 如果没有找到数组，尝试找对象
      extracted = cleaned.match(/\{[\s\S]*\}/);
    }

    if (!extracted) {
      throw new Error("无法从 LLM 响应中提取 JSON");
    }

    let jsonText = extracted[0];

    // --- 清洗非法字符：控制字符（0x00-0x1F except \t \n \r）
    jsonText = jsonText.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

    // --- 去除多余的逗号，比如 ["a", "b", ] 或 { "key": "value", }
    jsonText = jsonText.replace(/,\s*}/g, "}");
    jsonText = jsonText.replace(/,\s*]/g, "]");

    // --- finally parse
    let rawData;
    try {
      rawData = JSON.parse(jsonText);
    } catch (e) {
      console.error("JSON 解析失败：", jsonText);
      throw new Error("LLM 返回内容不是有效 JSON");
    }
    
    // 确保是数组
    const questionsData = Array.isArray(rawData) ? rawData : [rawData];

    // 验证和转换数据
    if (questionsData.length === 0) {
      throw new Error("LLM 返回的问题数量为 0");
    }

    // 如果返回的问题数量不足，使用 stub 补充
    if (questionsData.length < count) {
      console.warn(`LLM 返回 ${questionsData.length} 个问题，需要 ${count} 个，使用 stub 补充`);
      const stubQuestions = generateStubQuestions(roundType, count - questionsData.length, sessionId);
      questionsData.push(...stubQuestions.map(q => ({
        q: q.question_text,
        tips: q.tips,
      })));
    }

    // 转换为 InterviewQuestion 格式
    const questions: InterviewQuestion[] = questionsData.slice(0, count).map((item: any) => {
      // 验证必需字段
      if (!item.q || !item.tips) {
        throw new Error("LLM 返回的问题格式不正确：缺少 q 或 tips");
      }

      // 验证 tips 结构
      const tips: Tips = {
        intent: item.tips.intent || "考察综合能力",
        keyPoints: Array.isArray(item.tips.keyPoints) ? item.tips.keyPoints : [],
        framework: item.tips.framework || "结构化回答",
        pitfalls: Array.isArray(item.tips.pitfalls) ? item.tips.pitfalls : [],
        proTips: Array.isArray(item.tips.proTips) ? item.tips.proTips : [],
      };

      // 可选字段
      if (item.tips.industryNotes) {
        tips.industryNotes = item.tips.industryNotes;
      }

      return {
        id: uuidv4(),
        session_id: sessionId || "", // 如果提供了 sessionId 则使用，否则留空
        question_text: item.q,
        tips: tips,
        created_at: new Date().toISOString(),
      };
    });

    // 确保返回指定数量的题目
    if (questions.length !== count) {
      console.warn(`生成的问题数量 ${questions.length} 不等于请求的数量 ${count}，截取或补充`);
      if (questions.length < count) {
        const stubQuestions = generateStubQuestions(roundType, count - questions.length, sessionId);
        questions.push(...stubQuestions);
      } else {
        questions.splice(count);
      }
    }

    return questions;
  } catch (error: any) {
    console.error("LLM 生成面试题失败，降级到 stub 模式:", error?.message || error);
    
    // 降级到 stub 模式
    return generateStubQuestions(roundType, count, sessionId);
  }
}

// ========== 评估答案 ==========

/**
 * 评估结果维度
 */
interface EvaluationDimension {
  name: string;
  score?: number; // 重答建议和追问建议没有 score
  comment: string;
}

/**
 * 新的评估结果格式（符合前端要求）
 */
interface EvaluationResult {
  score: number; // 0-100
  dimensions: EvaluationDimension[];
  summary: string;
}

/**
 * Stub 模式：生成评估结果
 */
function generateStubEvaluation(): EvaluationResult {
  return {
    score: 60,
    dimensions: [
      { name: "逻辑性", score: 55, comment: "结构不够清晰，需要按照 STAR 展开" },
      { name: "准确性", score: 65, comment: "部分概念表达不准确" },
      { name: "数据指标与量化能力", score: 50, comment: "缺少具体数据支撑" },
      { name: "沟通表达", score: 62, comment: "表达偏散，重点不够明确" },
      { name: "重答建议", comment: "先给结论，再补充你的关键动作和可核实结果。" },
      { name: "追问建议", comment: "这件事里你个人做出的关键决策是什么？" },
    ],
    summary: "回答基本可用，但缺乏亮点，建议补充量化指标和关键决策。",
  };
}

/**
 * 评估用户回答
 * 
 * @param question 面试题目
 * @param jd 职位描述
 * @param answer 用户回答
 * @param roundType 面试轮次类型
 * @returns 评估结果
 */
export async function evaluateAnswer({
  question,
  jd,
  answer,
  roundType,
  resumeText,
  knowledgeContext,
}: {
  question: string;
  jd: string;
  answer: string;
  roundType: RoundType;
  resumeText?: string;
  knowledgeContext?: string;
}): Promise<any> {
  // 检查是否使用 stub 模式（显式启用 stub）
  const useStub = process.env.LLM_STUB === "1";
  
  if (useStub) {
    console.warn("使用 stub 模式生成评估结果（LLM_STUB=1）");
    return generateStubEvaluation();
  }

  try {
    // 构建 prompt
    const systemPrompt = `你是一名资深互联网大厂面试官，你了解大厂所有岗位面试标准，请基于以下信息对候选人的回答进行专业评估。

任务：
1. 从六个维度对回答进行专业评估（逻辑性、准确性、数据指标与量化能力、沟通表达、重答建议、追问建议）
2. 返回 0-100 的总体得分
3. 请生成简洁但有深度的总结（summary）
4. 全部内容必须以严格 JSON 格式返回

输出格式要求：
- 必须是一个 JSON 对象
- score 必须是 0-100 的整数
- dimensions 必须包含 6 个维度，顺序为：逻辑性、准确性、数据指标与量化能力、沟通表达、重答建议、追问建议
- 前 4 个维度必须有 score（0-100）和 comment
- 重答建议和追问建议只有 comment，没有 score
- summary 必须是字符串
- 禁止输出任何其他内容，只输出 JSON`;

    const candidateRecordForEval = resumeText
      ? resumeText
      : "暂无（用户未上传简历）";

    const userPrompt = `【岗位 JD】
${jd}

【面试轮次】
${roundType}

【面试问题】
${question}

【候选人回答】
${answer}

【候选人过往记录】
${candidateRecordForEval}

${knowledgeContext || ""}

${resumeText ? "请结合候选人简历信息评估其回答的真实性、完整性和匹配度。" : ""}
请基于以上信息进行专业评估，返回严格 JSON 格式：

{
  "score": 85,
  "dimensions": [
    { "name": "逻辑性", "score": 80, "comment": "..." },
    { "name": "准确性", "score": 90, "comment": "..." },
    { "name": "数据指标与量化能力", "score": 75, "comment": "..." },
    { "name": "沟通表达", "score": 88, "comment": "..." },
    { "name": "重答建议", "comment": "..." },
    { "name": "追问建议", "comment": "..." }
  ],
  "summary": "..."
}

注意：只输出 JSON，不要有任何其他文字。`;

    // 调用 LLM（使用与 chat 相同的模型配置）
    const response = await callLLM(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      {
        model: process.env.LLM_MODEL_CHAT, // 使用与 chat 相同的模型
        temperature: 0.7,
        maxTokens: 1500,
        timeoutMs: 30000, // 30 秒超时，给 LLM 足够时间评估答案
        maxRetries: 2,
      }
    );

    // 解析 JSON 响应
    let cleaned = response.trim();
    
    // 移除可能的 markdown 代码块标记
    if (cleaned.startsWith("```json")) {
      cleaned = cleaned.replace(/^```json\n?/i, "").replace(/```\n?$/i, "");
    } else if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```\n?/i, "").replace(/```\n?$/i, "");
    }
    
    cleaned = cleaned.trim();

    // 尝试从 LLM 文本中提取 JSON
    let extracted = cleaned.match(/\{[\s\S]*\}/);
    if (!extracted) {
      throw new Error("无法从 LLM 响应中提取 JSON");
    }

    let jsonText = extracted[0];

    // --- 清洗非法字符：控制字符（0x00-0x1F except \t \n \r）
    jsonText = jsonText.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

    // --- 去除多余的逗号，比如 ["a", "b", ] 或 { "key": "value", }
    jsonText = jsonText.replace(/,\s*}/g, "}");
    jsonText = jsonText.replace(/,\s*]/g, "]");

    // --- finally parse
    let rawData;
    try {
      rawData = JSON.parse(jsonText);
    } catch (e) {
      console.error("JSON 解析失败：", jsonText);
      throw new Error("LLM 返回内容不是有效 JSON");
    }
    
    // 验证必需字段
    if (typeof rawData.score !== "number" || rawData.score < 0 || rawData.score > 100) {
      throw new Error("LLM 返回的 score 格式不正确（必须是 0-100 的数字）");
    }
    
    if (!Array.isArray(rawData.dimensions) || rawData.dimensions.length !== 6) {
      throw new Error("LLM 返回的 dimensions 格式不正确（必须是包含 6 个元素的数组）");
    }
    
    if (typeof rawData.summary !== "string") {
      throw new Error("LLM 返回的 summary 格式不正确（必须是字符串）");
    }

    // 验证和转换 dimensions
    const dimensions: EvaluationDimension[] = rawData.dimensions.map((dim: any, index: number) => {
      // 前 4 个维度必须有 score
      if (index < 4) {
        if (typeof dim.score !== "number" || dim.score < 0 || dim.score > 100) {
          throw new Error(`LLM 返回的 dimensions[${index}].score 格式不正确（必须是 0-100 的数字）`);
        }
        if (typeof dim.comment !== "string") {
          throw new Error(`LLM 返回的 dimensions[${index}].comment 格式不正确（必须是字符串）`);
        }
        return {
          name: dim.name || ["逻辑性", "准确性", "数据指标与量化能力", "沟通表达"][index],
          score: Math.round(dim.score), // 确保是整数
          comment: dim.comment,
        };
      } else {
        // 后 2 个维度（重答建议和追问建议）没有 score
        if (typeof dim.comment !== "string") {
          throw new Error(`LLM 返回的 dimensions[${index}].comment 格式不正确（必须是字符串）`);
        }
        return {
          name: dim.name || (index === 4 ? "重答建议" : "追问建议"),
          comment: dim.comment,
        };
      }
    });

    // 构建最终结果
    const result: EvaluationResult = {
      score: Math.round(rawData.score), // 确保是整数
      dimensions: dimensions,
      summary: rawData.summary,
    };

    return result;
  } catch (error: any) {
    console.error("LLM 生成评估结果失败，降级到 stub 模式:", error?.message || error);
    
    // 降级到 stub 模式
    return generateStubEvaluation();
  }
}

// ========== 生成面试总结 ==========

/**
 * 面试总结结果
 */
interface InterviewDimension {
  name: string;
  score: number; // 0-100
  comment: string;
}

interface InterviewSummaryResult {
  overallScore: number; // 0-100
  grade: string; // "S" | "A" | "B+" | "B" | "C" | "D"
  gradeNext: string; // e.g. "再练2次可达A"
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  dimensions: InterviewDimension[]; // 7维度评分
}

/**
 * Stub 模式：生成面试总结
 */
function generateStubSummary(): InterviewSummaryResult {
  return {
    overallScore: 70,
    grade: "B",
    gradeNext: "再练2次可达B+",
    strengths: ["表达清晰", "思路完整"],
    weaknesses: ["缺少量化指标", "项目细节不足"],
    suggestions: ["补充数据指标", "提前准备关键案例"],
    dimensions: [
      { name: "专业深度", score: 72, comment: "基础扎实，但缺少深层原理阐述" },
      { name: "逻辑表达", score: 78, comment: "条理较清晰，结论有时不够明确" },
      { name: "应变能力", score: 65, comment: "面对追问时略显紧张" },
      { name: "项目理解", score: 68, comment: "对项目细节的把控还需加强" },
      { name: "沟通技巧", score: 75, comment: "沟通自然，但需注意倾听" },
      { name: "自我认知", score: 70, comment: "对自身优劣势有基本认知" },
      { name: "文化匹配", score: 73, comment: "价值观基本契合" },
    ],
  };
}

/**
 * 基于已有的单题评估数据动态生成降级总结（替代固定 stub）
 * 当 LLM 调用失败但有单题评估数据时使用
 */
function generateFallbackSummary(assessments: any[]): InterviewSummaryResult {
  // 从单题评估中提取分数
  const scores: number[] = [];
  for (const a of assessments) {
    if (a && typeof a === 'object') {
      const s = a.score ?? a.overallScore;
      if (typeof s === 'number' && s >= 0 && s <= 100) {
        scores.push(s);
      }
    }
  }

  // 如果连分数都没有，真正退化到 stub
  if (scores.length === 0) {
    return generateStubSummary();
  }

  const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const grade = avg >= 90 ? "S" : avg >= 80 ? "A" : avg >= 75 ? "B+" : avg >= 60 ? "B" : avg >= 40 ? "C" : "D";
  const validGrades = ["S", "A", "B+", "B", "C", "D"];
  const nextGrade = validGrades[Math.max(0, validGrades.indexOf(grade) - 1)] || "S";

  // 从评估中收集维度信息
  const dimScores: Record<string, number[]> = {};
  const dimComments: Record<string, string[]> = {};
  for (const a of assessments) {
    if (a?.dimensions && Array.isArray(a.dimensions)) {
      for (const d of a.dimensions) {
        if (d.name && typeof d.score === 'number') {
          if (!dimScores[d.name]) dimScores[d.name] = [];
          dimScores[d.name].push(d.score);
        }
        if (d.name && d.comment) {
          if (!dimComments[d.name]) dimComments[d.name] = [];
          dimComments[d.name].push(d.comment);
        }
      }
    }
  }

  // 收集 summary 文本用于提取优劣势
  const summaries: string[] = assessments
    .filter(a => a?.summary && typeof a.summary === 'string')
    .map(a => a.summary);

  const defaultDimNames = ["专业深度", "逻辑表达", "应变能力", "项目理解", "沟通技巧", "自我认知", "文化匹配"];
  const dimensions: InterviewDimension[] = defaultDimNames.map((name) => {
    const s = dimScores[name];
    const c = dimComments[name];
    return {
      name,
      score: s && s.length > 0 ? Math.round(s.reduce((a, b) => a + b, 0) / s.length) : Math.max(0, Math.min(100, avg + Math.round((Math.random() - 0.5) * 16))),
      comment: c && c.length > 0 ? c[c.length - 1] : "",
    };
  });

  // 根据分数生成基本描述
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  if (avg >= 70) strengths.push("整体表现尚可");
  if (avg >= 80) strengths.push("多数问题回答到位");
  const highDims = dimensions.filter(d => d.score >= 75).sort((a, b) => b.score - a.score);
  const lowDims = dimensions.filter(d => d.score < 65).sort((a, b) => a.score - b.score);
  for (const d of highDims.slice(0, 2)) strengths.push(`${d.name}表现突出`);
  for (const d of lowDims.slice(0, 2)) weaknesses.push(`${d.name}有待提升`);
  if (strengths.length === 0) strengths.push("有一定基础");
  if (weaknesses.length === 0) weaknesses.push("整体可进一步提升");

  return {
    overallScore: avg,
    grade,
    gradeNext: grade === "S" ? "保持S级水准" : `继续努力，向${nextGrade}级进发`,
    strengths,
    weaknesses,
    suggestions: ["多做模拟练习", "针对薄弱维度专项提升"],
    dimensions,
  };
}

/**
 * 生成面试总结
 * 
 * @param jd 职位描述
 * @param roundType 面试轮次类型
 * @param assessments 所有题目的评估结果数组
 * @returns 面试总结
 */
export async function summarizeInterview({
  jd,
  roundType,
  assessments,
}: {
  jd: string;
  roundType: RoundType;
  assessments: any[]; // 使用 any 因为可能是新格式（score, dimensions, summary）或旧格式
}): Promise<InterviewSummaryResult> {
  // 检查是否使用 stub 模式（显式启用 stub）
  const useStub = process.env.LLM_STUB === "1";
  
  if (useStub) {
    console.warn("使用 stub 模式生成面试总结（LLM_STUB=1）");
    return generateStubSummary();
  }

  // 验证 assessments 不为空
  if (!assessments || assessments.length === 0) {
    console.warn("assessments 为空，使用 stub 模式");
    return generateStubSummary();
  }

  try {
    // 构建 prompt
    const systemPrompt = `你是一名资深面试官。请基于候选人本轮的所有面试回答与评估，生成一份结构化的面试总结。

任务：
1. 根据"所有题目的评估结果"生成最终的整体评价
2. 输出以下结构：
   - overallScore: 0-100 的整数，综合所有题目的得分
   - grade: 能力等级，取值为 "S"(90-100) / "A"(80-89) / "B+"(75-79) / "B"(60-74) / "C"(40-59) / "D"(0-39)
   - gradeNext: 简短的进阶提示，如"再练2次可达A"、"距离B+只差一步"等
   - strengths: 数组，列出 2-4 个优势表现
   - weaknesses: 数组，列出 2-4 个薄弱环节
   - suggestions: 数组，列出 2-4 个下一步提升建议
   - dimensions: 7个维度的评分数组，每个维度包含 name、score(0-100)、comment(一句话点评)
     七个维度固定为：专业深度、逻辑表达、应变能力、项目理解、沟通技巧、自我认知、文化匹配
3. 请严格按照 JSON 返回，不要输出任何解释

输出格式要求：
- 必须是一个 JSON 对象
- overallScore 必须是 0-100 的整数
- grade 必须是 "S"/"A"/"B+"/"B"/"C"/"D" 之一
- gradeNext 必须是字符串，简短鼓励性的进阶提示
- strengths、weaknesses、suggestions 必须是字符串数组
- dimensions 必须是包含7个对象的数组，每个对象有 name(string)、score(number 0-100)、comment(string)
- 禁止输出任何其他内容，只输出 JSON`;

    // 将 assessments 转换为字符串（处理可能的复杂对象）
    const assessmentsStr = JSON.stringify(assessments, null, 2);

    const userPrompt = `【岗位 JD】
${jd}

【面试轮次】
${roundType}

【单题评估列表】
（这是各题的评估结果，请综合它们生成最终总结）

${assessmentsStr}

请基于以上信息生成面试总结，返回严格 JSON 格式：

{
  "overallScore": 85,
  "grade": "A",
  "gradeNext": "再练1次稳冲S级",
  "strengths": ["...", "..."],
  "weaknesses": ["...", "..."],
  "suggestions": ["...", "..."],
  "dimensions": [
    {"name": "专业深度", "score": 82, "comment": "..."},
    {"name": "逻辑表达", "score": 88, "comment": "..."},
    {"name": "应变能力", "score": 80, "comment": "..."},
    {"name": "项目理解", "score": 85, "comment": "..."},
    {"name": "沟通技巧", "score": 90, "comment": "..."},
    {"name": "自我认知", "score": 78, "comment": "..."},
    {"name": "文化匹配", "score": 83, "comment": "..."}
  ]
}

注意：只输出 JSON，不要有任何其他文字。`;

    // 调用 LLM（使用与 chat 相同的模型配置）
    const response = await callLLM(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      {
        model: process.env.LLM_MODEL_CHAT, // 使用与 chat 相同的模型
        temperature: 0.7,
        maxTokens: 1000,
        timeoutMs: 30000, // 30 秒超时，给 LLM 足够时间生成总结
        maxRetries: 2,
      }
    );

    // 解析 JSON 响应
    let cleaned = response.trim();
    
    // 移除可能的 markdown 代码块标记
    if (cleaned.startsWith("```json")) {
      cleaned = cleaned.replace(/^```json\n?/i, "").replace(/```\n?$/i, "");
    } else if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```\n?/i, "").replace(/```\n?$/i, "");
    }
    
    cleaned = cleaned.trim();

    // 尝试从 LLM 文本中提取 JSON
    let extracted = cleaned.match(/\{[\s\S]*\}/);
    if (!extracted) {
      throw new Error("无法从 LLM 响应中提取 JSON");
    }

    let jsonText = extracted[0];

    // --- 清洗非法字符：控制字符（0x00-0x1F except \t \n \r）
    jsonText = jsonText.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

    // --- 去除多余的逗号，比如 ["a", "b", ] 或 { "key": "value", }
    jsonText = jsonText.replace(/,\s*}/g, "}");
    jsonText = jsonText.replace(/,\s*]/g, "]");

    // --- finally parse
    let rawData;
    try {
      rawData = JSON.parse(jsonText);
    } catch (e) {
      console.error("JSON 解析失败：", jsonText);
      throw new Error("LLM 返回内容不是有效 JSON");
    }
    
    // 验证必需字段
    if (typeof rawData.overallScore !== "number" || rawData.overallScore < 0 || rawData.overallScore > 100) {
      throw new Error("LLM 返回的 overallScore 格式不正确（必须是 0-100 的数字）");
    }
    
    if (!Array.isArray(rawData.strengths) || rawData.strengths.length === 0) {
      throw new Error("LLM 返回的 strengths 格式不正确（必须是非空字符串数组）");
    }
    
    if (!Array.isArray(rawData.weaknesses) || rawData.weaknesses.length === 0) {
      throw new Error("LLM 返回的 weaknesses 格式不正确（必须是非空字符串数组）");
    }
    
    if (!Array.isArray(rawData.suggestions) || rawData.suggestions.length === 0) {
      throw new Error("LLM 返回的 suggestions 格式不正确（必须是非空字符串数组）");
    }

    // 验证数组元素都是字符串
    if (!rawData.strengths.every((s: any) => typeof s === "string")) {
      throw new Error("LLM 返回的 strengths 数组元素必须是字符串");
    }
    
    if (!rawData.weaknesses.every((s: any) => typeof s === "string")) {
      throw new Error("LLM 返回的 weaknesses 数组元素必须是字符串");
    }
    
    if (!rawData.suggestions.every((s: any) => typeof s === "string")) {
      throw new Error("LLM 返回的 suggestions 数组元素必须是字符串");
    }

    // 验证 grade（容错：如果LLM没返回，根据分数自动计算）
    const validGrades = ["S", "A", "B+", "B", "C", "D"];
    let grade = rawData.grade;
    if (!grade || !validGrades.includes(grade)) {
      const s = rawData.overallScore;
      grade = s >= 90 ? "S" : s >= 80 ? "A" : s >= 75 ? "B+" : s >= 60 ? "B" : s >= 40 ? "C" : "D";
    }

    // 验证 gradeNext（容错）
    const gradeNext = typeof rawData.gradeNext === "string" ? rawData.gradeNext : `继续加油，向${grade === "S" ? "S" : validGrades[validGrades.indexOf(grade) - 1] || "S"}级进发`;

    // 验证 dimensions（容错：缺失时生成默认值）
    const defaultDimNames = ["专业深度", "逻辑表达", "应变能力", "项目理解", "沟通技巧", "自我认知", "文化匹配"];
    let dimensions: InterviewDimension[];
    if (Array.isArray(rawData.dimensions) && rawData.dimensions.length === 7) {
      dimensions = rawData.dimensions.map((d: any, i: number) => ({
        name: typeof d.name === "string" ? d.name : defaultDimNames[i],
        score: typeof d.score === "number" && d.score >= 0 && d.score <= 100 ? Math.round(d.score) : rawData.overallScore,
        comment: typeof d.comment === "string" ? d.comment : "",
      }));
    } else {
      // LLM未正确返回dimensions，根据总分生成近似值
      const base = rawData.overallScore;
      dimensions = defaultDimNames.map((name) => ({
        name,
        score: Math.max(0, Math.min(100, base + Math.round((Math.random() - 0.5) * 16))),
        comment: "",
      }));
    }

    // 构建最终结果
    const result: InterviewSummaryResult = {
      overallScore: Math.round(rawData.overallScore),
      grade,
      gradeNext,
      strengths: rawData.strengths,
      weaknesses: rawData.weaknesses,
      suggestions: rawData.suggestions,
      dimensions,
    };

    return result;
  } catch (error: any) {
    console.error("LLM 生成面试总结失败，基于已有评估数据生成降级总结:", error?.message || error);
    
    // 基于已有评估数据动态生成总结，而非返回固定硬编码内容
    return generateFallbackSummary(assessments);
  }
}
