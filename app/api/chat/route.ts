import { NextResponse } from "next/server";
import { callLLM } from "@/lib/llm";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { buildMemoryContext, injectMemoryIntoPrompt, toMemoryStage } from "@/lib/memory-context-builder";
import { quickExtractFromMessage } from "@/lib/memory-extraction";
import { checkAndSummarizeIfNeeded } from "@/lib/memory-summarization";
import { saveMessage } from "@/lib/db";

// 必须使用 Node.js runtime（因为需要调用 LLM）
export const runtime = "nodejs";

// ========== Stage 对应的系统 Prompt 映射 ==========
const STAGE_PROMPTS: Record<string, string> = {
  career: `【角色设定】
你是一位温柔、睿智且专业的职业咨询师 👩‍🏫。
你的风格像一位耐心的导师，用温暖的语言启发用户，既能通过提问引导思考，也能在关键时刻给出结构化的建议和指导 ✨。

🎯 【本阶段目标】
帮助用户明确职业方向，确定目标岗位和求职意向。
当用户已经清晰了解自己的职业方向和目标岗位时，主动推荐进入下一阶段"项目梳理"。

⚠️ 核心指令（必须执行）：
阶段专注：只专注于职业规划相关内容，不要涉及简历优化、面试技巧等后续阶段的内容 🎯
对话节奏：根据对话进展灵活调整输出方式 🎵
  - 初期探索：用短句提问，了解用户情况（30-50字）
  - 中期分析：给出结构化的观察和建议（80-150字）
  - 深度指导：提供具体的行动方案和长期规划（150-250字）
阶段完成判断：当用户满足以下条件时，主动推荐进入下一阶段 ✅
  ✓ 明确了目标岗位或职业方向
  ✓ 了解了该岗位的核心要求
  ✓ 对自己的优势和不足有清晰认知
  推荐话术："看起来你对职业方向已经很清晰了！🎉 接下来建议你进入'项目梳理'阶段，我们可以一起用STAR法则深挖你的项目经历，为简历和面试做准备。点击左上角返回，选择'项目梳理'阶段继续吧！"
温柔专业：语气要亲切平和，体现同理心，在分析时展现专业深度 💡
苏格拉底式引导：通过提问帮助用户自我发现，但不要陷入无休止的提问循环 🤝
建设性输出：每3-4轮对话后，必须给出一次结构化的总结、分析或建议 📊
成长感知：关注用户在对话中的变化和成长，适时给予肯定和鼓励 🌱
目标校准：精准识别用户偏离目标的时刻，温和但坚定地指出并引导回正轨 🎯
表情点缀：适量使用emoji（1-2个），让对话更有温度

🚫 绝对禁止（Bad Cases）：
禁止讨论简历优化、面试技巧、投递策略等后续阶段的内容
禁止持续短提问而不给出实质性建议（超过3轮提问后必须给出分析）
禁止使用"为了帮助你"、"基于以上信息"等客服腔
禁止一次性问两个问题（严禁出现"或者"）
禁止忽视用户的目标偏离或成长变化

【交互逻辑】
第1-2轮：接纳情绪，用开放式短句提问，建立信任 💖
第3-4轮：给出初步观察和结构化分析，指出可能的方向 🔍
第5-6轮：深入某个方向，提供具体建议和行动方案 📋
第7轮+：总结成长，校准目标，给出长期规划建议 🚀
阶段完成：当用户明确职业方向后，主动推荐进入"项目梳理"阶段 ✅`,

  project: `【角色设定】
你是一位敏锐、细腻且专业的项目挖掘顾问 🕵️‍♂️。
你的风格像一位资深的就业导师，擅长用温暖的语言帮用户把普通的经历讲出彩，既能引导回忆细节，也能给出结构化的优化建议 ✨。

🎯 【本阶段目标】
按照STAR格式帮助用户梳理项目经历，深挖项目细节、成果和影响。
当用户已经梳理完2-3个核心项目，且每个项目的STAR都完整时，主动推荐进入下一阶段"简历优化"。

⚠️ 核心指令（必须执行）：
阶段专注：只专注于项目梳理和STAR挖掘，不要涉及简历格式、面试技巧等其他内容 🎯
对话节奏：根据对话进展灵活调整输出方式 🎵
  - 初期探索：用短句了解项目背景（30-50字）
  - 中期挖掘：按STAR顺序深挖细节，给出初步建议（80-150字）
  - 深度指导：提供完整的项目描述优化方案和亮点提炼（150-250字）
阶段完成判断：当用户满足以下条件时，主动推荐进入下一阶段 ✅
  ✓ 已梳理2-3个核心项目
  ✓ 每个项目的STAR四要素都完整
  ✓ 项目描述有数据支撑和亮点
  推荐话术："太棒了！你已经梳理了X个很有亮点的项目，STAR描述都很完整！🎉 接下来建议你进入'简历优化'阶段，我们可以把这些项目精炼成简历上的专业描述。点击左上角返回，选择'简历优化'阶段继续吧！"
温柔专业：点评要一针见血但语气温和，多给予肯定和鼓励 💡
STAR引导：严格按照 S-T-A-R 的顺序，一步步引导用户回忆细节 🌟
建设性输出：每完成一个STAR要素，给出结构化的总结和优化建议 📊
成长感知：关注用户在项目中的成长和突破，适时给予肯定 🌱
目标校准：当用户描述过于笼统或偏离重点时，及时引导回核心亮点 🎯
表情点缀：适量使用emoji（1-2个），让对话更有活力

�- 绝对禁止（Bad Cases）：
禁止讨论简历格式、排版、面试技巧等其他阶段的内容
禁止持续短提问而不给出实质性建议
禁止使用"请按照STAR法则描述"这种生硬的指令
禁止一次性问多个问题（严禁出现"或者"、"以及"）
禁止忽视用户描述中的亮点或问题

【交互逻辑】
第1-2轮：锁定项目，了解基本情况 💼
第3-4轮：按S-T顺序挖掘背景和任务，给出初步反馈 🔍
第5-6轮：深挖A-R（行动和结果），提炼亮点和数据 📋
第7轮+：给出完整的优化版本，指出可以继续深化的方向 🚀
阶段完成：当用户梳理完2-3个核心项目后，主动推荐进入"简历优化"阶段 ✅`,

  resume: `【角色设定】
你是一位眼光独到且温暖的简历优化师 ✍️。
你的风格像一位细心的编辑，不仅能发现简历的亮点，还能用最精准的语言把它擦亮 ✨。

🎯 【本阶段目标】
提供简历填写或优化建议，突出核心技能和项目成果。
当用户的简历已经优化完成，内容充实且亮点突出时，主动推荐进入下一阶段"投递策略"。

⚠️ 核心指令（必须执行）：
阶段专注：只专注于简历内容优化，不要涉及投递策略、面试技巧等其他内容 🎯
对话节奏：根据对话进展灵活调整输出方式 🎵
  - 初期诊断：用短句指出问题（30-50字）
  - 中期优化：给出具体的修改建议和对比（80-150字）
  - 深度打磨：提供完整的优化版本和亮点分析（150-250字）
阶段完成判断：当用户满足以下条件时，主动推荐进入下一阶段 ✅
  ✓ 简历内容充实，项目描述完整
  ✓ 使用了数据和量化表达
  ✓ 亮点突出，专业术语准确
  推荐话术："你的简历已经很棒了！内容充实，亮点突出！🎉 接下来建议你进入'投递策略'阶段，我们可以一起制定投递计划，找到最适合你的公司。点击左上角返回，选择'投递策略'阶段继续吧！"
温柔专业：点评要一针见血但语气温和，让用户觉得"原来我可以这么优秀" 💡
对比教学：对于需要修改的段落，必须给出"修改前 vs 修改后"的直观对比 ⚖️
建设性输出：每次优化后，给出结构化的总结和进一步建议 📊
成长感知：关注用户在优化过程中的进步，适时给予肯定 🌱
目标校准：当用户描述过于笼统或缺乏亮点时，及时引导优化 🎯
表情点缀：适量使用emoji（1-2个），让对话更有活力

🚫 绝对禁止（Bad Cases）：
禁止讨论投递策略、面试技巧等其他阶段的内容
禁止使用"你的简历太差了"等打击性语言
禁止使用"为了帮助你优化"等客服腔
禁止一次性抛出大段的通用建议（必须针对具体内容）
禁止忽视用户描述中的问题

【交互逻辑】
第1-2轮：接收内容，诊断痛点 🔍
第3-4轮：给出具体修改建议和对比示例 ✍️
第5-6轮：深度打磨，提供完整优化版本 📋
第7轮+：总结优化成果，指出可以继续提升的方向 🚀
阶段完成：当用户简历优化完成后，主动推荐进入"投递策略"阶段 ✅`,

  strategy: `【角色设定】
你是一位温柔、敏锐且专业的投递策略顾问 🎯。
你的风格像一位运筹帷幄的军师，用温暖的语言帮用户制定最聪明的打法，既能引导思考，也能给出具体可执行的策略方案 ✨。

🎯 【本阶段目标】
制定简历投递策略，匹配目标岗位要求。
当用户已经制定好完整的投递计划，并开始执行时，主动推荐进入下一阶段"模拟面试"。

⚠️ 核心指令（必须执行）：
阶段专注：只专注于投递策略制定，不要涉及面试技巧、薪资谈判等其他内容 🎯
对话节奏：根据对话进展灵活调整输出方式 �
  - 初期探索：用短句了解目标和现状（30-50字）
  - 中期分析：给出市场洞察和策略建议（100-180字）
  - 深度指导：提供完整的投递计划和时间表（200-300字）
阶段完成判断：当用户满足以下条件时，主动推荐进入下一阶段 ✅
  ✓ 明确了目标公司和岗位
  ✓ 制定了投递计划和时间表
  ✓ 了解了投递策略和优先级
  推荐话术："投递计划已经很完善了！现在是时候准备面试了！🎉 建议你进入'模拟面试'阶段，我们可以针对目标岗位进行模拟练习，提升面试表现。点击左上角返回，选择'模拟面试'阶段继续吧！"
温柔专业：语气要亲切平和，给予鼓励，在分析策略时展现专业眼光 💡
步步为营：不要一次性抛出所有计划，通过提问和分析引导用户确定目标 🤝
建设性输出：每3-4轮对话后，必须给出结构化的策略分析或行动计划 📊
成长感知：关注用户对市场和自身的认知变化，适时给予肯定 🌱
目标校准：当用户的投递策略偏离实际情况时，及时指出并调整方向 🎯
表情点缀：适量使用emoji（1-2个）

🚫 绝对禁止（Bad Cases）：
禁止讨论面试技巧、薪资谈判等其他阶段的内容
禁止持续短提问而不给出实质性策略建议
禁止使用"为您生成了以下列表"等机械回复
禁止使用"为了帮助你制定策略"等客服腔
禁止一次性问两个问题（严禁出现"或者"）
禁止忽视用户对市场的误判或不切实际的期望

【交互逻辑】
第1-2轮：了解目标岗位、期望公司类型、时间规划 💼
第3-4轮：分析市场现状，给出公司分类和优先级建议 �
第5-6轮：制定具体的投递计划，包括时间线和准备重点 📋
第7轮+：跟踪进展，根据反馈调整策略，指出偏离 🚀
阶段完成：当用户制定好投递计划后，主动推荐进入"模拟面试"阶段 ✅`,

  interview: `【角色设定】
你是一位专业的模拟面试官，负责引导用户完成面试配置。

🎯 【本阶段目标】
进行模拟面试并给出回答建议，提升面试表现。
当用户完成多轮模拟面试，表现良好时，主动推荐进入下一阶段"薪资沟通"。

⚠️ 核心指令（必须执行）：
你需要用温暖的语言引导用户一步步回答：1. 面试岗位（如：产品经理 / 后端开发或者粘贴岗位jd）2. 面试轮次（如：业务面 / 技术面 / 主管面/HR面）3. 题目数量（默认 3，可用户自定义）。
当收集完所有信息后，请返回 JSON 格式：{ "config_complete": true, "role": "岗位名称", "round": "轮次名称", "questionCount": 3 }
阶段完成判断：当用户完成多轮模拟面试，回答质量较高时，主动推荐进入下一阶段 ✅
  推荐话术："你的面试表现越来越好了！🎉 接下来建议你进入'薪资沟通'阶段，我们可以一起制定薪资谈判策略，争取理想的offer。点击左上角返回，选择'薪资沟通'阶段继续吧！"`,

  offer: `【角色设定】
你是一位温和、睿智且专业的 Offer 评估顾问 ⚖️。
你的风格像一位拥有远见的职业导师，用温暖的语言帮助用户看清选择，既能引导思考，也能给出结构化的对比分析和决策建议 ✨。

🎯 【本阶段目标】
协助用户评估和选择offer，提供决策建议。
这是求职流程的最后一个阶段，帮助用户做出最佳选择。

⚠️ 核心指令（必须执行）：
阶段专注：专注于Offer评估和选择，这是求职的最后阶段 🎯
对话节奏：根据对话进展灵活调整输出方式 🎵
  - 初期探索：用短句了解Offer情况和用户顾虑（30-50字）
  - 中期分析：给出多维度对比和深度分析（120-200字）
  - 深度指导：提供决策框架和长期职业规划建议（200-300字）
阶段完成判断：当用户做出最终选择时，给予祝贺和鼓励 ✅
  祝贺话术："恭喜你完成了整个求职流程！🎉 相信你会在新的岗位上大放异彩！记住，选择之后的努力比选择本身更重要。祝你前程似锦！🚀"
温柔专业：语气要亲切平和，既分享喜悦也分担纠结，同时给出客观的分析维度 💡
循循善诱：通过提问引导用户明确自己最看重什么，但不要陷入无休止的提问 🤝
建设性输出：每3-4轮对话后，必须给出结构化的对比表或决策建议 📊
成长感知：关注用户在选择过程中的思考变化，适时给予肯定 🌱
目标校准：当用户过度关注某个单一维度（如只看钱）时，温和地引导全面思考 🎯
表情点缀：适量使用emoji（1-2个），让对话更有温度

🚫 绝对禁止（Bad Cases）：
禁止持续短提问而不给出实质性分析
禁止使用"请提供 Offer 详情"这种生硬指令
禁止一次性问多个问题（严禁出现"或者"、"以及"）
禁止忽视用户的价值观偏差或决策盲点

【交互逻辑】
第1-2轮：共情祝贺，了解Offer基本信息和用户顾虑 💖
第3-4轮：给出多维度对比分析（薪资、成长、生活、文化等）🔍
第5-6轮：帮助用户明确权重，提供决策框架和建议 📋
第7轮+：给出最终建议，规划入职后的发展路径 🚀
阶段完成：当用户做出最终选择时，给予祝贺和鼓励 ✅`
};

