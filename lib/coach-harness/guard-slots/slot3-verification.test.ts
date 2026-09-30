/**
 * 槽3 落库前核验：信息不足守卫（在岗）+ grounding 核验、引用回指核验（W3）、
 * claim 冲突、产物草稿校验（后几条从别处执行归位为「可暴露」，行为一字不变）。
 * 每条断言钉在 slot===3。
 */

import { guardInsufficientReply, type ProvidedMaterial } from "../insufficiency-guard";
import type { ArtifactDraft, CareerClaim, ContextBundle } from "../types";
import {
  ARTIFACT_DRAFT_GUARD_ID,
  CITATION_GROUNDING_GUARD_ID,
  CLAIM_CONFLICT_GUARD_ID,
  GROUNDING_VERIFICATION_GUARD_ID,
  INSUFFICIENCY_GUARD_ID,
  artifactDraftDecision,
  citationGroundingDecision,
  claimConflictDecision,
  insufficiencyVerificationDecision,
  registerDefaultGuards,
  resetGuardRegistry,
  resumeGroundingVerificationDecision,
  runSlot,
  type Slot3Input,
} from "./index";

afterEach(() => resetGuardRegistry());

const LONG_BODY = "首先我们来梳理方法论。" + "第一步要看岗位JD里的硬性门槛，第二步再对照你的经历逐条找证据，缺一不可。".repeat(12);
const RESUME_MATERIAL: ProvidedMaterial = { kind: "resume", text: "教育：本科。技能：SQL 查询、Python 基础。" };

describe("槽3 insufficiency 守卫：与 guardInsufficientReply 严格等价", () => {
  const cases: Array<[string, Slot3Input["reply"]]> = [
    ["blocking 硬编长答", { answer: `<clarify level="blocking">这份简历投的是哪个岗位？</clarify>\n${LONG_BODY}`, userText: "帮我看看简历" }],
    ["blocking 但索要已提供的原文", { answer: `<clarify level="blocking">方便发我一份简历原文吗？</clarify>\n${LONG_BODY}`, userText: "帮我看看简历", providedMaterials: [RESUME_MATERIAL] }],
    ["blocking 问原文已写明的事实", { answer: `<clarify level="blocking">你有 SQL 实战吗？</clarify>\n差距分析如下：`.concat(LONG_BODY.slice(0, 100)), userText: "帮我看看简历", providedMaterials: [RESUME_MATERIAL] }],
    ["partial 提示", { answer: `${"指标拆解分三步。"}\n<clarify level="partial">补充近三个月数字会更准</clarify>`, userText: "指标怎么拆" }],
    ["无依据断言", { answer: "到这里你已经掌握了差距分析。", userText: "讲讲差距分析" }],
    ["普通放行", { answer: "先看岗位的硬性门槛。", userText: "怎么看岗位" }],
  ];
  test.each(cases)("%s：data.legacy 与旧接口返回逐字段一致", (_name, reply) => {
    const input: Slot3Input = { reply };
    const decision = insufficiencyVerificationDecision(input);
    expect(decision.slot).toBe(3);
    expect(decision.guardId).toBe(INSUFFICIENCY_GUARD_ID);
    expect((decision.data as { legacy: unknown }).legacy).toEqual(guardInsufficientReply(reply!));
  });
  test("真缺口 → block；索要已有 → degrade_to_pending；无依据断言 → annotate；其余 → pass", () => {
    expect(insufficiencyVerificationDecision({ reply: cases[0][1] }).outcome).toBe("block");
    expect(insufficiencyVerificationDecision({ reply: cases[1][1] }).outcome).toBe("degrade_to_pending");
    expect(insufficiencyVerificationDecision({ reply: cases[1][1] }).reason.code).toBe("reask_downgraded:document_handover");
    expect(insufficiencyVerificationDecision({ reply: cases[2][1] }).reason.code).toBe("reask_downgraded:stated_in_material");
    expect(insufficiencyVerificationDecision({ reply: cases[4][1] }).outcome).toBe("annotate");
    expect(insufficiencyVerificationDecision({ reply: cases[5][1] }).outcome).toBe("pass");
  });
  test("这条断言钉在槽3：runSlot(3,…) 全部裁决 slot===3", () => {
    registerDefaultGuards();
    const decisions = runSlot<Slot3Input>(3, {});
    expect(decisions.map((d) => d.guardId)).toEqual([
      INSUFFICIENCY_GUARD_ID,
      GROUNDING_VERIFICATION_GUARD_ID,
      CITATION_GROUNDING_GUARD_ID,
      CLAIM_CONFLICT_GUARD_ID,
      ARTIFACT_DRAFT_GUARD_ID,
    ]);
    expect(decisions.every((d) => d.slot === 3 && d.reason.code === "input_absent")).toBe(true);
  });
});

const claim = (overrides: Partial<CareerClaim> = {}): CareerClaim => ({
  id: "claim-1",
  entityType: "experience",
  entityKey: "project-a",
  claimType: "result",
  value: { result: "转化率提升 18%" },
  displayText: "负责项目 A，转化率提升 18%",
  sourceExcerpt: "负责项目 A，转化率提升 18%",
  status: "confirmed",
  visibility: "recruiter_safe",
  sourceKind: "user_upload",
  verificationLevel: "user_confirmed",
  ...overrides,
});

