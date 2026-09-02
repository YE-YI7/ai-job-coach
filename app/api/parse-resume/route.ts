import { NextResponse } from "next/server";
import { callLLM } from "@/lib/llm";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { withMeteredAiRoute } from "@/lib/metered-ai-route";
import { extractPdfText } from "@/lib/pdf-text";
import { isTokenPayRecoveryError, tokenPayRecoveryResponse } from "@/lib/tokenpay-recovery";

// 必须使用 Node.js runtime（因为需要文件解析库）
export const runtime = "nodejs";

/**
 * 解析简历
 * 支持两种方式：
 * 1. FormData: 上传PDF文件解析
 * 2. JSON: 从对话消息中提取简历信息
 */
async function handlePost(request: Request) {
  try {
    if (!(await getCurrentUserFromRequest())) {
      return NextResponse.json({ ok: false, error: "未授权访问" }, { status: 401 });
    }
    const contentType = request.headers.get("content-type") || "";
    
    // 判断请求类型：FormData 或 JSON
    if (contentType.includes("application/json")) {
      // JSON 请求：从对话消息中提取简历信息
      return await handleJsonRequest(request);
    } else if (contentType.includes("multipart/form-data")) {
      // FormData 请求：文件上传
      return await handleFileUpload(request);
    } else {
      return NextResponse.json(
        { ok: false, error: "不支持的Content-Type，请使用application/json或multipart/form-data" },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error("解析简历失败:", error);
    const recovery = tokenPayRecoveryResponse(error);
    if (recovery) return recovery;
    return NextResponse.json(
      {
        ok: false,
        error: "服务器内部错误",
        message: error.message,
      },
      { status: 500 }
    );
  }
}

/**
 * 处理JSON请求：从对话消息中提取简历信息
 */
async function handleJsonRequest(request: Request) {
  try {
    const body = await request.json();
    const { messages } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { ok: false, error: "缺少messages字段或消息为空" },
        { status: 400 }
      );
    }

    // 从对话历史中提取简历相关信息
    const extractPrompt = `请从以下对话历史中提取简历相关信息，并按照以下格式返回：

{
  "personalInfo": "个人信息（姓名、联系方式等）",
  "education": "教育信息",
  "campusExperience": "在校经历",
  "projects": "项目经历",
  "workExperience": "工作/实习经历",
  "selfEvaluation": "个人评价/自我介绍"
}

要求：
1. 只返回JSON格式，不要包含其他文字或markdown标记
2. 如果某个字段没有信息，返回空字符串 ""
3. 尽量从对话中提取完整信息
4. 保持信息的原始表述

对话历史：
${messages.map((msg: any, idx: number) => `[${idx + 1}] ${msg.role}: ${msg.content}`).join("\n\n")}

请返回JSON格式：`;

    const response = await callLLM(
      [
        {
          role: "system",
          content: "你是一个专业的信息提取助手，只返回有效的JSON格式，不包含任何其他文字、注释或markdown代码块标记。",
        },
        { role: "user", content: extractPrompt },
      ],
      {
        temperature: 0.3,
        maxTokens: 2000,
        provider: "deepseek",
      }
    );

    // 解析JSON响应
    let parsed: any = {
      personalInfo: "",
      education: "",
      campusExperience: "",
      projects: "",
      workExperience: "",
      selfEvaluation: "",
    };

    try {
      const cleaned = response
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = { ...parsed, ...JSON.parse(jsonMatch[0]) };
      }
    } catch (parseError) {
      console.error("JSON解析失败:", parseError);
      // 返回空结构
    }

    return NextResponse.json(parsed);
  } catch (error: any) {
    console.error("处理JSON请求失败:", error);
    if (isTokenPayRecoveryError(error)) throw error;
    return NextResponse.json(
      {
        ok: false,
        error: "提取简历信息失败",
        message: error.message,
      },
      { status: 500 }
    );
  }
}

export const POST = withMeteredAiRoute(handlePost, { operation: "resume_parse", quotaType: "resume" });

/**
 * 处理文件上传请求：解析PDF文件
 */
