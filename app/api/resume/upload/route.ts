import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { withMeteredAiRoute } from "@/lib/metered-ai-route";
import { saveResumeUpload } from "@/lib/db";
import { callLLM } from "@/lib/llm";
import mammoth from "mammoth";
import { validateResumeFileSize, validateResumeFileType } from "@/lib/resume-file-validation";
import { extractPdfText } from "@/lib/pdf-text";
import { isTokenPayRecoveryError, tokenPayRecoveryResponse } from "@/lib/tokenpay-recovery";

// 使用 Node.js runtime（需要文件解析库）
export const runtime = "nodejs";

// 支持的文件类型
const ALLOWED_EXTENSIONS = [".pdf", ".doc", ".docx"];
// 解析后的简历数据结构
interface ParsedResumeData {
  summary: string;
  skills: string[];
  education: Array<{
    school: string;
    degree: string;
    time: string;
    text: string;
  }>;
  experiences: Array<{
    company: string;
    title: string;
    time: string;
    text: string;
  }>;
  projects: Array<{
    title: string;
    role: string;
    start: string;
    end: string;
    text: string;
  }>;
}

/**
 * 使用AI解析简历文本为结构化数据
 */
async function parseResumeWithAI(rawText: string): Promise<ParsedResumeData> {
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
        timeoutMs: 30000, // 30秒超时
      }
    );

    // 清理可能的 markdown 代码块标记
    const cleaned = response
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    
    // 提取 JSON 内容
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("无法找到 JSON 内容");
    }

    const parsed = JSON.parse(jsonMatch[0]) as ParsedResumeData;
    
    // 验证数据结构完整性
    if (!parsed.summary && typeof parsed.summary !== "string") {
      parsed.summary = "";
    }
    if (!Array.isArray(parsed.skills)) {
      parsed.skills = [];
    }
    if (!Array.isArray(parsed.education)) {
      parsed.education = [];
    }
    if (!Array.isArray(parsed.experiences)) {
      parsed.experiences = [];
    }
    if (!Array.isArray(parsed.projects)) {
      parsed.projects = [];
    }

    return parsed;
  } catch (error: any) {
    console.error("AI解析失败:", error);
    if (isTokenPayRecoveryError(error)) throw error;
    
    // 返回基础结构（降级策略）
    return {
      summary: "",
      skills: [],
      education: [],
      experiences: [],
      projects: [],
    };
  }
}

/**
 * 验证文件扩展名和MIME类型的匹配
 */
/**
 * POST /api/resume/upload
 * 处理简历文件上传、解析和存储
 */
