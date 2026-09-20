import {advanceStage,inferStageIntent} from "./stage-intent";

describe("inferStageIntent",()=>{
  test("recognizes explicit job-search actions",()=>{
    expect(inferStageIntent("我已经把这个岗位投了")).toBe("applied");
    expect(inferStageIntent("刚约到二面了")).toBe("interviewing");
    expect(inferStageIntent("面完一轮，感觉还行")).toBe("interviewing");
    expect(inferStageIntent("现在在谈薪阶段")).toBe("negotiating");
    expect(inferStageIntent("拿到 offer 了")).toBe("won");
  });
  test("negative phrasing does not advance the stage",()=>{
    expect(inferStageIntent("我还没投这个岗位")).toBeNull();
    expect(inferStageIntent("还没约面试呢，先练练")).toBeNull();
  });
  test("ordinary coaching questions infer nothing",()=>{
    expect(inferStageIntent("这段项目经历怎么讲更有说服力？")).toBeNull();
    expect(inferStageIntent("")).toBeNull();
  });
  test("advice-seeking and hypothetical wording never advances the stage",()=>{
    // 上线前复现过的误判：求教/假设句里的动作词不是已发生的动作。
    expect(inferStageIntent("教我怎么谈薪")).toBeNull();
    expect(inferStageIntent("如果我拿到 offer 呢？")).toBeNull();
    expect(inferStageIntent("谈薪要注意什么")).toBeNull();
    expect(inferStageIntent("万一没通过面试怎么办")).toBeNull();
  });
});

describe("advanceStage",()=>{
  test("only moves forward",()=>{
    expect(advanceStage("evaluating","applied")).toBe("applied");
    expect(advanceStage("applied","interviewing")).toBe("interviewing");
    expect(advanceStage("interviewing","applied")).toBeNull();
    expect(advanceStage("applied","applied")).toBeNull();
  });
  test("never resurrects terminal or unknown stages",()=>{
    expect(advanceStage("lost","applied" as never)).toBeNull();
    expect(advanceStage("archived","won")).toBeNull();
  });
  test("no intent means no change",()=>{
    expect(advanceStage("captured",null)).toBeNull();
  });
});