describe("槽3 resume-grounding 核验半边（quote 回指）", () => {
  const sources = [{ id: "current", text: "负责项目 A，转化率提升 18%。" }];
  test("每条 quote 都能回指原文子串 → pass", () => {
    const raw = JSON.stringify({
      resumeQuotes: [{ sourceId: "current", quote: "负责项目 A，转化率提升 18%" }],
      nextStep: "把口径写成一页纸待做练习",
    });
    const d = resumeGroundingVerificationDecision({ grounding: { raw, sources } });
    expect(d.slot).toBe(3);
    expect(d.guardId).toBe(GROUNDING_VERIFICATION_GUARD_ID);
    expect(d.outcome).toBe("pass");
    expect((d.data as { draft: string }).draft).toContain("简历事实底稿");
  });
  test("抽取不到可安全使用的经历 / 复核未通过 → block，不给没有出处的用户事实", () => {
    const d = resumeGroundingVerificationDecision({ grounding: { raw: JSON.stringify({ nextStep: "x" }), sources } });
    expect(d.outcome).toBe("block");
    expect(d.reason.code).toBe("resume_grounding_failed");
    expect(d.reason.message).toBe("简历事实复核未通过");
  });
});

describe("槽3 引用回指核验（W3 核验器归位为守卫）", () => {
  const sources = [{ id: "base-resume", text: "AI Job Coach：负责模型评测。" }];
  test("逐字回指得上 → pass，报告进 data.report", () => {
    const d = citationGroundingDecision({ citation: { candidateText: "负责模型评测", sources } });
    expect(d.slot).toBe(3);
    expect(d.guardId).toBe(CITATION_GROUNDING_GUARD_ID);
    expect(d.outcome).toBe("pass");
    expect((d.data as { report: { stats: { grounded: number } } }).report.stats.grounded).toBe(1);
  });
  test("扩大动作（负责→主导）→ block：R-3 点名的危害形状", () => {
    const d = citationGroundingDecision({ citation: { candidateText: "主导模型评测全流程", sources } });
    expect(d.outcome).toBe("block");
    expect(d.reason.code).toBe("citation_action_not_supported");
    expect(d.reason.message).toContain("扩大了动作");
  });
  test("文字残缺（悬挂标点收尾）→ block：半截话不许下发", () => {
    const d = citationGroundingDecision({ citation: { candidateText: "负责模型评测，覆盖准确率、", sources } });
    expect(d.outcome).toBe("block");
    expect(d.reason.code).toBe("citation_broken_tail");
  });
  test("换措辞类（凑不出逐字子串）→ annotate 记账，不拦（两档裁定见 spec §10）", () => {
    const d = citationGroundingDecision({ citation: { candidateText: "模型评测覆盖准确率口径", sources } });
    expect(d.outcome).toBe("annotate");
    expect(d.reason.code).toBe("citation_no_exact_substring");
  });
});

describe("槽3 claim 冲突检测（归位可暴露）", () => {
  test("同一事实两个版本 → degrade_to_pending，冲突清单原样进 data", () => {
    const claims = [claim(), claim({ id: "claim-2", value: { result: "转化率提升 21%" }, displayText: "转化率提升 21%" })];
    const d = claimConflictDecision({ claims });
    expect(d.slot).toBe(3);
    expect(d.guardId).toBe(CLAIM_CONFLICT_GUARD_ID);
    expect(d.outcome).toBe("degrade_to_pending");
    expect((d.data as { conflicts: unknown[] }).conflicts).toHaveLength(1);
  });
  test("无冲突 → pass", () => {
    expect(claimConflictDecision({ claims: [claim()] }).outcome).toBe("pass");
  });
});

describe("槽3 产物草稿校验（归位可暴露）", () => {
  const bundleFor = (claims: CareerClaim[]): ContextBundle =>
    ({ claims, blockedClaimDetails: [] }) as unknown as ContextBundle;
  test("编造数字 → block，issue 清单原样进 data.report", () => {
    const draft: ArtifactDraft = { artifactType: "resume", sections: [{ path: "experience.0", content: "转化率提升 30%", claimIds: ["claim-1"] }] };
    const d = artifactDraftDecision({ draft: { artifact: draft, bundle: bundleFor([claim()]) } });
    expect(d.slot).toBe(3);
    expect(d.guardId).toBe(ARTIFACT_DRAFT_GUARD_ID);
    expect(d.outcome).toBe("block");
    expect(d.reason.code).toBe("artifact_draft_invalid");
    expect((d.data as { report: { issues: Array<{ code: string }> } }).report.issues.map((i) => i.code)).toContain("unsupported_number");
  });
  test("warning 级（未逐条确认的上传材料）→ annotate 不拦截", () => {
    const draft: ArtifactDraft = { artifactType: "resume", sections: [{ path: "experience.0", content: "负责项目 A，转化率提升 18%", claimIds: ["claim-1"] }] };
    const d = artifactDraftDecision({ draft: { artifact: draft, bundle: bundleFor([claim({ status: "unverified", verificationLevel: "self_reported" })]) } });
    expect(d.outcome).toBe("annotate");
    expect(d.reason.code).toBe("artifact_draft_warnings");
  });
  test("有据草稿 → pass", () => {
    const draft: ArtifactDraft = { artifactType: "resume", sections: [{ path: "experience.0", content: "负责项目 A，转化率提升 18%", claimIds: ["claim-1"] }] };
    expect(artifactDraftDecision({ draft: { artifact: draft, bundle: bundleFor([claim()]) } }).outcome).toBe("pass");
  });
});
