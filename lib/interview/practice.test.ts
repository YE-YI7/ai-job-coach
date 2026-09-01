import { evaluateQuickPractice } from "./practice";
import { callLLM } from "@/lib/llm";

jest.mock("@/lib/llm", () => ({ callLLM: jest.fn() }));

describe("evaluateQuickPractice", () => {
  beforeEach(() => jest.clearAllMocks());

  test("returns a bounded, structured coaching result", async () => {
    (callLLM as jest.Mock).mockResolvedValue(JSON.stringify({
      verdict: "证据不足",
      summary: "回答说明了方法，但没有说明个人动作和验证结果。",
      strengths: ["说明了评测目标"],
      gaps: ["缺个人动作", "缺结果指标"],
      followUp: "你具体定义了哪一个指标？",
      improvedOutline: ["先给结论", "说明个人动作", "补充结果"],
    }));

    await expect(evaluateQuickPractice({
      question: "如何判断模型效果变好？",
      answer: "我们做了人工抽检。",
      jobDescription: "负责模型评测",
      resumeText: "搭建评测流程",
    })).resolves.toEqual(expect.objectContaining({
      verdict: "证据不足",
      gaps: ["缺个人动作", "缺结果指标"],
      followUp: "你具体定义了哪一个指标？",
    }));
  });

  test("rejects incomplete model output instead of showing fake feedback", async () => {
    (callLLM as jest.Mock).mockResolvedValue("Hello");
    await expect(evaluateQuickPractice({ question: "问题", answer: "回答", jobDescription: "JD", resumeText: "简历" }))
      .rejects.toThrow("AI 返回格式错误");
  });
});
