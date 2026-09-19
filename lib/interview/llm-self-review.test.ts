import { summarizeInterview } from "./llm";
import { callLLM } from "@/lib/llm";

jest.mock("@/lib/llm", () => ({ callLLM: jest.fn() }));

const llmSummaryResponse = () => JSON.stringify({
  overallScore: 80,
  grade: "B",
  strengths: ["表达清晰"],
  weaknesses: ["缺数据"],
  suggestions: ["补数据"],
  nextActions: [{ title: "补数据", reason: "缺", doneWhen: "能说出数字", priority: "high" }],
});

const assessments = [{ questionId: "q1", status: "assessed", score: 80, summary: "还行" }];

/**
 * 整轮总结的「先回应候选人自我复盘」合同：
 * 传入 candidateSelfReview 时 prompt 必须带上它并要求 AI 先回应；不传时行为与旧调用完全一致。
 */
describe("summarizeInterview with candidateSelfReview", () => {
  beforeEach(() => jest.clearAllMocks());

  test("用户的自我复盘进 prompt，system 要求 AI 先回应它", async () => {
    (callLLM as jest.Mock).mockResolvedValue(llmSummaryResponse());
    await summarizeInterview({
      jd: "JD", roundType: "业务面", assessments,
      candidateSelfReview: "问：哪题别扭\n答：第二题卡在指标口径",
    });
    const messages = (callLLM as jest.Mock).mock.calls[0][0] as Array<{ role: string; content: string }>;
    expect(messages[1].content).toContain("【候选人的自我复盘（生成点评前先读）】");
    expect(messages[1].content).toContain("第二题卡在指标口径");
    expect(messages[0].content).toContain("先回应候选人自己的判断");
  });

  test("不传自我复盘时 prompt 结构不变，旧客户端零影响", async () => {
    (callLLM as jest.Mock).mockResolvedValue(llmSummaryResponse());
    await summarizeInterview({ jd: "JD", roundType: "业务面", assessments });
    const messages = (callLLM as jest.Mock).mock.calls[0][0] as Array<{ role: string; content: string }>;
    expect(messages[1].content).not.toContain("候选人的自我复盘");
    expect(messages[0].content).not.toContain("先回应候选人自己的判断");
  });
});
