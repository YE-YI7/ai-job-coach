import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { NextResponse } from "next/server";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { callLLM } from "@/lib/llm";
import { buildAgentKnowledgeContext } from "@/lib/knowledge/context";
import { finalizeQuota, reserveQuota, type QuotaReservation } from "@/lib/quota";
import type { EvidenceStrength, OpportunityRecommendation } from "@/lib/opportunities/types";

export const runtime = "nodejs";

const strengths = new Set<EvidenceStrength>(["strong", "weak", "missing", "unverified"]);
const recommendations = new Set<OpportunityRecommendation>(["apply", "prepare_then_apply", "skip"]);
const MAX_SOURCE_LENGTH = 30_000;
const MAX_REMOTE_BYTES = 1_500_000;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" ? value as UnknownRecord : {};
}

function parseJson(text: string) {
  const cleaned = text.replace(/```json\s*/g, "").replace(/```/g, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("AI 未返回可解析的 JSON");
  return JSON.parse(match[0]);
}

function isBlockedIp(address: string) {
  const normalized = address.toLowerCase();
  if (normalized === "::" || normalized === "::1") return true;
  if (/^(fc|fd|fe8|fe9|fea|feb)/.test(normalized)) return true;
  if (normalized.startsWith("::ffff:")) return isBlockedIp(normalized.slice(7));
  if (isIP(normalized) !== 4) return false;
  const [a, b] = normalized.split(".").map(Number);
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || a >= 224;
}

async function assertPublicHttpUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("只支持公开的 http/https 岗位链接");
  if (url.port && !["80", "443"].includes(url.port)) throw new Error("岗位链接使用了不支持的端口");
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".local")) throw new Error("不能读取本地地址");
  const addresses = isIP(hostname) ? [{ address: hostname }] : await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => isBlockedIp(entry.address))) throw new Error("不能读取内网地址");
  return url;
}

async function readLimitedBody(response: Response) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let output = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_REMOTE_BYTES) {
      await reader.cancel();
      throw new Error("这个页面内容太大，请直接粘贴 JD");
    }
    output += decoder.decode(value, { stream: true });
  }
  return output + decoder.decode();
}

function readableTextFromHtml(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchPublicPage(rawUrl: string) {
  let current = await assertPublicHttpUrl(rawUrl);
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9_000);
    try {
      const response = await fetch(current, {
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": "YiZhiJobCoach/1.0 (+https://ai-job-coach.xin)" },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || redirect === 3) throw new Error("岗位链接重定向过多");
        current = await assertPublicHttpUrl(new URL(location, current).toString());
        continue;
      }
      if (!response.ok) throw new Error(`岗位页面暂时无法读取（${response.status}）`);
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("text/html") && !contentType.includes("text/plain")) throw new Error("这个链接不是可读取的网页，请粘贴 JD");
      const text = await readLimitedBody(response);
      const readable = contentType.includes("text/html") ? readableTextFromHtml(text) : text.trim();
      if (readable.length < 80) throw new Error("页面没有读到完整 JD，请直接粘贴内容");
      return { text: readable.slice(0, MAX_SOURCE_LENGTH), finalUrl: current.toString() };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("岗位链接暂时无法读取");
}

async function extractFileText(file: File) {
  if (file.size > MAX_FILE_BYTES) throw new Error("文件不能超过 10MB");
  const filename = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());
  if (filename.endsWith(".pdf")) return (await pdfParse(buffer)).text;
  if (filename.endsWith(".docx")) return (await mammoth.extractRawText({ buffer })).value;
  if (filename.endsWith(".txt") || filename.endsWith(".md")) return buffer.toString("utf8");
  throw new Error("支持 PDF、DOCX、TXT 或 Markdown 文件");
}

async function readIntake(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  let sourceText = "";
  let sourceLabel = "粘贴内容";
  let requestId = "";
  let structured = { company: "", role: "", location: "", jdText: "", resumeText: "" };

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    requestId = String(form.get("requestId") || "").trim();
    const file = form.get("file");
    sourceText = String(form.get("sourceText") || "").trim();
    if (file instanceof File && file.size > 0) {
      const fileText = (await extractFileText(file)).trim();
      if (!fileText) throw new Error("文件里没有读到可用文字");
      sourceText = [sourceText, fileText].filter(Boolean).join("\n\n");
      sourceLabel = `文件导入 · ${file.name.slice(0, 80)}`;
    }
  } else {
    const body = await request.json();
    requestId = String(body.requestId || "").trim();
    sourceText = String(body.sourceText || "").trim();
    structured = {
      company: String(body.company || "").trim(),
      role: String(body.role || "").trim(),
      location: String(body.location || "").trim(),
      jdText: String(body.jdText || "").trim(),
      resumeText: String(body.resumeText || "").trim(),
    };
  }

  if (structured.company && structured.role && structured.jdText) return { ...structured, requestId, sourceLabel: "网页填写" };
  if (!sourceText) throw new Error("请粘贴岗位、简历或求职目标，或选择一份文件");

  if (/^https?:\/\/\S+$/i.test(sourceText.trim())) {
    const page = await fetchPublicPage(sourceText.trim());
    sourceText = `来源链接：${page.finalUrl}\n\n${page.text}`;
    sourceLabel = "岗位链接导入";
  }
  return { ...structured, requestId, jdText: sourceText.slice(0, MAX_SOURCE_LENGTH), sourceLabel };
}

