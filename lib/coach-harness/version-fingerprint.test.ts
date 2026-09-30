import {
  GUARD_PROBE_PAYLOAD,
  HARNESS_COMPONENTS,
  TUTOR_RETRIEVAL_CONFIG,
  fingerprintDiff,
  harnessFingerprint,
} from "./version-fingerprint";

const base = { promptVersion: "learning-v5", systemPrompt: "你是益职的对话导师" };

describe("版本联合指纹（FR-34）", () => {
  test("五段都有值，同一输入两次计算完全一致", () => {
    const a = harnessFingerprint(base);
    const b = harnessFingerprint(base);
    expect(HARNESS_COMPONENTS.every((c) => /^[0-9a-f]{12}$/.test(a[c]))).toBe(true);
    expect(a).toEqual(b);
    expect(new Set(HARNESS_COMPONENTS.map((c) => a[c])).size).toBe(HARNESS_COMPONENTS.length);
  });

  test("只动提示词版本，其余四段不许跟着变", () => {
    const a = harnessFingerprint(base);
    const b = harnessFingerprint({ ...base, promptVersion: "learning-v6" });
    expect(fingerprintDiff(a, b)).toEqual(["prompt"]);
  });

  test("只动检索配置，只变检索那一段", () => {
    const a = harnessFingerprint(base);
    const b = harnessFingerprint({ ...base, retrieval: { ...TUTOR_RETRIEVAL_CONFIG, knowledgeLimit: 3 } });
    expect(fingerprintDiff(a, b)).toEqual(["retrieval"]);
  });

  test("同时动两个组件要被抓出来——这种两版不许直接比分数", () => {
    const a = harnessFingerprint(base);
    const b = harnessFingerprint({
      ...base,
      promptVersion: "learning-v6",
      retrieval: { ...TUTOR_RETRIEVAL_CONFIG, task: "career_coaching" },
    });
    expect(fingerprintDiff(a, b).sort()).toEqual(["prompt", "retrieval"]);
    expect(a.combined).not.toBe(b.combined);
  });

  test("模型路由段跟着真实选路结果走，不是自报的版本号", () => {
    // 探针里含代码/RAG 问法：路由表把它交给 glm-5.3，改了分诊正则这一段就会变。
    const a = harnessFingerprint(base);
    const b = harnessFingerprint({ ...base, systemPrompt: base.systemPrompt + " " });
    expect(fingerprintDiff(a, b)).toEqual(["prompt"]);
    expect(a.modelRoute).not.toBe(a.knowledge);
  });

  test("护栏段带行为探针：槽4 词表与槽2 阈值的裁决真有判别力", () => {
    // 探针不是自选的样例：正例必须命中、问句/假设句必须不命中。
    // 把「教我」「如果」这类反向信号从词表里删掉，这组期望立刻变红。
    expect(GUARD_PROBE_PAYLOAD.stageIntent).toEqual([
      ["我投了字节的产品岗", "applied"],
      ["教我怎么谈薪", null],
      ["刚拿到 offer", "won"],
      ["还没投递", null],
      ["约了三面，聊得还行", "interviewing"],
      ["如果拿到 offer 呢？", null],
    ]);
    // 「只前进不后退」：倒退与终态一律不写。
    expect(GUARD_PROBE_PAYLOAD.stageAdvance.map(([current, intent, next]) => [`${current}→${intent}`, next])).toEqual([
      ["captured→applied", "applied"],
      ["applied→interviewing", "interviewing"],
      ["interviewing→evaluating", null],
      ["won→applied", null],
    ]);
    // 六份重复要停；四份（最大粒度下的两份）不该停；复读中间推进了新内容也不该停。
    expect(GUARD_PROBE_PAYLOAD.repetition).toEqual(["block", "pass", "pass"]);
  });
});
