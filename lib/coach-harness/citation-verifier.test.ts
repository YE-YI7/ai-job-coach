/**
 * W3 引用回指核验器测试（FR-23 幻觉经历率=0 / FR-22 判定不等于事实 / FR-24 用户点头）。
 *
 * 语料 20 条：10 条 grounded + 10 条必须 rejected（超出规格的 8 条下限）。
 * 拒绝形状全部取自 RESUME_GROUNDING_PROMPT 的禁令与项目实测翻车：
 * 「已上线腾/腾活」截断换字（resume-draft route #35）、访谈≠归纳需求、
 * 原型≠可点击、计划访谈≠访谈过（数字没造假不等于经历真实）、参与≠主导。
 */
import {
  ACTION_VOCAB,
  ALLOWED_ACTION_PATTERNS,
  CITATION_VERIFIER_GUARD_INPUT,
  CITATION_VERIFIER_VERSION,
  FABRICATION_RULES,
  GAP_ALLOWLIST,
  GroundingNotAcceptedError,
  QUALIFIER_TOKENS,
  acceptGroundedRewrite,
  normalizeCandidateText,
  verifyResumeGrounding,
  type GroundingReport,
  type GroundingSource,
} from "./citation-verifier";

const SOURCES: GroundingSource[] = [
  { id: "claim-1", text: "我在实习期间参与了对30名用户的访谈，记录了他们的原话。" },
  { id: "claim-2", text: "我搭建了内部工具的原型，仅在本机运行，没有上线。" },
  { id: "claim-3", text: "我计划后续对原型做用户测试，目前还没有收到反馈。" },
  {
    id: "resume-raw",
    text: "项目：AI Job Coach 校园二手交易小程序。周活约10，负责后端接口开发。参与需求讨论，没有做过灰度发布。",
  },
];

interface Sample {
  id: string;
  candidate: string;
  expect: "grounded" | "rejected";
  reason?: string;
  ruleId?: string;
}

// ---------------------------------------------------------------------------
// 20 条构造语料
// ---------------------------------------------------------------------------

const GROUNDED: Sample[] = [
  { id: "G1", candidate: "参与了对30名用户的访谈", expect: "grounded" },
  { id: "G2", candidate: "记录了他们的原话", expect: "grounded" },
  { id: "G3", candidate: "搭建了内部工具的原型", expect: "grounded" },
  { id: "G4", candidate: "原型仅在本机运行，没有上线", expect: "grounded" },
  { id: "G5", candidate: "计划后续对原型做用户测试", expect: "grounded" },
  { id: "G6", candidate: "目前还没有收到反馈", expect: "grounded" },
  { id: "G7", candidate: "负责后端接口开发", expect: "grounded" },
  { id: "G8", candidate: "参与需求讨论", expect: "grounded" },
  { id: "G9", candidate: "校园二手交易小程序周活约10", expect: "grounded" },
  { id: "G10", candidate: "参与需求讨论，并负责后端接口开发", expect: "grounded" },
];

const REJECTED: Sample[] = [
  { id: "R1", candidate: "我主导了对30名用户的访谈", expect: "rejected", reason: "action_not_supported", ruleId: "participate-not-lead" },
  { id: "R2", candidate: "访谈了30名用户，归纳出5个核心需求", expect: "rejected", reason: "action_not_supported", ruleId: "interview-not-synthesis" },
  { id: "R3", candidate: "上线了内部工具原型", expect: "rejected", reason: "negation_or_hedge_dropped" },
  { id: "R4", candidate: "做了一个可点击的交互原型", expect: "rejected", reason: "action_not_supported", ruleId: "prototype-not-clickable" },
  { id: "R5", candidate: "收集用户反馈后迭代了两版", expect: "rejected", reason: "action_not_supported", ruleId: "outcome-verb-not-sourced" },
  { id: "R6", candidate: "访谈了30名用户", expect: "rejected", reason: "negation_or_hedge_dropped", ruleId: "qualifier-ROLE-dropped" },
  { id: "R7", candidate: "带领团队完成了原型上线", expect: "rejected", reason: "action_not_supported", ruleId: "participate-not-lead" },
  { id: "R8", candidate: "周活约10，已上线腾", expect: "rejected", reason: "negation_or_hedge_dropped" },
  { id: "R9", candidate: "负责后端接口开发，已上线，", expect: "rejected", reason: "broken_tail" },
  { id: "R10", candidate: "对原型做用户测试", expect: "rejected", reason: "negation_or_hedge_dropped", ruleId: "qualifier-HEDGE-dropped" },
];

