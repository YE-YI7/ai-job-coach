
import { reviseOutcome, validateOutcome, extractOutcomeTag, outcomeFromModel, type LearningOutcome } from "./learning-outcome";

const SESSION = "11111111-1111-1111-1111-111111111111";
const TURN = "22222222-2222-2222-2222-222222222222";
const base = (over: Partial<LearningOutcome> = {}): Partial<LearningOutcome> => ({
  sessionId: SESSION, goal: "说明考察目标如何传给追问 Agent", criterionVersion: 1,
  attemptTurnIds: [TURN], answerDraft: "出题 Agent 同时输出题目与目标。", observedStatus: "提示下完成",
  evidenceRefs: [`turn:${TURN}`], openIssue: "尚未观察独立迁移", nextStep: "换客服场景自己设计输入字段",
  revision: 1, status: "saved", ...over,
});

test("没有本人尝试就不给表现判断", () => {
  const result = validateOutcome(base({ attemptTurnIds: [] }));
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error).toContain("还没有你自己的尝试");
});

test("只说懂了可以存，但只记未独立检验", () => {
  const result = validateOutcome(base({ observedStatus: "未独立检验", evidenceRefs: [] }));
  expect(result.ok && result.outcome.observedStatus).toBe("未独立检验");
});

test("不标状态按最保守的一档处理", () => {
  const result = validateOutcome(base({ observedStatus: undefined }));
  expect(result.ok && result.outcome.observedStatus).toBe("未独立检验");
});

