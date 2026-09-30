import {insufficiencyFromTrace,turnIntervention} from "./tutor-intervention";

describe("insufficiencyFromTrace", () => {
  test("reads the guard block out of a turn's learning_trace", () => {
    expect(insufficiencyFromTrace({insufficiency: {level: "blocking", blocked: true}})).toEqual({level: "blocking", blocked: true});
  });
  test("tolerates missing garbage traces (old turns, demo rows)", () => {
    expect(insufficiencyFromTrace(null)).toBeNull();
    expect(insufficiencyFromTrace("nope")).toBeNull();
    expect(insufficiencyFromTrace({model: "glm-5.3"})).toBeNull();
  });
});

describe("turnIntervention", () => {
  test("拦截且收敛过长答：小注说明长回答被收住", () => {
    const note = turnIntervention({level: "blocking", blocked: true, needsMoreInput: true, collapsed: true});
    expect(note!.kind).toBe("blocked");
    expect(note!.text).toContain("把长回答先收住");
  });
  test("拦截但本就短：只说先问清一件事，不提收敛", () => {
    const note = turnIntervention({level: "blocking", blocked: true, collapsed: false})!;
    expect(note.kind).toBe("blocked");
    expect(note.text).toContain("先问清");
    expect(note.text).not.toContain("收住");
  });
  test("needsMoreInput 单独出现也算拦截", () => {
    expect(turnIntervention({needsMoreInput: true})!.kind).toBe("blocked");
  });
  test("误拦降级（索要已有文档）：说不再重复索要", () => {
    const note = turnIntervention({level: "blocking", blocked: false, downgradedRedundantAsk: "document_handover"})!;
    expect(note.kind).toBe("no-repeat-ask");
    expect(note.text).toContain("不再重复索要");
  });
  test("误拦降级（问已写明的事实）：说法不同", () => {
    const note = turnIntervention({level: "blocking", blocked: false, downgradedRedundantAsk: "stated_in_material"})!;
    expect(note.text).toContain("已经写了");
  });
  test("部分作答：小注指向正文末尾的补充提示", () => {
    const note = turnIntervention({level: "partial", blocked: false})!;
    expect(note.kind).toBe("answered-partially");
    expect(note.text).toContain("先答");
  });
  test("拦截优先于降级优先于部分作答，每轮只出一条", () => {
    const note = turnIntervention({level: "blocking", blocked: true, downgradedRedundantAsk: null})!;
    expect(note.kind).toBe("blocked");
  });
  test("无守卫介入的普通轮：不给任何小注（正文优先，不做告警面板）", () => {
    expect(turnIntervention(null)).toBeNull();
    expect(turnIntervention({level: null, blocked: false, claimsHedged: 0})).toBeNull();
  });
  test("只有待确认标注时不加小注——（待你确认）已就地写在正文里", () => {
    expect(turnIntervention({claimsHedged: 2})).toBeNull();
  });
});