export async function POST(request: Request) {
  const user = await getCurrentUserFromRequest();
  if (!user) return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });

  let reservation: QuotaReservation | null = null;
  try {
    const intake = await readIntake(request);
    const requestId = intake.requestId && /^[a-zA-Z0-9_-]{8,180}$/.test(intake.requestId)
      ? intake.requestId
      : crypto.randomUUID();
    reservation = await reserveQuota(user.id, "chat", `opportunity-analysis:${requestId}`);
    if (!reservation) {
      return NextResponse.json({ ok: false, error: "今日免费分析额度已用完", needUpgrade: true }, { status: 403 });
    }
    const knowledge = await buildAgentKnowledgeContext({
      task: "job_analysis",
      company: intake.company,
      role: intake.role,
      query: [intake.company, intake.role, intake.jdText.slice(0, 240)].filter(Boolean).join(" "),
      limit: 5,
    });
    const result = await callLLM([
      {
        role: "system",
        content: `你是益职的求职材料整理与证据分析模块。用户会给任意原始材料：岗位链接/JD、简历、经历说明或求职目标。你先识别材料类型，再建立岗位作战档案或求职准备档案。

约束：
1. 绝不虚构公司、职位、项目、数字、职责或经验；识别不到就返回空字符串。
2. materialKind=resume 时，原始材料属于用户经历，应进入 resumeText；materialKind=job 时，岗位要求、公司介绍不能进入 resumeText。
3. 没有简历时，证据只能是 missing；表述模糊或数字需核对时用 unverified。
4. 不使用性别、年龄、婚育、民族等与胜任力无关的信息。
5. 岗位档案的每条 evidence 必须能在用户经历原文中找到；否则写明“尚无证据”。准备档案可以评估材料完整度，但不能虚构目标岗位要求。
6. materialKind=job 或 mixed 时，jdText 只保留岗位职责、要求、公司与岗位相关信息；materialKind=resume 或 goal 时 jdText 必须为空。
7. 内部知识库只用于识别岗位常见考察方向，不能成为用户经历证据，也不能覆盖当前 JD。
8. 只返回 JSON，不要 Markdown。

返回结构：
{
  "materialKind": "job | resume | goal | mixed",
  "company": "公司名或空字符串",
  "role": "职位名；准备阶段填材料中明确的目标岗位，无法识别则为空字符串",
  "location": "地点或空字符串",
  "jdText": "整理后的完整 JD 或空字符串",
  "resumeText": "材料中明确属于用户的经历原文或空字符串",
  "recommendation": "apply | prepare_then_apply | skip",
  "recommendationLabel": "优先投递 | 补充后投递 | 暂不投入",
  "recommendationReason": "一到两句具体理由",
  "requirements": [{"requirement":"JD 关键要求；准备档案则为材料完整度或目标清晰度","importance":"critical | important | supporting","strength":"strong | weak | missing | unverified","evidence":"真实经历或尚无证据","source":"简历中的可追溯位置或 null","verified":true}],
  "actions": [{"title":"具体下一步","reason":"为什么它优先","dueLabel":"今天 | 投递前 | 本周","priority":"urgent | high | normal"}],
  "interviewFocus": [{"question":"可直接练习的问题","rationale":"为什么会问","readiness":"ready | practice | missing"}]
}`,
      },
      {
        role: "user",
        content: `已有公司：${intake.company || "（待识别）"}\n已有职位：${intake.role || "（待识别）"}\n已有地点：${intake.location || "（待识别）"}\n\n原始材料：\n${intake.jdText}\n\n另附用户简历或经历：\n${intake.resumeText || "（未提供）"}${knowledge.contextText ? `\n\n${knowledge.contextText}` : ""}`,
      },
    ], { provider: "deepseek", temperature: 0.2, maxTokens: 4000, timeoutMs: 45_000, maxRetries: 1 });

    const parsed = asRecord(parseJson(result));
    const materialKind = ["job", "resume", "goal", "mixed"].includes(String(parsed.materialKind)) ? String(parsed.materialKind) : "job";
    const workspaceType = materialKind === "job" || materialKind === "mixed" ? "job" : "preparation";
    const company = String(parsed.company || intake.company || (workspaceType === "preparation" ? "求职准备" : "")).trim().slice(0, 120);
    const role = String(parsed.role || intake.role || (workspaceType === "preparation" ? "目标待确认" : "")).trim().slice(0, 160);
    const location = String(parsed.location || intake.location || "").trim().slice(0, 160);
    const jdText = workspaceType === "job" ? String(parsed.jdText || "").trim().slice(0, MAX_SOURCE_LENGTH) : "";
    const resumeText = String(parsed.resumeText || intake.resumeText || (materialKind === "resume" ? intake.jdText : "")).trim().slice(0, MAX_SOURCE_LENGTH);
    const profileText = workspaceType === "preparation" ? intake.jdText.trim().slice(0, MAX_SOURCE_LENGTH) : "";
    if (!company || !role || (workspaceType === "job" && !jdText)) {
      await finalizeQuota(reservation, false);
      reservation = null;
      return NextResponse.json({ ok: false, error: "这份材料还不足以建立档案。请补充岗位内容、简历经历或目标方向。" }, { status: 422 });
    }

    const requirements = Array.isArray(parsed.requirements) ? parsed.requirements.slice(0, 10).map((value: unknown, index: number) => {
      const item = asRecord(value);
      const importance = String(item.importance || "important");
      const strength = String(item.strength || "unverified") as EvidenceStrength;
      return {
        id: `req-${index + 1}`,
        requirement: String(item.requirement || "未命名要求").slice(0, 500),
        importance: ["critical", "important", "supporting"].includes(importance) ? importance : "important",
        strength: strengths.has(strength) ? strength : "unverified",
        evidence: String(item.evidence || "尚无证据").slice(0, 1000),
        source: item.source ? String(item.source).slice(0, 300) : null,
        verified: Boolean(item.verified && item.source),
      };
    }) : [];
    const evidenceCoverage = requirements.reduce((counts: Record<EvidenceStrength, number>, item: { strength: EvidenceStrength }) => {
      counts[item.strength] += 1;
      return counts;
    }, { strong: 0, weak: 0, missing: 0, unverified: 0 });
    const actions = Array.isArray(parsed.actions) ? parsed.actions.slice(0, 4).map((value: unknown, index: number) => {
      const item = asRecord(value);
      const priority = String(item.priority || "normal");
      return {
        id: `action-${index + 1}`,
        title: String(item.title || "处理关键证据").slice(0, 300),
        reason: String(item.reason || "提高投递判断的可靠性。").slice(0, 500),
        dueLabel: String(item.dueLabel || "投递前").slice(0, 80),
        priority: ["urgent", "high", "normal"].includes(priority) ? priority : "normal",
        status: "todo",
      };
    }) : [];
    const interviewFocus = Array.isArray(parsed.interviewFocus) ? parsed.interviewFocus.slice(0, 5).map((value: unknown, index: number) => {
      const item = asRecord(value);
      const readiness = String(item.readiness || "practice");
      return {
        id: `focus-${index + 1}`,
        question: String(item.question || "请说明一段相关经历。").slice(0, 500),
        rationale: String(item.rationale || "核对岗位关键要求。").slice(0, 500),
        readiness: ["ready", "practice", "missing"].includes(readiness) ? readiness : "practice",
      };
    }) : [];
    const recommendationValue = String(parsed.recommendation || "prepare_then_apply") as OpportunityRecommendation;
    const recommendation = recommendations.has(recommendationValue) ? recommendationValue : "prepare_then_apply";
    await finalizeQuota(reservation, true);
    const quota = { source: reservation.source, remaining: reservation.remaining };
    reservation = null;
    return NextResponse.json({
      ok: true,
      quota,
      input: { workspaceType, company, role, location, jdText, resumeText, profileText, sourceLabel: intake.sourceLabel },
      analysis: {
        recommendation,
        recommendationLabel: String(parsed.recommendationLabel || "补充后投递").slice(0, 80),
        recommendationReason: String(parsed.recommendationReason || "还需补充关键证据。").slice(0, 800),
        evidenceCoverage,
        requirements,
        actions,
        interviewFocus,
      },
    });
  } catch (error) {
    if (reservation) await finalizeQuota(reservation, false).catch((refundError) => console.error("Opportunity quota refund failed", refundError));
    console.error("Opportunity analysis failed", error);
    const message = error instanceof Error && /请|不能|不支持|无法|没有|太大/.test(error.message)
      ? error.message
      : "材料暂时读不了，请直接粘贴文字后重试";
    return NextResponse.json({ ok: false, error: message }, { status: 503 });
  }
}
