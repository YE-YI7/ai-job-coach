/**
 * W4 接线测试：生成器与方差带评分在 llm 层的合同。
 * 模型调用全部注入/打桩——determinism 检查离线跑，不花钱。
 */

import {
  evaluateAnswerWithBand,
  generateInterviewQuestions,
  generateLinkedFollowUpQuestion,
} from "./llm";
import { callLLM } from "@/lib/llm";
import { assertScoreShipsWithExplanation, MAX_RESCORE_SPREAD, RescoreVarianceError } from "./scoring-band";
import { QuestionLineageError } from "./question-lineage";
import type { InterviewAssessment } from "./types";

jest.mock("@/lib/llm", () => ({ callLLM: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.LLM_STUB;
});

const assessedOf = (score: number): InterviewAssessment => ({
  status: "assessed",
  score,
  summary: "结构完整，证据可核",
  evidence: ["把 DAU 的定义统一成打开首页即计"],
  missingEvidence: [],
  dimensions: [{ name: "逻辑性", score, comment: "清晰" }],
  rewritePlan: [],
  followUp: "这个口径是谁拍板定的？",
});

const bandInput = {
  question: "指标口径怎么定的？",
  jd: "JD 原文",
  answer: "我在上一家公司负责过指标口径的梳理，把 DAU 的定义统一成打开首页即计。",
  roundType: "业务面" as const,
  answeringModel: "deepseek-v4.1-flash",
  reviewerModel: "kimi-k3",
  rubricAnchor: "指标口径题：口径定义+决策依据+复核方式齐全为合格线",
  workedExampleRefs: ["example-pass-01", "example-fail-03"],
};

describe("FR-28/D3：同一答案重跑 3 次的方差带（夹具驱动，模型调用注入）", () => {
  test("注入评分器跑 3 次：极差在阈值内，每个分数对象都带 ±区间与推导", async () => {
    const fixtureScores = [76, 78, 77];
    let calls = 0;
    const result = await evaluateAnswerWithBand({
      ...bandInput,
      runAssessment: async () => assessedOf(fixtureScores[calls++]),
    });

    expect(calls).toBe(3);
    expect(result.status).toBe("assessed");
    const score = assertScoreShipsWithExplanation(result.score); // 出分闸门：裸分数在这里就炸
    expect(score.derivation.rescores).toEqual([76, 78, 77]);
    expect(score.derivation.spread).toBe(2);
    expect(score.derivation.spread).toBeLessThanOrEqual(MAX_RESCORE_SPREAD);
    expect(score.band.label).toBe("±1");
    expect(score.value).toBe(77);
    expect(score.derivation.reviewerFamily).toBe("kimi");
    expect(score.derivation.answeringFamily).toBe("deepseek");
    expect(score.derivation.explanation).toContain("极差 2 分");
    expect(result.dimensions.length).toBeGreaterThan(0);
  });

  test("重跑抖动超阈值：拒发分数并如实报 RescoreVarianceError，不发不稳定分", async () => {
    const unstable = [90, 62, 75];
    let calls = 0;
    await expect(
      evaluateAnswerWithBand({ ...bandInput, runAssessment: async () => assessedOf(unstable[calls++]) }),
    ).rejects.toThrow(RescoreVarianceError);
  });

  test("首轮 needs_more_input：不重跑、不评分，score 为 null", async () => {
    let calls = 0;
    const result = await evaluateAnswerWithBand({
      ...bandInput,
      runAssessment: async () => {
        calls += 1;
        return { status: "needs_more_input", score: null, summary: "信息不足", evidence: [], missingEvidence: ["没给具体口径"], dimensions: [], rewritePlan: [], followUp: "补充？" };
      },
    });
    expect(calls).toBe(1);
    expect(result.score).toBeNull();
  });

  test("答题与评审同族：一个调用都不发（D3 前置闸门）", async () => {
    const spy = jest.fn();
    await expect(
      evaluateAnswerWithBand({
        ...bandInput,
        reviewerModel: "deepseek-v4-pro",
        runAssessment: spy,
      }),
    ).rejects.toThrow(/同族/);
    expect(spy).not.toHaveBeenCalled();
  });

  test("缺省走真评分链路时，评审调用带 reviewerModel", async () => {
    (callLLM as jest.Mock)
      .mockResolvedValueOnce(JSON.stringify({ status: "assessed", score: 70, summary: "s", evidence: ["统一成打开首页即计"], missingEvidence: [], dimensions: [{ name: "逻辑性", score: 70, comment: "ok" }], rewritePlan: [], followUp: "f" }))
      .mockResolvedValueOnce(JSON.stringify({ status: "assessed", score: 72, summary: "s", evidence: ["统一成打开首页即计"], missingEvidence: [], dimensions: [{ name: "逻辑性", score: 72, comment: "ok" }], rewritePlan: [], followUp: "f" }))
      .mockResolvedValueOnce(JSON.stringify({ status: "assessed", score: 71, summary: "s", evidence: ["统一成打开首页即计"], missingEvidence: [], dimensions: [{ name: "逻辑性", score: 71, comment: "ok" }], rewritePlan: [], followUp: "f" }));

    const result = await evaluateAnswerWithBand(bandInput);
    expect((callLLM as jest.Mock).mock.calls).toHaveLength(3);
    for (const call of (callLLM as jest.Mock).mock.calls) {
      expect(call[1].model).toBe("kimi-k3");
    }
    expect(result.score?.band.label).toBe("±1");
  });
});

describe("FR-26/FR-27：generateLinkedFollowUpQuestion 的承接合同", () => {
  const followUpBase = {
    sessionId: "s1",
    roundType: "业务面" as const,
    previousQuestionId: "q1",
    previousQuestion: "讲讲你定过的一个指标口径。",
    previousAnswer: "我在上一家公司负责过指标口径的梳理，把 DAU 的定义统一成打开首页即计。",
    contextText: "【事实·已确认】[resume-1]\n负责增长产品",
  };

  const modelFollowUp = (overrides: Record<string, unknown> = {}) => JSON.stringify({
    q: "把 DAU 统一成打开首页即计之后，谁来复核这个口径没被业务方私下改回去？",
    tips: { intent: "口径治理", keyPoints: ["复核机制"], framework: "定义→决策→复核", pitfalls: [], proTips: [] },
    sources: [
      { source: "resume", pointer: "负责增长产品" },
      { source: "knowledge", pointer: "experiment-and-metric-diagnosis" },
    ],
    linkage: {
      kind: "linked",
      previousQuestionId: "q1",
      tookFrom: ["把 DAU 的定义统一成打开首页即计"],
      linkage: "drill_missing_evidence",
      carriesForward: "上一答给出了口径动作但没说复核与治理——追问防回退机制",
    },
    ...overrides,
  });

  test("承接片段逐字命中 + 双来源 = 通过，返回带合同结构的下一题", async () => {
    (callLLM as jest.Mock).mockResolvedValue(modelFollowUp());
    const question = await generateLinkedFollowUpQuestion(followUpBase);
    expect(question.linkage.kind).toBe("linked");
    expect(question.sources.map((s) => s.source)).toEqual(["resume", "knowledge"]);
    const user = String((callLLM as jest.Mock).mock.calls[0][0][1].content);
    expect(user).toContain(followUpBase.previousAnswer); // 承接以真实回答原文为输入
  });

  test("编造承接（片段不在上一答里）：拒发该题", async () => {
    (callLLM as jest.Mock).mockResolvedValue(modelFollowUp({
      linkage: {
        kind: "linked",
        previousQuestionId: "q1",
        tookFrom: ["我把 DAU 做到了一个亿"],
        linkage: "follow_confirmed_claim",
        carriesForward: "顺着 DAU 追问",
      },
    }));
    await expect(generateLinkedFollowUpQuestion(followUpBase)).rejects.toThrow(QuestionLineageError);
  });

  test("仅由 JD 单源成立：拒发该题", async () => {
    (callLLM as jest.Mock).mockResolvedValue(modelFollowUp({
      sources: [{ source: "jd", pointer: "负责增长产品" }],
    }));
    await expect(generateLinkedFollowUpQuestion(followUpBase)).rejects.toThrow(QuestionLineageError);
  });

  test("上一题没有真实回答：一个模型调用都不发（不声称用户答过）", async () => {
    await expect(generateLinkedFollowUpQuestion({ ...followUpBase, previousAnswer: "   " })).rejects.toThrow(QuestionLineageError);
    expect(callLLM as jest.Mock).not.toHaveBeenCalled();
  });
});

describe("FR-27：批量出题的严格来源模式", () => {
  const q = { q: "问题", tips: { intent: "i", keyPoints: [], framework: "f", pitfalls: [], proTips: [] } };

  test("requireSourcing 下模型没给来源 → 整批判负", async () => {
    (callLLM as jest.Mock).mockResolvedValue(JSON.stringify([q]));
    await expect(
      generateInterviewQuestions({ jd: "JD", roundType: "业务面", count: 1, requireSourcing: true }),
    ).rejects.toThrow(QuestionLineageError);
  });

  test("requireSourcing 下双来源合规题通过并保留标注", async () => {
    (callLLM as jest.Mock).mockResolvedValue(JSON.stringify([{
      ...q,
      sources: [
        { source: "resume", pointer: "负责增长产品" },
        { source: "research", pointer: "该公司增长团队 2026-09 调研" },
      ],
    }]));
    const questions = await generateInterviewQuestions({ jd: "JD", roundType: "业务面", count: 1, requireSourcing: true });
    expect(questions[0].sources).toHaveLength(2);
  });

  test("默认宽松模式行为不变（历史链路不回归）", async () => {
    (callLLM as jest.Mock).mockResolvedValue(JSON.stringify([q]));
    const questions = await generateInterviewQuestions({ jd: "JD", roundType: "业务面", count: 1 });
    expect(questions).toHaveLength(1);
    expect(questions[0].sources).toBeUndefined();
  });

  test("stub 模板题在严格模式如实失败——不许 stub 假装完成四源组合", async () => {
    process.env.LLM_STUB = "1";
    await expect(
      generateInterviewQuestions({ jd: "JD", roundType: "业务面", count: 1, requireSourcing: true }),
    ).rejects.toThrow(QuestionLineageError);
    expect(callLLM as jest.Mock).not.toHaveBeenCalled();
  });
});