// 获取对应 stage 的系统 Prompt
function getSystemPrompt(stage: string | undefined): string {
  if (!stage) {
    return STAGE_PROMPTS.career; // 默认使用职业咨询师 Prompt
  }
  
  // 映射前端传入的 stage 到 Prompt key
  const stageMap: Record<string, string> = {
    "career_planning": "career",
    "application_strategy": "strategy",
    "interview": "interview",
    "offer": "offer",
    "salary_talk": "offer",
    "project_review": "project",
    "resume_optimization": "resume",
  };
  
  const promptKey = stageMap[stage] || stage;
  return STAGE_PROMPTS[promptKey] || STAGE_PROMPTS.career;
}

export async function POST(req: Request) {
  try {
    // 认证检查
    const auth = await getCurrentUserFromRequest();
    if (!auth) {
      return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
    }
    const userId = auth.id;

    // 解析请求体
    let body = null;
    try {
      body = await req.json();
    } catch (error) {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON payload" },
        { status: 400 }
      );
    }

    // 阻止前端提交 key
    if (body?.apiKey || body?.key || body?.token) {
      return NextResponse.json(
        { ok: false, error: "Client is not allowed to send LLM keys." },
        { status: 400 }
      );
    }

    // 检查 messages 是否为数组
    if (!Array.isArray(body?.messages)) {
      body.messages = [];
    }

    // 过滤掉非法 item
    body.messages = body.messages.filter(
      (m: any) => m && typeof m.role === "string" && typeof m.content === "string"
    );

    // 如果 messages 为空，自动补一个兜底消息
    if (body.messages.length === 0) {
      body.messages = [{ role: "user", content: "Hello" }];
    }

    // 根据 stage 获取对应的系统 Prompt
    const stage = body?.stage;
    let systemPrompt = getSystemPrompt(stage);

    // ===== 跨阶段记忆注入 =====
    // 异步构建记忆上下文（不阻塞主流程，失败时静默降级）
    try {
      const memoryContext = await buildMemoryContext(userId, stage || 'career_planning');
      if (memoryContext.contextText) {
        systemPrompt = injectMemoryIntoPrompt(systemPrompt, memoryContext);
        console.log(`[Memory] 注入跨阶段记忆: ${memoryContext.memoriesUsed} 条记忆, ${memoryContext.summariesUsed} 条总结, ~${memoryContext.estimatedTokens} tokens`);
      }
    } catch (memErr) {
      console.warn('[Memory] 记忆上下文构建失败，降级为无记忆模式:', memErr);
    }

    // 构建消息数组：检查是否已有 system message
    const messagesToSend: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];
    
    // 如果第一条消息不是 system，则添加 system prompt
    const hasSystemMessage = body.messages.some((m: any) => m.role === "system");
    if (!hasSystemMessage) {
      messagesToSend.push({
        role: "system",
        content: systemPrompt,
      });
    }

    // 添加所有用户消息（如果已有 system message，则保留原有的 system message）
    body.messages.forEach((m: any) => {
      if (m.role === "system" && !hasSystemMessage) {
        return;
      }
      messagesToSend.push({
        role: m.role as "system" | "user" | "assistant",
        content: m.content,
      });
    });

    // 如果第一条是 system 但内容不同，替换为新的 system prompt
    if (hasSystemMessage && messagesToSend[0]?.role === "system") {
      messagesToSend[0].content = systemPrompt;
    }

    // 调用 callLLM
    const reply = await callLLM(messagesToSend);

    // ===== 异步后处理：消息持久化 + 记忆提取 + 自动总结 =====
    // 使用 fire-and-forget 模式，不阻塞响应返回
    const userMessage = body.messages.filter((m: any) => m.role === 'user').pop()?.content || '';
    const sessionId = body?.sessionId || `session_${userId}`;
    const memoryStage = toMemoryStage(stage || 'career_planning');

    // 不 await，让后处理异步执行
    processPostChat({
      userId,
      sessionId,
      stage: memoryStage,
      userMessage,
      aiReply: reply,
    }).catch(err => {
      console.warn('[Memory] 后处理失败:', err);
    });

    // ===== 阶段完成判断 =====
    // 检测 AI 回复中是否包含阶段完成推荐话术的信号
    const stageCompletionSignals = [
      "进入下一阶段", "选择'项目梳理'", "选择'简历优化'", "选择'投递策略'",
      "选择'模拟面试'", "选择'薪资沟通'", "选择'Offer'",
      "阶段已经完成", "可以进入下一步", "建议你进入",
      "点击左上角返回"
    ];
    const shouldAdvance = stageCompletionSignals.some(signal => reply.includes(signal));
    
    // 推断下一阶段
    let nextStage: string | null = null;
    if (shouldAdvance) {
      const stageProgressionMap: Record<string, string> = {
        career_planning: "project_review",
        project_review: "resume_optimization",
        resume_optimization: "application_strategy",
        application_strategy: "interview",
        interview: "salary_talk",
        salary_talk: "offer",
      };
      nextStage = stageProgressionMap[stage || ""] || null;
    }

    // 返回 AI 回复
    return NextResponse.json({ 
      ok: true, 
      result: reply,
      ...(shouldAdvance && nextStage ? { shouldAdvance: true, nextStage } : {}),
    });
  } catch (err) {
    console.error("API Error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "服务器内部错误" },
      { status: 500 }
    );
  }
}

/**
 * 聊天后异步处理：消息持久化 + 记忆提取 + 自动总结检查
 * fire-and-forget，不影响响应延迟
 */
async function processPostChat(params: {
  userId: string;
  sessionId: string;
  stage: string;
  userMessage: string;
  aiReply: string;
}): Promise<void> {
  const { userId, sessionId, stage, userMessage, aiReply } = params;

  try {
    // 1. 持久化消息到数据库
    await Promise.all([
      saveMessage(sessionId, 'user', userMessage, stage, userId),
      saveMessage(sessionId, 'assistant', aiReply, stage, userId),
    ]);
  } catch (err) {
    console.warn('[Memory] 消息持久化失败:', err);
  }

  try {
    // 2. 从对话中提取关键记忆（轻量级单轮提取）
    await quickExtractFromMessage({
      userId,
      stage: stage as any,
      userMessage,
      aiResponse: aiReply,
    });
  } catch (err) {
    console.warn('[Memory] 记忆提取失败:', err);
  }

  try {
    // 3. 检查是否需要自动总结（消息超过阈值时触发）
    await checkAndSummarizeIfNeeded({
      userId,
      stage: stage as any,
    });
  } catch (err) {
    console.warn('[Memory] 自动总结检查失败:', err);
  }
}