async function handleFileUpload(request: Request) {
  try {
    const formData = await request.formData();
    
    // 阻止前端提交 key
    if (formData.get("apiKey") || formData.get("key") || formData.get("token")) {
      return NextResponse.json(
        { ok: false, error: "Client is not allowed to send LLM keys." },
        { status: 400 }
      );
    }

    // 从 formData 读取 file 字段
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { ok: false, error: "缺少文件字段 file" },
        { status: 400 }
      );
    }

    // 检查文件类型（只支持 PDF）
    const filename = file.name?.toLowerCase() || "";
    const ext = filename.split(".").pop() || "";
    
    if (ext !== "pdf") {
      return NextResponse.json(
        { ok: false, error: "只支持 PDF 文件格式" },
        { status: 400 }
      );
    }

    // 把 Blob 转成 Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 调用 pdf-parse 解析 PDF
    let rawText = "";
    try {
      rawText = await extractPdfText(buffer);
    } catch (error: any) {
      console.error("PDF 解析失败:", error);
      if (error.code === "MODULE_NOT_FOUND") {
        return NextResponse.json(
          {
            ok: false,
            error: "PDF 解析功能需要安装 pdf-parse 依赖",
            message: "请运行: npm install pdf-parse",
          },
          { status: 503 }
        );
      }
      return NextResponse.json(
        { ok: false, error: "PDF 文件解析失败，请确保文件格式正确" },
        { status: 400 }
      );
    }

    if (!rawText || rawText.trim().length === 0) {
      return NextResponse.json(
        { ok: false, error: "文件内容为空或无法提取文本" },
        { status: 400 }
      );
    }

    // 构建解析提示词
    const parsePrompt = `你是一个专业的简历解析助手。请仔细阅读以下简历文本内容，提取所有信息，并严格按照以下 JSON 格式返回：

{
  "summary": "个人简介/自我评价（简要总结）",
  "skills": ["技能1", "技能2", "技能3"],
  "education": [
    {
      "school": "学校名称",
      "degree": "学历（本科/硕士/博士）",
      "time": "时间（如：2018-2022）",
      "text": "详细描述（专业、成绩等）"
    }
  ],
  "experiences": [
    {
      "company": "公司名称",
      "title": "职位名称",
      "time": "时间（如：2020-2023）",
      "text": "工作描述（职责、成果等）"
    }
  ],
  "projects": [
    {
      "title": "项目名称",
      "role": "角色（如：负责人/参与）",
      "start": "开始时间（如：2023-01）",
      "end": "结束时间（如：2023-12 或 至今）",
      "text": "项目描述（背景、技术栈、成果等）"
    }
  ]
}

要求：
1. 只返回 JSON，不要包含其他文字或 markdown 代码块标记
2. 如果某个字段没有信息，返回空数组 [] 或空字符串 ""
3. 尽量提取完整的信息
4. summary 字段要简洁（50-100字）

简历文本内容：
${rawText}

请返回 JSON 格式：`;

    // 调用 callLLM 生成解析结构
    let parsed: any = {};
    
    try {
      const response = await callLLM(
        [
          {
            role: "system",
            content: "你是一个专业的 JSON 数据提取助手，只返回有效的 JSON 格式，不包含任何其他文字、注释或 markdown 代码块标记。严格按照用户要求的格式返回。",
          },
          { role: "user", content: parsePrompt },
        ],
        {
          temperature: 0.3,
          maxTokens: 4000,
          provider: "deepseek",
        }
      );

      // 解析 JSON 响应
      try {
        // 清理可能的 markdown 代码块标记
        const cleaned = response
          .replace(new RegExp("```json\\n?", "g"), "")
          .replace(new RegExp("```\\n?", "g"), "")
          .trim();
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error("无法找到 JSON 内容");
        }
      } catch (parseError) {
        console.error("JSON 解析失败:", parseError);
        // JSON 解析失败时，返回基础结构
        parsed = {
          summary: "",
          skills: [],
          education: [],
          experiences: [],
          projects: [],
        };
      }
    } catch (llmError: any) {
      console.error("LLM 调用失败:", llmError);
      if (isTokenPayRecoveryError(llmError)) throw llmError;
      // LLM 调用失败时，返回基础结构
      parsed = {
        summary: "",
        skills: [],
        education: [],
        experiences: [],
        projects: [],
      };
    }

    // 返回 JSON：{ ok: true, rawText, parsed }
    return NextResponse.json({
      ok: true,
      rawText: rawText,
      parsed: parsed,
    });
  } catch (error: any) {
    console.error("处理文件上传失败:", error);
    if (isTokenPayRecoveryError(error)) throw error;
    return NextResponse.json(
      {
        ok: false,
        error: "文件解析失败",
        message: error.message,
      },
      { status: 500 }
    );
  }
}
