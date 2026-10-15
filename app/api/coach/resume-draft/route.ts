import { NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import {
  ContextBudgetExceededError,
  applyResumeChanges,
  assertContextFits,
  compileContextBundle,
  renderCitableFactsForPrompt,
  reviewAtsText,
  validateArtifactDraft,
  type CareerClaim,
} from "@/lib/coach-harness";
import { createArtifactWithClaims, getContextBundleForUser, recordArtifactReview } from "@/lib/coach-harness/repository";
import { callLLM } from "@/lib/llm";
import { finalizeQuota, reserveQuota, type QuotaReservation } from "@/lib/quota";
import { runWithGenerationContext } from "@/lib/generation-context";
import type { ResumeChange } from "@/lib/opportunities/types";
import { tokenPayRecoveryResponse } from "@/lib/tokenpay-recovery";
import { isTrivialRewrite, coalesceResumeProposals } from "@/lib/coach-harness/resume-diff";
import { resumeRecovery, modelResumeRecovery } from "@/lib/coach-harness/resume-recovery";
import { retrieveResumeExamples, renderResumeKnowledge } from "@/lib/knowledge/resume-examples";
import { startResumeTrace, type ResumeTraceOutcome } from "@/lib/coach-harness/resume-trace";
import { classifyGenerationFailure } from "@/lib/llm-telemetry";
import { resumeSourceProtection } from "@/lib/coach-harness/resume-source-protection";
import { resumeTaskInput, persistResumeAnswerClaims } from "@/lib/coach-harness/resume-task";
import { factualResumeAnswers, nextResumeQuestion, fallbackResumeQuestion } from "@/lib/coach-harness/resume-task-types";
import {
  CITATION_GROUNDING_GUARD_ID,
  GUARD_SLOTS,
  registerDefaultGuards,
  runSlot,
  type GuardDecision,
  type Slot3Input,
} from "@/lib/coach-harness/guard-slots";
import type { GroundingSource } from "@/lib/coach-harness/citation-verifier";

export const runtime = "nodejs";
export const maxDuration = 180;
// 引用回指硬闸挂在槽3；本模块只按槽执行，不内联任何判定。
registerDefaultGuards();

function parseJson(text: string) {
  const match = text.replace(/```json\s*/g, "").replace(/```/g, "").match(/\{[\s\S]*\}/);
  if (!match) throw new Error("AI 返回格式错误");
  return JSON.parse(match[0]);
}

// 模型偶发把 after 生成成半截话（用户实测：「…周活约10，已上线腾」——词都断在
// 中间，还把「周活」写成了「腾活」）。悬挂标点、括号不配对这类能确定性判定的，
// 由槽3 的引用回指守卫判 broken_tail 并 block（判定表只在 citation-verifier.ts
// 一处维护，本模块不再自带第二把正则）；断词/错字这类只有语义层能看出来的，
// 交给下面的独立质检员，error 级发现的建议不再下发。

export async function POST(request: Request) {
  const user = await getCurrentUserFromRequest();
  if (!user) return NextResponse.json({ ok: false, error: "未认证" }, { status: 401 });
  let reservation: QuotaReservation | null = null;
  let trace: Awaited<ReturnType<typeof startResumeTrace>> | undefined;
  let outcome: ResumeTraceOutcome = "failed";
  try {
    const body = await request.json();
    const resumeText = String(body.resumeText || "").trim().slice(0, 30_000);
    const jobDescription = String(body.jobDescription || "").trim().slice(0, 30_000);
    const opportunityId = String(body.opportunityId || "").trim();
    const generalResume = body.mode === "general_resume";
    if (!resumeText || (!jobDescription && !generalResume)) return NextResponse.json({ ok: false, error: "请先补充简历和 JD" }, { status: 400 });
    const requestId = String(body.requestId || crypto.randomUUID()).slice(0, 180);
    trace = await startResumeTrace(user.id, requestId, generalResume);
    const agentTask = body.resumeTaskId ? await resumeTaskInput(user.id, String(body.resumeTaskId), String(body.resumeTaskLease || "")) : null;
    if (agentTask && agentTask.opportunity_id !== opportunityId) throw Error("改稿任务与当前简历不一致");
    reservation = await reserveQuota(user.id, "resume", `resume-draft:${requestId}`);
    if (!reservation) { outcome = "quota_denied"; return NextResponse.json({ ok: false, error: "简历生成额度不足", needUpgrade: true }, { status: 403 }); }

    // 简历改写要读完整简历 + JD，single_inference 的 2k 装不下。
    // 预算必须显式给，否则 Compiler 会按默认值把简历大半丢掉——之前那条
    // .slice(0, 160) 的手搓截断掩盖了这个问题，让 budget 形同虚设。
    const RESUME_WORKSHOP_BUDGET = 12_000;

    // JD 走 questionSource 而不是直接拼进 user message：
    // 它是本次改写必须完整读到的原文，纳入 budget 后装不下会被 fail-loud 拦住，
    // 而不是像以前那样 3 万字 JD 无声地塞进 prompt。
    const questionSource = jobDescription ? { id: "job-description", text: jobDescription } : undefined;

    let context;
    if (opportunityId) {
      context = await getContextBundleForUser({
        userId: user.id,
        task: "resume_workshop",
        opportunityId,
        // 岗位本身已经携带 JD；这里把另一份不可缺的原文槽位留给简历，
        // 避免把 JD 计入预算两次、简历却完全没进预算。
        questionSource: { id: "base-resume", text: resumeText },
        retrievalQuery: resumeText,
        knowledgeLimit: 2,
        budget: { maxInputTokens: RESUME_WORKSHOP_BUDGET },
      });
    } else {
      const lines = resumeText.split(/\n+/).map((line) => line.trim()).filter(Boolean).slice(0, 120);
      // PRD §5.2：粘贴进来的简历行是用户材料，不是用户逐条确认过的事实。
      // 以前这里直接标 confirmed，等于把「我上传过」包装成「我确认过」。
      const claims: CareerClaim[] = lines.map((line, index) => ({
        id: `resume-line-${index + 1}`, entityType: "experience", entityKey: `resume-line-${index + 1}`,
        claimType: "resume_source", value: line, displayText: line, sourceExcerpt: line,
        status: "unverified", visibility: "recruiter_safe",
        sourceKind: "user_upload", verificationLevel: "self_reported",
      }));
      context = compileContextBundle({
        task: "resume_workshop",
        userId: user.id,
        claims,
        questionSource,
        attachments: [{ id: "base-resume", label: "基础简历原文", text: resumeText, required: true }],
        budget: { maxInputTokens: RESUME_WORKSHOP_BUDGET },
      });
    }

    if (agentTask) {
      const answers = factualResumeAnswers(agentTask.answers);
      const supplementClaims = await persistResumeAnswerClaims(agentTask);
      context = compileContextBundle({ ...context, knowledgeContext: "", claims: [...context.claims.filter(claim=>claim.claimType!=="resume_task_supplement"), ...supplementClaims],
        attachments: [...context.attachments, ...answers.map((answer, index) => ({ id: `resume-answer-source-${index}`, label: "已保存的本人补充（自述）", text: answer.answer, required: true }))] });
    }
    trace.step("context", "own_materials_compiled");
    const examples = retrieveResumeExamples({ resume: resumeText, target: jobDescription });
    if (examples.length) {
      context = compileContextBundle({ ...context, knowledgeContext: "", knowledge: [
        ...examples.map(({ document }) => ({ id: document.id, title: document.title, content: document.content,
          description: document.description, goal: document.goal, scope: document.scope, confidence: document.confidence,
          evidenceUrls: document.evidence.map(item => item.url) })), ...(context.knowledge || []),
      ] });
    }
    const includedKnowledge = context.knowledge || [];
    trace.data.retrieval = { status: examples.length ? "matched" : "no_close_example", candidates: examples.length,
      includedIds: includedKnowledge.map(item => item.id),
      matches: examples.map(item => ({ id: item.document.id, similarity: item.score, dimensions: item.matchedDimensions, signals: item.matchedSignals, stageMatched: item.stageMatched })) };
    trace.step("retrieval", examples.length ? "background_examples_selected" : "no_close_example", examples.length);

    // PRD §5.1 fail-loud：关键原句装不下就拒绝生成，不能截断后继续作结论。
    assertContextFits(context);

    // 可引用 = 来源可引用且状态可用。未逐条确认的仍可用，只是会带上口径提醒。
    // 用渲染器而不是手搓 filter+slice：只有被 Compiler 装进 selection 的事实才能进 prompt，
    // 被预算舍弃的不会在这儿被捞回来。
    const rendered = renderCitableFactsForPrompt(context);
    const citableIds = new Set([...context.allowedClaimIds, ...context.unverifiedClaimIds]);
    const source = rendered.text;
    if (!source) throw new Error("事实库里没有可用于简历的真实材料，请先补充简历或经历");

    // 回指来源只有两份：基础简历原文 + 本轮真进了上下文的可引用事实。
    // 被预算舍弃的 claim 不在 citableIds 里，所以也进不了这儿（FR-21）。
    const citationSources: GroundingSource[] = [
      { id: "base-resume", text: resumeText },
      ...(context.claims || []).filter((claim) => citableIds.has(claim.id)).map((claim) => ({ id: claim.id, text: claim.displayText })),
    ];
    const citationVerdicts: Array<{ index: number; outcome: GuardDecision["outcome"]; code: string; message: string }> = [];

    if (agentTask && agentTask.answers.length < 5 && !agentTask.answers.some(answer => answer.skipped)) {
      const plan = parseJson(await runWithGenerationContext({ userId: user.id, operation: "resume_draft", requestId: `${requestId}:materials`, knowledgeDocumentIds: includedKnowledge.map(item => item.id) }, () => callLLM([
        { role: "system", content: "你是益职的简历导师。先判断资料是否能形成具体、真实、有价值的短 bullet。只有模糊职责/名词，或用户说忘了、不知道具体做了什么时，必须先补问；别直接把空泛句润色。已有具体个人动作和交付，就 ready；没有数字、没有目标JD，不是阻断理由。一次只问一个最影响改稿的事实，问题简短易答，可以用回忆方法引导，但不提供可冒充经历的示例答案。不要一口气问背景/动作/结果三件事，不重复问已经回答或说不知道的维度。返回JSON {\"ready\":true} 或 {\"ready\":false,\"recovery\":{\"sourceExcerpt\":\"简历连续原句，不含姓名联系方式\",\"field\":\"context|action|deliverable|outcome|scope\",\"question\":\"只问一个具体问题\"}}。外部案例不是用户经历，不向用户展示内部评分。" },
        { role: "user", content: `当前JD：${jobDescription || "无JD，通用修改"}\n原简历：${resumeText}\n已保存补问及回答（用户自述，含不知道）：${JSON.stringify(agentTask.answers)}\n同账号可引用事实：${source}\n${renderResumeKnowledge(includedKnowledge)}` },
      ], { provider: "deepseek", temperature: 0.1, maxTokens: 700, reasoningBudgetTokens: 1536, timeoutMs: 30_000, maxRetries: 0, responseFormat: "json_object" })));
      const modelQuestion = plan.ready !== true ? nextResumeQuestion(resumeText, plan.recovery||plan, agentTask.answers) : null;
      const question = modelQuestion || (plan.ready !== true ? fallbackResumeQuestion(resumeText,agentTask.answers) : null);
      if(question&&!modelQuestion)trace.step('draft','materials_question_fallback',agentTask.answers.length);
      if (question) {
        await finalizeQuota(reservation, false); reservation = null; outcome = "needs_detail";
        trace.step("draft", "materials_one_question", agentTask.answers.length);
        return NextResponse.json({ ok: false, recovery: question, reasonCode: "resume_detail_needed", error: "先补充这一个细节，再继续修改" }, { status: 422 });
      }
      if (plan.ready !== true && !agentTask.answers.length) throw Error("导师未能确认资料缺口，原简历保留，请重试");
      trace.step("draft", "materials_ready", agentTask.answers.length);
    }

    const output = await runWithGenerationContext({
      userId: user.id,
      operation: "resume_draft",
      requestId,
      knowledgeDocumentIds: includedKnowledge.map(item => item.id),
    }, () => callLLM([
      { role: "system", content: `你是益职的岗位简历编辑器。只整理用户已经提供的事实，不补项目、职责、技能、数字或时间。用户没有目标岗位经历不等于原简历不能改善；可改善已有工作的表达，不能替他补齐JD门槛。优先把密集的真实动作拆成2至3条易读短句或列表，保留原词、否定和责任限定。没有新信息时不要同义换词，但段落拆成有意义的动作/交付列表属于有效结构整理。补充经历仍是用户自述，不代表已核实。每条建议必须引用完整支持它的 sourceIds（逐字复制下方编号，不要用示例编号）；before 必须是原文连续片段。不要强行写成产品经理、主导、分析洞察或推动优化。只返回 JSON：{"changes":[{"section":"经历位置","before":"原文原句","after":"可直接使用的新表述","reason":"这处表达改善的具体价值及与JD的有限对应","sourceIds":["提供的真实编号"]}]}` },
      { role: "system", content: "先判断现有事实是否足够改善表达；有能安全修改的内容就先改，不因缺 JD 关键词或没有数字阻断。只有完全无法提出有价值修改且缺具体事实时，才返回 {\"status\":\"needs_detail\",\"recovery\":{\"sourceExcerpt\":\"简历中12–260字的完整连续原文，不含联系方式\",\"question\":\"针对这段经历、一次只问一个最有用的具体问题\"},\"changes\":[]}。若已有补充经历，先读并使用，不能再要求同一材料。不索取案例中的成果或数字。参考资料只用于选择结构，永远不是可引用事实。" },
      ...(agentTask ? [{ role: "user" as const, content: `已保存的逐问回答：${JSON.stringify(agentTask.answers)}。把有用的本人补充合并进原句，引用可引用事实清单中的对应编号；before 仍逐字来自原简历。每个 before 只出现一次；同一原句拆出的2–3条短bullet都放进一个after，不能重复before。不把这些问答原样堆到成稿末尾。不要仅改责任否定句/同义换词凑建议；优先改善真实动作、交付和信息取舍。已答或暂不补充的内容不要重复追问，缺失事实保持限定。` }] : []),
      { role: "user", content: `目标 JD：\n${jobDescription}\n\n基础简历原文：\n${resumeText}\n\n带编号的可引用事实：\n${source}\n\n${renderResumeKnowledge(includedKnowledge)}\n\n最多给出 6 条高价值修改。before 必须逐字复制基础简历中的一段连续原文，不能写章节名或摘要。若有补充经历，优先将补充的真实动作与交付合并到对应经历，尽量保留原词；结构整理有价值，不必新增数字。不得删除协助/参与等职责限定；JD 里的指标和术语只能用于解释对应，不得变成用户做过的事。不得用「本科毕业，本科学历」这类重复句凑建议。` },
      ...(generalResume ? [{ role: "user" as const, content: "本次是通用简历修改，没有目标 JD，不要要求用户先找岗位，不要凭空补岗位门槛。目标：去掉冗余与名词堆砌，把真实动作和已有结果写清楚，尽量适合一页简历。每条 bullet 一个要点，通常 30–70 个汉字，最多 100 字；长经历拆成 2–3 条，不写长段。保留原文的参与/协助、否定、数字和时间，缺事实就保留限定，不补编。" }] : [{role:"user" as const,content:"每条 bullet 一个要点，通常 30–70 个汉字，最多 100 字；保留原有事实和责任限定，不用长段堆砌术语。优先删冗余，尽量适合一页，不删除有价值的真实事实。"}]),
    ], { provider: "deepseek", temperature: 0.15, maxTokens: 2600, reasoningBudgetTokens: 2048, timeoutMs: 45_000, maxRetries: agentTask ? 0 : 1, responseFormat: "json_object" }));

    const parsed = parseJson(output);
    trace.step("draft", "model_returned");
    const rawChanges = coalesceResumeProposals(Array.isArray(parsed.changes) ? parsed.changes.slice(0, 6).filter((item:unknown)=>item&&typeof item==='object') : []);
    if (parsed.status === "needs_detail" && !rawChanges.length) {
      const recovery = modelResumeRecovery(resumeText, parsed.recovery);
      if (recovery) {
        await finalizeQuota(reservation, false); reservation = null; outcome = "needs_detail";
        trace.step("draft", recovery.detailSaved ? "saved_detail_not_requested_again" : "one_anchored_question");
        return NextResponse.json({ ok: false, reasonCode: "resume_detail_needed", error: recovery.detailSaved ? "补充已保存，原简历可继续编辑或导出" : "补充这一个真实细节后继续改稿，本次未扣额度", recovery }, { status: 422 });
      }
    }
    const rejected: Array<{ index: number; reasons: string[] }> = [];
    const changes: ResumeChange[] = rawChanges.flatMap((raw: Record<string, unknown>, index: number) => {
      const sourceIds = Array.isArray(raw.sourceIds) ? raw.sourceIds.map(String).filter((id) => citableIds.has(id)) : [];
      const after = String(raw.after || "").trim().slice(0, 2000);
      const before = String(raw.before || "").trim().slice(0, 2000);
      const report = validateArtifactDraft({ artifactType: "target_resume", visibility: "recruiter_safe", sections: [{ path: `changes.${index}.after`, content: after, claimIds: sourceIds }] }, context);
      const mappingIssues = [
        ...(before && !resumeText.includes(before) ? ["AI 建议的原文无法在当前简历中定位"] : []),
        ...resumeSourceProtection(before, after, String(raw.section || ""), resumeText),
      ];
      if (before && after && isTrivialRewrite(before, after)) mappingIssues.push("该修改与原文仅同义换词，没有信息增量，已自动过滤");
      // 槽3 引用回指核验（FR-23）：先于付费的独立质检员跑——逐字回指是确定性判定，
      // 不该花一次模型调用去发现一句没有出处的话。拦哪些类别由守卫裁定
      // （残缺/扩大动作/丢限定 = block，换措辞 = annotate 记账），本模块只认 outcome，
      // 不复算任何一条正则或词表。
      const citationVerdict = after ? runSlot<Slot3Input>(GUARD_SLOTS.prePersistenceVerification, { citation: { candidateText: after, sources: citationSources } }).find((d) => d.guardId === CITATION_GROUNDING_GUARD_ID) : undefined;
      if (citationVerdict) citationVerdicts.push({ index, outcome: citationVerdict.outcome, code: citationVerdict.reason.code, message: citationVerdict.reason.message });
      if (citationVerdict?.outcome === "block") mappingIssues.push(citationVerdict.reason.message);
      if (!after || !before || !report.ok || mappingIssues.length) {
        rejected.push({ index, reasons: [...mappingIssues, ...report.issues.map((issue) => issue.message)] });
        return [];
      }
      return [{
        id: `ai-change-${Date.now()}-${index}`,
        section: String(raw.section || "经历表述").slice(0, 100),
        before,
        after,
        reason: String(raw.reason || "提高与 JD 的对应度").slice(0, 500),
        evidenceId: sourceIds[0] || null,
        evidenceIds: sourceIds,
        status: "pending" as const,
      }];
    });
    if (!changes.length) {
      outcome = "blocked"; trace.step("grounding", "no_grounded_change", rejected.length);
      await finalizeQuota(reservation, false);
      reservation = null;
      return NextResponse.json({ ok: false, error: "没有生成通过事实校验的修改，原文已保留，本次未扣额度", recovery: resumeRecovery(resumeText) }, { status: 422 });
    }
    trace.step("grounding", "proposals_checked", changes.length);
    // Review is a separate bounded model call in the same user's billing context.
    // Step completion caps include private reasoning; 1800 alone can end with
    // finish_reason=length and no final JSON even after a successful draft.
    const reviewerOutput = await runWithGenerationContext({userId:user.id,operation:"resume_review",requestId:`${requestId}:review`,knowledgeDocumentIds:includedKnowledge.map(item=>item.id)},()=>callLLM([
      { role: "system", content: `你是独立的简历质检员，不参与起草。检查每条修改是否：1. 被 sourceIds 完整支持；2. 没扩大职责、结果、技能或数字；3. before 确实来自原简历；4. 对目标 JD 有明确价值；5. after 文字完整通顺——句子没有在词中间被截断（如「已上线腾」）、没有与 before 对不上的可疑错字换字（如「周活」写成「腾活」）、括号引号成对。第 5 条任一成立即 severity=error，并在 message 里写明断在哪。只返回 JSON：{"status":"passed|failed","summary":"一句话","findings":[{"changeId":"...","severity":"warning|error","message":"..."}]}` },
      { role: "user", content: `目标 JD：\n${jobDescription || "无目标 JD：只审表达、事实与精简，不要求岗位关键词匹配"}\n\n原简历：\n${resumeText}\n\n事实源：\n${source}\n\n每条 bullet 应短且有具体动作或已有结果；不接受超过 100 字的长 bullet、无事实支撑的名词堆砌。\n\n待审修改（findings 里的 changeId 必须从这里逐字取）：\n${JSON.stringify(changes)}` },
    ], { provider: "deepseek", temperature: 0, maxTokens: 1800, reasoningBudgetTokens:4096, timeoutMs: 55_000, maxRetries: 0, responseFormat: "json_object" }));
    const reviewer = parseJson(reviewerOutput) as { status?: string; summary?: string; findings?: unknown[] };
    const reviewerFindings = Array.isArray(reviewer.findings) ? reviewer.findings.slice(0, 20) : [];
    const reviewerPassed = reviewer.status === "passed" && !reviewerFindings.some((finding) => String((finding as Record<string, unknown>)?.severity) === "error");
    // 质检 error 对应的建议直接不下发（用户实测残缺文本「已上线腾」就是从这漏出去的）：
    // 与其让用户面对一条半截话的黄色高亮，不如宁缺毋滥。
    const errorChangeIds = new Set(reviewerFindings
      .filter((finding) => String((finding as Record<string, unknown>)?.severity) === "error")
      .map((finding) => String((finding as Record<string, unknown>)?.changeId || "")));
    // A failed overall review is not a success just because the model labelled
    // its unsupported-responsibility finding "warning" rather than "error".
    const failedFindingIds = new Set(reviewerFindings.map(finding => String((finding as Record<string, unknown>)?.changeId || "")));
    const knownIds = new Set(changes.map(change => change.id));
    const unexplainedFailure = reviewer.status !== "passed" && (reviewer.status !== "failed" || !failedFindingIds.size || [...failedFindingIds].some(id => !knownIds.has(id)));
    const finalChanges = unexplainedFailure ? [] : changes.filter(change =>
      !errorChangeIds.has(change.id) && (reviewer.status !== "failed" || !failedFindingIds.has(change.id)));
    if (!finalChanges.length) {
      outcome = "blocked"; trace.step("review", "all_changes_rejected");
      await finalizeQuota(reservation, false);
      reservation = null;
      return NextResponse.json({ ok: false, error: "改写未通过文字与事实质检，原文已保留，本次未扣额度", recovery: resumeRecovery(resumeText) }, { status: 422 });
    }
    const preview = applyResumeChanges(resumeText, finalChanges);
    if(preview.findings.length){
      outcome='blocked';trace.step('review','mapping_conflict',preview.findings.length);
      await finalizeQuota(reservation,false);reservation=null;
      return NextResponse.json({ok:false,error:'修改位置发生冲突，本次未扣额度。原文和补充已保留，可以继续。',reasonCode:'resume_mapping_conflict',retryable:true},{status:422});
    }
    const ats = reviewAtsText(preview.text, jobDescription);
    const shortBullets = finalChanges.every(change => change.after.split(/\n+/).every(line => line.replace(/^\s*[-•*]\s*/, "").length <= 100));
    const grounding = preview.findings.length === 0;
    trace.data.quality = { subject: "draft_quality_not_candidate", score: (grounding ? 40 : 0) + (reviewerPassed ? 30 : 0) + (shortBullets ? 20 : 0) + (ats.ok ? 10 : 0),
      grounding, independentReview: reviewerPassed, shortBullets, ats: ats.ok, proposed: rawChanges.length, retained: finalChanges.length };
    trace.step("review", reviewerPassed ? "review_passed" : "partial_changes_retained", finalChanges.length);
    let applicationQuality;
    if (opportunityId) {
      const claimLinks = finalChanges.flatMap((change, index) => (change.evidenceIds || (change.evidenceId ? [change.evidenceId] : [])).map((claimId) => ({ claimId, usagePath: `changes.${index}.after` })));
      const artifact = await createArtifactWithClaims({
        userId: user.id, opportunityId, artifactType: "target_resume", title: generalResume ? "简历修改候选版本" : "岗位简历候选版本",
        content: { baseResumeText: resumeText, jobDescription, changes: finalChanges, previewText: preview.text, discardedSuggestions: rejected },
        status: reviewerPassed && ats.ok ? "needs_confirmation" : "draft", contextSnapshot: context,
        createdBy: "hosted_ai", claimLinks,
      });
      // Rejected proposals are not in this artifact. Judge the retained preview,
      // while keeping the discarded proposal diagnostics in the artifact audit.
      const factsStatus = preview.findings.length === 0 ? "passed" : "failed";
      const reviews = await Promise.all([
        recordArtifactReview({ userId: user.id, opportunityId, artifactId: String(artifact.id), reviewerType: "facts", status: factsStatus, summary: factsStatus === "passed" ? "保留的改写引用已提供材料；被过滤的建议不在本版本中，不代表经历已核实。" : "当前预览存在无法定位或未通过事实校验的改写。", findings: preview.findings, contextFingerprint: context.fingerprint }),
        recordArtifactReview({ userId: user.id, opportunityId, artifactId: String(artifact.id), reviewerType: "independent_ai", status: reviewerPassed ? "passed" : "failed", summary: String(reviewer.summary || (reviewerPassed ? "独立复核通过。" : "独立复核发现阻断项。")), findings: reviewerFindings, contextFingerprint: context.fingerprint }),
        recordArtifactReview({ userId: user.id, opportunityId, artifactId: String(artifact.id), reviewerType: "ats", status: ats.ok ? "passed" : "failed", summary: ats.ok ? `文本可解析；岗位词覆盖 ${(ats.coverage * 100).toFixed(0)}%。` : "文本不满足 ATS 基础要求。", findings: ats.findings, contextFingerprint: context.fingerprint }),
        recordArtifactReview({ userId: user.id, opportunityId, artifactId: String(artifact.id), reviewerType: "pdf", status: "not_run", summary: "导出 PDF 后上传校验文字层。", findings: [], contextFingerprint: context.fingerprint }),
      ]);
      applicationQuality = {
        artifactId: String(artifact.id), version: Number(artifact.version),
        status: factsStatus === "passed" && reviewerPassed && ats.ok ? "ready" : "blocked",
        reviews: reviews.map((review) => ({ reviewerType: review.reviewer_type, status: review.status, summary: review.summary })),
      };
    }
    await finalizeQuota(reservation, true);
    const quota = { source: reservation.source, remaining: reservation.remaining };
    reservation = null;
    outcome = "completed"; trace.step("save", opportunityId ? "artifact_saved" : "draft_returned_without_opportunity");
    return NextResponse.json({
      ok: true,
      changes: finalChanges,
      rejectedCount: rejected.length + errorChangeIds.size,
      reviewer: { passed: reviewerPassed, summary: reviewer.summary, findings: reviewerFindings },
      // 这一轮引用回指闸给了哪些裁决（评测与遥测按 reason.code 断言，不读文案）。
      guards: citationVerdicts,
      applicationQuality,
      contextFingerprint: context.fingerprint,
      context: {
        usedTokens: rendered.usedTokens,
        budget: context.budget.maxInputTokens,
        included: context.selection.included.length,
        excluded: context.selection.excluded.length,
        warnings: rendered.warnings,
      },
      quota,
    });
  } catch (error) {
    trace?.step("failure", error instanceof ContextBudgetExceededError ? "context_budget_exceeded" : classifyGenerationFailure(error));
    if (reservation) await finalizeQuota(reservation, false).catch((refundError) => console.error("Resume quota refund failed", refundError));
    console.error("Resume draft failed", error);
    // 预算溢出是可由用户决策恢复的：拆任务、删材料或换更短的 JD。
    // 走 422 而不是 500，并把被拦下的条目回传，让前端能给出具体选项。
    if (error instanceof ContextBudgetExceededError) {
      outcome = "blocked";
      return NextResponse.json({ ok: false, error: error.message, blocked: error.blocked }, { status: 422 });
    }
    const recovery = tokenPayRecoveryResponse(error);
    if (recovery) return recovery;
    if(error instanceof Error && /Empty response from LLM|LLM_REQUEST_TIMEOUT|timed out|LLM API|Service is too busy/i.test(error.message)) {
      return NextResponse.json({ok:false,error:"简历修改暂时未完成，本次未扣额度。原简历已保留，可以重试。",reasonCode:"model_response_incomplete",retryable:true},{status:503});
    }
    if (error instanceof Error && /^RESUME_TRACE_/.test(error.message)) return NextResponse.json({ ok: false, error: "简历服务暂时未准备好，原文已保留，本次未扣额度", retryable: true }, { status: 503 });
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "简历生成失败" }, { status: 500 });
  } finally {
    // An unfinished row remains visibly running if the final audit write fails;
    // never discard an otherwise saved result or debit the model twice for telemetry.
    if (trace) {
      if (outcome === "failed") trace.step("failure", "request_failed");
      await trace.finish(outcome).catch(() => console.error("Resume trace finalization unavailable"));
    }
  }
}