async function handlePost(request: Request) {
  try {
    // 1. 用户认证检查
    const user = await getCurrentUserFromRequest();
    if (!user || !user.id) {
      return NextResponse.json(
        {
          ok: false,
          error: "未授权访问",
          code: "UNAUTHORIZED",
        },
        { status: 401 }
      );
    }

    const userId = user.id;

    // 2. 解析 FormData
    const formData = await request.formData();
    
    // 阻止客户端提交敏感密钥
    if (formData.get("apiKey") || formData.get("key") || formData.get("token")) {
      return NextResponse.json(
        {
          ok: false,
          error: "客户端不允许发送API密钥",
          code: "FORBIDDEN_KEY",
        },
        { status: 400 }
      );
    }

    // 3. 获取上传的文件
    const file = formData.get("file") as File | null;
    
    if (!file) {
      return NextResponse.json(
        {
          ok: false,
          error: "缺少文件字段",
          code: "MISSING_FILE",
        },
        { status: 400 }
      );
    }

    // 4. 验证文件扩展名和MIME类型匹配
    const filename = file.name || "";
    const mimeType = file.type || "";
    
    if (!validateResumeFileType(filename, mimeType)) {
      // 检查是扩展名问题还是MIME类型问题
      const lowerFilename = filename.toLowerCase();
      const hasValidExtension = ALLOWED_EXTENSIONS.some(ext => lowerFilename.endsWith(ext));
      
      if (!hasValidExtension) {
        return NextResponse.json(
          {
            ok: false,
            error: "仅支持PDF和Word格式文件（.pdf, .doc, .docx）",
            code: "INVALID_FILE_TYPE",
          },
          { status: 400 }
        );
      } else {
        return NextResponse.json(
          {
            ok: false,
            error: "文件类型不匹配，请确保上传的是真实的PDF或Word文件",
            code: "INVALID_MIME_TYPE",
          },
          { status: 400 }
        );
      }
    }

    // 5. 验证文件大小
    const fileSize = file.size;
    if (!validateResumeFileSize(fileSize)) {
      if (fileSize === 0) {
        return NextResponse.json(
          {
            ok: false,
            error: "文件为空，请上传有效的简历文件",
            code: "EMPTY_FILE",
          },
          { status: 400 }
        );
      }
      
      return NextResponse.json(
        {
          ok: false,
          error: "文件大小不能超过10MB",
          code: "FILE_TOO_LARGE",
        },
        { status: 400 }
      );
    }

    // 6. 获取可选的 sessionId
    const sessionId = (formData.get("sessionId") as string) || null;

    // 7. 提取文件内容
    let rawText = "";
    try {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // 根据文件类型选择解析方法
      if (filename.toLowerCase().endsWith(".pdf")) {
        // 解析 PDF
        rawText = await extractPdfText(buffer);
      } else if (filename.toLowerCase().endsWith(".docx")) {
        // 解析 DOCX
        const result = await mammoth.extractRawText({ buffer });
        rawText = result.value;
      } else if (filename.toLowerCase().endsWith(".doc")) {
        // 解析 DOC（mammoth 也支持 .doc 格式）
        const result = await mammoth.extractRawText({ buffer });
        rawText = result.value;
      }

      // 检查提取的文本是否为空
      if (!rawText || rawText.trim().length === 0) {
        return NextResponse.json(
          {
            ok: false,
            error: "文件内容为空或无法提取文本，请确保文件包含可读文本",
            code: "EMPTY_CONTENT",
          },
          { status: 400 }
        );
      }

      console.log(`成功提取文本，长度: ${rawText.length} 字符`);
    } catch (parseError: any) {
      console.error("文件解析失败:", parseError);
      
      // 根据错误类型返回不同的错误信息
      if (parseError.message?.includes("Invalid PDF")) {
        return NextResponse.json(
          {
            ok: false,
            error: "PDF文件格式无效或已损坏",
            code: "INVALID_PDF",
          },
          { status: 400 }
        );
      }
      
      return NextResponse.json(
        {
          ok: false,
          error: "文件解析失败，请确保文件格式正确且未损坏",
          code: "PARSE_ERROR",
          message: process.env.NODE_ENV === "development" ? parseError.message : undefined,
        },
        { status: 400 }
      );
    }

    // 8. 使用AI解析简历内容
    console.log("开始AI解析...");
    const parsed = await parseResumeWithAI(rawText);
    console.log("AI解析完成");

    // 9. 保存到数据库
    let resumeId: string;
    try {
      console.log("开始保存到数据库...");
      resumeId = await saveResumeUpload({
        userId,
        sessionId,
        filename,
        parsed,
        rawText,
        storageUrl: null, // 暂时不实现文件存储
      });
      console.log(`数据库保存成功，resumeId: ${resumeId}`);
    } catch (dbError: any) {
      console.error("数据库保存失败:", dbError);
      return NextResponse.json(
        {
          ok: false,
          error: "保存简历数据失败",
          code: "DATABASE_ERROR",
          message: process.env.NODE_ENV === "development" ? dbError.message : undefined,
        },
        { status: 500 }
      );
    }
    
    // 返回成功响应
    return NextResponse.json({
      ok: true,
      resumeId,
      parsed,
      rawText: rawText.substring(0, 200) + "...", // 只返回前200字符
      storageUrl: null,
      filename,
      fileSize,
    });

  } catch (error: any) {
    console.error("简历上传失败:", error);
    const recovery = tokenPayRecoveryResponse(error);
    if (recovery) return recovery;
    return NextResponse.json(
      {
        ok: false,
        error: "服务器内部错误",
        code: "INTERNAL_ERROR",
        message: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}

export const POST = withMeteredAiRoute(handlePost, { operation: "resume_upload_parse", quotaType: "resume" });
