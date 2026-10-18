// Authored demonstration data. None of these records represents a real user or model run.
export const samples = {
  schemaVersion: "yizhi.eval/v1",
  runs: [
    {
      id: "demo-quality-01",
      label: "电商运营 · 整稿质量不足",
      provenance: "synthetic",
      startedAt: "2026-10-17T23:30:00Z",
      status: "completed",
      durationMs: 34800,
      input: {
        resume:
          "林小禾\n求职方向：电商运营\n实习经历\n协助商品上架，整理120条商品资料；每周用Excel汇总订单和退货原因，交给运营同事复盘。参与客户咨询处理，团队当月完成80笔订单。\n自我评价\n具备出色的分析能力和团队协作能力，积极主动，结果导向。",
        jobDescription: "",
        instruction: "已有事实先改；不把协助改成主导，不编改善幅度。",
      },
      spans: [
        {
          id: "context",
          name: "材料与上下文",
          kind: "stage",
          status: "completed",
          durationMs: 90,
          input: { mode: "general_resume", attachments: 1 },
          output: { resumeIncluded: true, jobDescriptionProvided: false },
        },
        {
          id: "retrieval",
          name: "知识检索",
          kind: "stage",
          status: "completed",
          durationMs: 180,
          input: { query: "应届生，运营助理，电商与数据整理" },
          output: {
            methodIds: ["resume-factual-rewriting"],
            exampleIds: ["teaching-operations-example"],
            excludedIds: [],
          },
        },
        {
          id: "draft",
          name: "改稿 Agent",
          agent: "改稿 Agent",
          kind: "agent",
          status: "completed",
          durationMs: 19300,
          input: {
            task: "用已有事实改善表达",
            factBoundaries: ["本人协助上架", "团队80笔订单不等于本人独立结果"],
            knowledgeIds: [
              "resume-factual-rewriting",
              "teaching-operations-example",
            ],
          },
          output: {
            changes: [
              {
                before: "参与客户咨询处理，团队当月完成80笔订单。",
                after: "协助处理客户咨询，所在团队当月完成80笔订单。",
                reason: "保持责任与团队结果边界",
              },
            ],
          },
        },
        {
          id: "review",
          name: "独立质检 Agent",
          agent: "独立质检 Agent",
          kind: "agent",
          status: "completed",
          durationMs: 9200,
          input: {
            scope: "逐条建议",
            checks: ["事实边界", "责任强度", "引用对应"],
          },
          output: {
            passed: true,
            reason: "这条改写没有增加个人业绩。",
            limitation: "未审查整份简历的信息取舍与自我评价。",
          },
        },
        {
          id: "save",
          name: "结果保存",
          kind: "stage",
          status: "completed",
          durationMs: 220,
          input: { changes: 1 },
          output: { saved: true },
        },
        {
          id: "self",
          name: "LLM 整稿自评",
          agent: "LLM 自评",
          kind: "agent",
          status: "completed",
          durationMs: 5810,
          input: { scope: "完整成稿与原稿对照" },
          output: {
            score: 45,
            problemType: "quality",
            reason:
              "仅调整一条责任措辞，自我评价空话仍然保留，关键动作没有形成清楚的短 bullet。",
          },
        },
      ],
      knowledge: [
        {
          id: "resume-factual-rewriting",
          title: "用已有事实写清贡献",
          kind: "method",
          included: true,
          reason: "适用于普通简历与无 JD 改稿",
          excerpt: "每条 bullet 讲一件主要贡献。缺少一项指标不阻塞其他段落。",
        },
        {
          id: "teaching-operations-example",
          title: "相近背景教学样例 · 运营助理",
          kind: "example",
          included: true,
          similarity: 0.76,
          reason: "实习阶段、运营任务、表格交付相近；仅参考写法，不移植经历。",
        },
      ],
      result: {
        status: "completed",
        output:
          "林小禾\n求职方向：电商运营\n\n实习经历\n协助商品上架，整理120条商品资料；每周用Excel汇总订单和退货原因，交给运营同事复盘。\n协助处理客户咨询，所在团队当月完成80笔订单。\n\n自我评价\n具备出色的分析能力和团队协作能力，积极主动，结果导向。",
        nextAction: "重新审查整稿主次，先处理已有事实，不必要求用户补数字。",
      },
      ruleQuality: {
        score: 100,
        grounding: true,
        independentReview: true,
        shortBullets: true,
        ats: true,
      },
      evaluation: {
        source: "llm_self_eval",
        model: "演示模型 · 非真实调用",
        score: 45,
        maxScore: 100,
        rubricVersion: "demo-whole-document-v1",
        reason:
          "逐条事实检查通过，但整份简历的改善有限。仅把“参与”调整成“协助”，没有处理长段结构；“出色的分析能力”等自评仍缺少具体信息。已有120条资料与周报用途足以先改，不应再拿缺指标阻塞交付。",
        problemType: "quality",
        missingInformation: [],
        criteria: [
          {
            name: "事实忠实",
            score: 25,
            maxScore: 25,
            reason: "保留协助与团队结果限定。",
          },
          {
            name: "改稿价值",
            score: 6,
            maxScore: 30,
            reason: "局部换词，没有形成实质结构改善。",
          },
          {
            name: "信息取舍",
            score: 5,
            maxScore: 25,
            reason: "泛化自评仍占据篇幅。",
          },
          {
            name: "清楚与简洁",
            score: 9,
            maxScore: 20,
            reason: "密集动作仍放在长段中。",
          },
        ],
      },
    },
    {
      id: "demo-detail-02",
      label: "校园项目 · 待补一个细节",
      provenance: "synthetic",
      status: "needs_detail",
      durationMs: 18400,
      input: {
        resume: "校园活动项目：参与线上宣传，协助团队完成活动。",
        jobDescription: "",
      },
      spans: [
        {
          id: "d1",
          name: "改稿 Agent",
          kind: "agent",
          agent: "改稿 Agent",
          status: "completed",
          durationMs: 13200,
          input: { known: "参与宣传，不清楚具体动作" },
          output: {
            safeChanges: [],
            question: "你在这次线上宣传中，具体做了哪一件事？",
          },
        },
        {
          id: "d2",
          name: "导师逐问",
          kind: "stage",
          status: "needs_detail",
          durationMs: 0,
          input: { asked: 1 },
          output: {
            question: "你在这次线上宣传中，具体做了哪一件事？",
            next: "等用户回答；不同时追问渠道、人数和转化率。",
          },
        },
      ],
      knowledge: [
        {
          id: "resume-progressive-discovery",
          title: "一次只补一个问题",
          included: true,
          kind: "method",
        },
      ],
      result: {
        status: "needs_detail",
        output: {
          preservedOriginal: true,
          question: "你在这次线上宣传中，具体做了哪一件事？",
        },
      },
      evaluation: {
        source: "llm_self_eval",
        model: "演示模型 · 非真实调用",
        score: 38,
        maxScore: 100,
        reason:
          "这段只有参与表述，尚未知道本人具体动作。没有编造结果；下一步只问本人做过的一件事。分数评价本次产物完整度，不评价用户能力。",
        problemType: "missing_information",
        missingInformation: ["用户在宣传中亲自完成的一项动作"],
        criteria: [],
      },
    },
    {
      id: "demo-failure-03",
      label: "研发实习 · 事实校验拦截",
      provenance: "synthetic",
      status: "blocked",
      durationMs: 21500,
      input: { resume: "协助测试接口，整理测试记录。没有负责后端开发。" },
      spans: [
        {
          id: "f1",
          name: "改稿 Agent",
          agent: "改稿 Agent",
          kind: "agent",
          status: "completed",
          durationMs: 17300,
          input: { resume: "协助测试接口，整理测试记录。没有负责后端开发。" },
          output: { after: "负责后端接口开发和质量保障。" },
        },
        {
          id: "f2",
          name: "事实校验",
          kind: "stage",
          status: "blocked",
          durationMs: 120,
          input: { candidate: "负责后端接口开发和质量保障。" },
          output: {
            code: "responsibility_escalation",
            reason: "协助测试被改成负责开发，超出材料。原文保持不变。",
          },
        },
      ],
      knowledge: [],
      result: {
        status: "blocked",
        output: null,
        error: "改写拔高责任，未采纳；原材料保留。",
      },
      evaluation: {
        source: "llm_self_eval",
        model: "演示模型 · 非真实调用",
        score: 12,
        maxScore: 100,
        reason:
          "模型将测试协助误写为后端开发负责人。材料本身足以安全精简；失败来自生成与校验，不应要求用户补不存在的开发经历。",
        problemType: "grounding",
        groundingVeto: true,
        missingInformation: [],
        criteria: [],
      },
    },
  ],
};