test("完成过的判断必须能回查来源", () => {
  for (const observedStatus of ["提示下完成", "独立完成过"] as const) {
    const result = validateOutcome(base({ observedStatus, evidenceRefs: [] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("回查");
  }
});

test("目标与正文不能空着，长度按现有笔记上限", () => {
  expect(validateOutcome(base({ goal: "  " })).ok).toBe(false);
  expect(validateOutcome(base({ answerDraft: "" })).ok).toBe(false);
  expect(validateOutcome(base({ answerDraft: "长".repeat(6001) })).ok).toBe(false);
});

test("版本字段缺失或非法一律拒，避免覆盖别人的成果", () => {
  expect(validateOutcome(base({ revision: 0 })).ok).toBe(false);
  expect(validateOutcome(base({ revision: 1.5 })).ok).toBe(false);
  expect(validateOutcome(base({ criterionVersion: undefined })).ok).toBe(false);
  expect(validateOutcome(base({ status: "archived" as LearningOutcome["status"] })).ok).toBe(false);
});

test("sessionId 只接受合法 UUID，客户端乱给就清空由落库方填", () => {
  const result = validateOutcome(base({ sessionId: "other-user" }));
  expect(result.ok && result.outcome.sessionId).toBe("");
});

test("过滤掉非本轮的伪造成引用，真引用按顺序留下", () => {
  const result = validateOutcome(base({ attemptTurnIds: [TURN, "not-a-uuid"] }));
  expect(result.ok && result.outcome.attemptTurnIds).toEqual([TURN]);
});

test("用户手写修改升内容版本，不动能力证据", () => {
  const saved = validateOutcome(base()) as { ok: true; outcome: LearningOutcome };
  const revised = reviseOutcome(saved.outcome, "  我自己重写的一版答案  ");
  expect(revised).toMatchObject({ revision: 2, status: "draft", answerDraft: "我自己重写的一版答案", observedStatus: "提示下完成", criterionVersion: 1 });
});

describe("§8.2：成果草稿是独立最终事件，校验不过就不展示卡片", () => {
  const evidence = { sessionId: SESSION, attempts: [TURN], answerDraft: "我自己答的一版：先写目标再拆工具。", goal: "说清 Agent 分工的判据", criterionVersion: 1, scenarioAudited: true };

  test("标签从正文里剥离，三个字段之外的内容一概不读", () => {
    const raw = `先说结论。\n<outcome>{"observedStatus":"提示下完成","openIssue":"还没观察迁移","nextStep":"换个场景再答一次","answerDraft":"导师示范的答案","attemptTurnIds":["fake"]}</outcome>`;
    const tag = extractOutcomeTag(raw);
    expect(tag.text).toBe("先说结论。");
    expect(tag.malformed).toBe(false);
    expect(tag.draft).toEqual({ observedStatus: "提示下完成", openIssue: "还没观察迁移", nextStep: "换个场景再答一次" });
  });

  test("漏写闭合标签时内部 JSON 不外露", () => {
    const tag = extractOutcomeTag('正文。<outcome>{"observedStatus":"未独立检验"');
    expect(tag.text).toBe("正文。");
    expect(tag.draft).toBeNull();
    expect(tag.malformed).toBe(true);
  });

  test("标签内不是 JSON：本轮不形成成果，但正文照旧", () => {
    const tag = extractOutcomeTag('正文。<outcome>说不上来</outcome>');
    expect(tag.text).toContain("正文。");
    expect(tag.malformed).toBe(true);
  });

  test("模型自己写的用户答案进不了成果：正文只用服务端那份", () => {
    const built = outcomeFromModel({ observedStatus: "提示下完成", openIssue: null, nextStep: null }, { ...evidence, answerDraft: "我自己的原话" });
    expect(built.ok && (built as { outcome: LearningOutcome }).outcome.answerDraft).toBe("我自己的原话");
  });

  test("没有本人尝试就不出卡片，话要说清「存笔记记下的是读过」", () => {
    const built = outcomeFromModel({ observedStatus: "提示下完成", openIssue: null, nextStep: null }, { ...evidence, attempts: [] });
    expect(built).toMatchObject({ ok: false, code: "no_attempt" });
    if (!built.ok) expect(built.copy).toContain("读过");
  });

  test("拿不到用户原话时同样不出卡片，正文保留", () => {
    const built = outcomeFromModel({ observedStatus: "未独立检验", openIssue: null, nextStep: null }, { ...evidence, answerDraft: "  " });
    expect(built).toMatchObject({ ok: false, code: "empty_draft" });
  });

  test("「独立完成过」在本链路一律降档，并说明为什么", () => {
    const built = outcomeFromModel({ observedStatus: "独立完成过", openIssue: null, nextStep: null }, evidence);
    expect(built.ok).toBe(true);
    if (built.ok) {
      expect(built.outcome.observedStatus).toBe("提示下完成");
      expect(built.note).toContain("提示之后作答");
    }
  });

  test("场景没评过就明说不是达标；评过就不多这句", () => {
    const unaudited = outcomeFromModel({ observedStatus: "未独立检验", openIssue: null, nextStep: null }, { ...evidence, scenarioAudited: false });
    expect(unaudited.ok && (unaudited as { note: string | null }).note).toContain("不代表其他题目或岗位能力已达标");
    const audited = outcomeFromModel({ observedStatus: "未独立检验", openIssue: null, nextStep: null }, evidence);
    expect(audited.ok && audited.note).toBeNull();
  });

  test("卡片两句自由文案不许夹带能力结论", () => {
    const built = outcomeFromModel({ observedStatus: "未独立检验", openIssue: "你已经掌握了这一块", nextStep: "已确认无误" }, evidence);
    expect(built.ok).toBe(true);
    if (built.ok) {
      expect(built.outcome.openIssue).toBeNull();
      expect(built.outcome.nextStep).toBeNull();
    }
  });

  test("回查锚点指向用户本人的轮次与标准版本", () => {
    const built = outcomeFromModel({ observedStatus: "提示下完成", openIssue: null, nextStep: null }, { ...evidence, attempts: [TURN, "not-a-uuid"] });
    expect(built.ok && built.outcome.evidenceRefs).toEqual([`turn:${TURN}`, "criterion:v1"]);
    expect(built.ok && built.outcome.attemptTurnIds).toEqual([TURN]);
  });
});