const CORPUS = [...GROUNDED, ...REJECTED];

function firstVerdict(report: GroundingReport) {
  expect(report.verdicts.length).toBe(1);
  return report.verdicts[0];
}

// ---------------------------------------------------------------------------
// 语料回归：拒绝集零漏放，grounded 集零误杀
// ---------------------------------------------------------------------------

describe("引用回指语料（20 条，含 10 条必判负）", () => {
  it.each(REJECTED.map((s) => [s.id, s] as const))("必判负 %s：幻觉经历不许漏放", (_id, s) => {
    const verdict = firstVerdict(verifyResumeGrounding({ candidateText: s.candidate, sources: SOURCES }));
    expect(verdict.status).toBe("rejected");
    if (s.reason) expect(verdict.status === "rejected" && verdict.reason).toBe(s.reason);
    if (s.ruleId) expect(verdict.status === "rejected" && verdict.ruleId).toBe(s.ruleId);
    // 拒绝项必须给出违规片段与解释，且带已回指上的部分供审计。
    if (verdict.status === "rejected") {
      expect(verdict.offendingSpan.text.length).toBeGreaterThan(0);
      expect(verdict.detail.length).toBeGreaterThan(0);
    }
  });

  it.each(GROUNDED.map((s) => [s.id, s] as const))("应放行 %s：逐字回指成功", (_id, s) => {
    const verdict = firstVerdict(verifyResumeGrounding({ candidateText: s.candidate, sources: SOURCES }));
    expect(verdict.status).toBe("grounded");
    if (verdict.status === "grounded") {
      expect(verdict.evidences.length).toBeGreaterThan(0);
      for (const ev of verdict.evidences) {
        const source = SOURCES.find((x) => x.id === ev.sourceId)!;
        // 子串证据必须能在来源里逐字找到（幻觉回指自证）。
        if (ev.kind === "substring") expect(source.text.slice(ev.sourceStart, ev.sourceStart + ev.evidence.length)).toBe(ev.evidence);
      }
    }
  });

  it("语料规模符合验收：20 条、至少 8 条必判负", () => {
    expect(CORPUS.length).toBe(20);
    expect(REJECTED.length).toBeGreaterThanOrEqual(8);
  });

  it("语料零漏放 + 零误杀（false accept = 0，false reject = 0）", () => {
    let falseAccept = 0;
    let falseReject = 0;
    for (const s of CORPUS) {
      const verdict = firstVerdict(verifyResumeGrounding({ candidateText: s.candidate, sources: SOURCES }));
      if (s.expect === "rejected" && verdict.status !== "rejected") falseAccept++;
      if (s.expect === "grounded" && verdict.status !== "grounded") falseReject++;
    }
    // eslint-disable-next-line no-console
    console.log(`[W3 语料] 20 条：必判负漏放 ${falseAccept}/${REJECTED.length}，grounded 误杀 ${falseReject}/${GROUNDED.length}`);
    expect(falseAccept).toBe(0);
    expect(falseReject).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 硬闸：拒绝不是可忽略的 warning
// ---------------------------------------------------------------------------

describe("硬闸与 FR-24 用户确认", () => {
  const okReport = verifyResumeGrounding({
    candidateText: GROUNDED.map((s) => `- ${s.candidate}`).join("\n"),
    sources: SOURCES,
  });

  it("全部回指成功时 groundedText 可用，但核验器本身 accepted 恒为 false", () => {
    expect(okReport.ok).toBe(true);
    expect(okReport.accepted).toBe(false);
    expect(okReport.groundedText).toBe(normalizeCandidateText(GROUNDED.map((s) => `- ${s.candidate}`).join("\n")));
  });

  it("任何一句被拒 → groundedText 为 null，acceptGroundedRewrite 抛错（不可当 warning 忽略）", () => {
    const report = verifyResumeGrounding({
      candidateText: "参与了对30名用户的访谈。上线了内部工具原型。",
      sources: SOURCES,
    });
    expect(report.ok).toBe(false);
    expect(report.groundedText).toBeNull();
    expect(() =>
      acceptGroundedRewrite(report, { userConfirmed: true, confirmedText: "x" }),
    ).toThrow(GroundingNotAcceptedError);
    try {
      acceptGroundedRewrite(report, { userConfirmed: true, confirmedText: "x" });
    } catch (error) {
      const e = error as GroundingNotAcceptedError;
      expect(e.rejectedVerdicts.map((v) => v.statement)).toEqual(["上线了内部工具原型"]);
    }
  });

  it("FR-24：没有 caller-supplied 用户确认标志就拿不到 accepted:true", () => {
    const noNod = { userConfirmed: false, confirmedText: okReport.groundedText ?? "" } as unknown as Parameters<
      typeof acceptGroundedRewrite
    >[1];
    expect(() => acceptGroundedRewrite(okReport, noNod)).toThrow(/用户确认/);
    const confirmed = acceptGroundedRewrite(okReport, {
      userConfirmed: true,
      confirmedText: okReport.groundedText!,
      note: "逐条看过",
    });
    expect(confirmed.accepted).toBe(true);
    expect(confirmed.text).toBe(okReport.groundedText);
    expect(confirmed.version).toBe(CITATION_VERIFIER_VERSION);
  });

  it("FR-24：确认的文本与核验通过的文本不一致（调包）→ 拒收", () => {
    expect(() =>
      acceptGroundedRewrite(okReport, {
        userConfirmed: true,
        confirmedText: `${okReport.groundedText}\n- 我主导了千万级项目`,
      }),
    ).toThrow(/不一致/);
  });
});

// ---------------------------------------------------------------------------
// 动作词纪律：编码成数据、可评审
// ---------------------------------------------------------------------------

describe("判定数据表纪律", () => {
  it("已知编造形状逐条在表内（FR-23 禁令清单）", () => {
    const ids = FABRICATION_RULES.map((r) => r.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "interview-not-synthesis", // 访谈 conducted ≠ 归纳需求
        "prototype-not-clickable", // 原型 built ≠ 可点击
        "prototype-not-shipped", // 未上线 ≠ 已上线
        "participate-not-lead", // 参与 ≠ 主导
        "no-feedback-fabricated", // 没提反馈 ≠ 没有反馈
        "no-testing-fabricated", // 未上线 ≠ 没有用户测试
      ]),
    );
  });

  it("蕴含表只收弱化方向：候选词必须是限定/从属动作，依据词必须更强", () => {
    // 边界规则：只允许 主导→参与/负责、负责→协助；表里不得出现 参与→主导 这类升级。
    const WEAKENING_TERMS = ["参与", "协助", "配合", "负责"];
    const STRONGER_TERMS = ["主导", "牵头", "带领", "独立负责", "操盘", "负责"];
    for (const p of ALLOWED_ACTION_PATTERNS) {
      expect(WEAKENING_TERMS).toContain(p.candidateTerm);
      expect(STRONGER_TERMS).toContain(p.entailedBySourceTerm);
    }
    const escalating = ALLOWED_ACTION_PATTERNS.filter((p) => /主导|牵头|带领|独立负责|操盘/.test(p.candidateTerm));
    expect(escalating).toHaveLength(0);
    // 限定词表覆盖 prompt 点名的编造形状：未/没有/计划/参与。
    expect(QUALIFIER_TOKENS.NEG).toEqual(expect.arrayContaining(["未", "没有", "没"]));
    expect(QUALIFIER_TOKENS.HEDGE).toContain("计划");
    expect(QUALIFIER_TOKENS.ROLE).toContain("参与");
  });

  it("护栏指纹输入带版本号与全部表 id（route 接线用）", () => {
    expect(CITATION_VERIFIER_GUARD_INPUT.version).toBe(CITATION_VERIFIER_VERSION);
    expect(CITATION_VERIFIER_GUARD_INPUT.fabricationRuleIds).toHaveLength(FABRICATION_RULES.length);
    expect(CITATION_VERIFIER_GUARD_INPUT.gapAllowlist).toEqual([...GAP_ALLOWLIST]);
    expect(new Set(CITATION_VERIFIER_GUARD_INPUT.actionVocab).size).toBe(ACTION_VOCAB.length);
  });
});

// ---------------------------------------------------------------------------
// 限定词 / 否定 / 跨类替换 / 数字真实但经历编造
// ---------------------------------------------------------------------------

describe("否定与 hedge 保留", () => {
  it("计划做测试 → 没有做过测试：跨类替换（HEDGE→NEG）判负", () => {
    const verdict = firstVerdict(verifyResumeGrounding({ candidateText: "原型没有做过用户测试", sources: SOURCES }));
    expect(verdict.status).toBe("rejected");
  });

  it("「上线」是「没有上线」的子串：逐字覆盖放行不了限定词丢失", () => {
    const report = verifyResumeGrounding({ candidateText: "内部工具已上线", sources: SOURCES });
    expect(report.ok).toBe(false);
  });

  it("来源显式写了否定 → 候选保留否定词可放行（材料写了≠编造）", () => {
    const verdict = firstVerdict(verifyResumeGrounding({ candidateText: "没有收到用户反馈", sources: SOURCES }));
    expect(verdict.status === "grounded" || (verdict.status === "rejected" && verdict.ruleId.startsWith("qualifier"))).toBe(true);
    // claim-3 显式写了「目前还没有收到反馈」，所以这句是被支持的。
    expect(verdict.status).toBe("grounded");
  });

  it("数字没造假不等于经历真实：30 名用户是真的，但「计划访谈」不是「访谈过」", () => {
    const verdict = firstVerdict(verifyResumeGrounding({ candidateText: "对30名用户做了访谈", sources: SOURCES }));
    expect(verdict.status).toBe("rejected");
  });
});

// ---------------------------------------------------------------------------
// 截断/换字（项目实测「已上线腾/腾活」翻车形状）
// ---------------------------------------------------------------------------

describe("文字完整性（截断换字）", () => {
  it("悬挂尾标点 → broken_tail", () => {
    const verdict = firstVerdict(verifyResumeGrounding({ candidateText: "周活约10，已上线，", sources: SOURCES }));
    expect(verdict.status).toBe("rejected");
    if (verdict.status === "rejected") expect(verdict.reason).toBe("broken_tail");
  });

  it("换字「腾活」凑不出逐字证据 → 判负", () => {
    const verdict = firstVerdict(verifyResumeGrounding({ candidateText: "腾活约10", sources: SOURCES }));
    expect(verdict.status).toBe("rejected");
    if (verdict.status === "rejected") {
      expect(verdict.reason).toBe("no_exact_substring");
      expect(verdict.offendingSpan.text).toContain("腾");
    }
  });

  it("括号未闭合 → broken_tail", () => {
    const verdict = firstVerdict(verifyResumeGrounding({ candidateText: "负责后端接口开发（实习", sources: SOURCES }));
    expect(verdict.status).toBe("rejected");
    if (verdict.status === "rejected") expect(verdict.reason).toBe("broken_tail");
  });
});

// ---------------------------------------------------------------------------
// 引用标记 / 蕴含改写 / 中文匹配纪律
// ---------------------------------------------------------------------------

describe("引用与蕴含", () => {
  it("[sourceId] 引用不存在的来源 → unknown_source_citation", () => {
    const verdict = firstVerdict(verifyResumeGrounding({ candidateText: "参与需求讨论[claim-9]", sources: SOURCES }));
    expect(verdict.status).toBe("rejected");
    if (verdict.status === "rejected") expect(verdict.reason).toBe("unknown_source_citation");
  });

  it("[sourceId] 引用存在时只许回指该来源（跨来源拼接不算）", () => {
    const verdict = firstVerdict(verifyResumeGrounding({ candidateText: "参与需求讨论[claim-1]", sources: SOURCES }));
    expect(verdict.status).toBe("rejected");
  });

  it("弱化蕴含改写：来源写「主导」，候选写「参与」可放行；没有依据来源则判负", () => {
    const leadSource: GroundingSource[] = [{ id: "claim-lead", text: "我主导了后台数据报表的重构。" }];
    const ok = firstVerdict(verifyResumeGrounding({ candidateText: "参与了后台数据报表的重构", sources: leadSource }));
    expect(ok.status).toBe("grounded");
    if (ok.status === "grounded") {
      expect(ok.evidences.some((e) => e.kind === "entailment" && e.sourceEvidence === "主导")).toBe(true);
    }
    const bad = firstVerdict(verifyResumeGrounding({ candidateText: "参与了后台数据报表的重构", sources: SOURCES }));
    expect(bad.status).toBe("rejected");
  });

  it("语序重排但片段逐字可回指 → 放行；材料外新词（分词级松散匹配）一律拒", () => {
    const reorder = firstVerdict(verifyResumeGrounding({ candidateText: "小程序周活约10，负责后端接口开发", sources: SOURCES }));
    expect(reorder.status).toBe("grounded");
    const loose = firstVerdict(verifyResumeGrounding({ candidateText: "负责用户增长与需求分析", sources: SOURCES }));
    expect(loose.status).toBe("rejected");
  });
});

// ---------------------------------------------------------------------------
// 空输入 / 边界
// ---------------------------------------------------------------------------

describe("边界", () => {
  it("空候选、空来源不崩，且空候选不可放行（0 句 ≠ 通过）", () => {
    expect(verifyResumeGrounding({ candidateText: "", sources: SOURCES }).ok).toBe(false);
    expect(verifyResumeGrounding({ candidateText: "参与需求讨论", sources: [] }).ok).toBe(false);
  });

  it("多句报告统计正确", () => {
    const report = verifyResumeGrounding({
      candidateText: "参与需求讨论。主导了对30名用户的访谈。负责后端接口开发。",
      sources: SOURCES,
    });
    expect(report.stats.statements).toBe(3);
    expect(report.stats.grounded).toBe(2);
    expect(report.stats.rejected).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 性能：一页简历单轮核验毫秒数（验收要求给出实测值）
// ---------------------------------------------------------------------------

describe("性能", () => {
  it("一页简历（≈30 行原文来源 + 12 条 bullet 候选）单轮 < 100ms", () => {
    const fullResume = [
      "教育背景：某大学 信息管理系统 本科 2019-2023。主修数据库原理、统计学。",
      "实习：某电商平台 产品部 2022.6-2022.9。参与需求讨论，记录评审结论。",
      "项目：AI Job Coach 校园二手交易小程序。周活约10，负责后端接口开发。",
      "技能：SQL 查询、Excel 数据透视表、Axure 画原型。",
      "技能补充：Python 基础语法、熟悉 Git 协作流程、了解 A/B 测试基本概念。",
      "校园经历：学生会信息化组组员，参与过校园二手交易活动的现场支持。",
    ].join("\n");
    const sources: GroundingSource[] = [
      ...SOURCES,
      { id: "resume-full", text: fullResume },
    ];
    const bullets = [
      "- 参与了对30名用户的访谈，并记录了他们的原话",
      "- 搭建了内部工具的原型，仅在本机运行",
      "- 计划后续对原型做用户测试，目前还没有收到反馈",
      "- 校园二手交易小程序周活约10，负责后端接口开发",
      "- 参与需求讨论",
      "- SQL 查询",
      "- 参与过校园二手交易活动的现场支持",
      "- 记录评审结论",
      "- 熟悉 Git 协作流程",
      "- 了解 A/B 测试基本概念",
      "- 主修数据库原理、统计学",
      "- 学生会信息化组组员",
    ];
    const onePageCandidates = bullets.join("\n");
    const startedAt = process.hrtime.bigint();
    const report = verifyResumeGrounding({ candidateText: onePageCandidates, sources });
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    // eslint-disable-next-line no-console
    console.log(
      `[W3 性能] 候选 ${onePageCandidates.length} 字（${report.stats.statements} 句）/ 来源 ${sources.reduce((n, s) => n + s.text.length, 0)} 字：` +
        `wall=${elapsedMs.toFixed(2)}ms, stats.durationMs=${report.stats.durationMs}`,
    );
    expect(report.ok).toBe(true);
    expect(elapsedMs).toBeLessThan(100);
    // 顺带钉住「表外动词」的形状：来源只写了「SQL 查询」，候选补出「使用…做数据整理」
    // 这类没发生过的动作，会被逐字覆盖直接拒（FR-2 的宽松匹配教训）。
    const embellished = verifyResumeGrounding({
      candidateText: "使用SQL 查询做数据整理",
      sources,
    });
    expect(embellished.ok).toBe(false);
  });
});
