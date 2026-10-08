/**
 * 发布质量集 v1（PRD 2026-10-08 §9.1、§9.3）。
 *
 * 分层是这份文件的重点：**能确定性判定的部分先跑，判不了的部分如实标 missing**。
 * - `structure`：只依赖筛选与分组规则，同批材料本地重放即可复现，不进模型、不出网。
 * - `content`：要看「依据是否真的对应职责、反馈是否针对用户这次尝试」，必须过模型 + 人工 0/1/2 打分。
 * 把 content 层用规则糊成"通过"，等于用自检数字冒充用户效果；所以这一层只登记、不判定。
 *
 * 门禁口径：structure 层失败 = 阻断；content 层 missing = 未过发布门，但不伪装成 0 分。
 */
import { matchJobs, type DiscoveredJob } from "@/lib/jobs/discovery";
import { applyRetrievalGate, profileHardFields, splitSavedJobs, trackedJobUrls } from "@/lib/jobs/retrieval-gate";
import { applyVerificationGate } from "@/lib/jobs/verification-gate";
import { assessmentPool, matchesRequestedSeniority, matchesRequestedSpecialty, resumeEvidence } from "@/lib/jobs/personalization";
import { deriveEligibility } from "@/lib/jobs/review-contract";
import { groupCandidates } from "@/lib/jobs/result-presentation";

export const QUALITY_PACK_VERSION = "release-quality-v1";

export type CaseLayer = "structure" | "content";
export type EligibilityState = "pass" | "unknown" | "conflict";

export interface CaseProfile {
  role: string;
  location: string;
  resume: string;
  /** 已跟踪岗位（JD 里的「来源：」行），用于库里比对。 */
  savedJdTexts?: string[];
  /** 面板点过的目标档位；本版结构层不判档位剔除，留作字段完整性。 */
  targetTiers?: string[];
}

export interface StructureExpectation {
  /** 必须进入评审池的岗位 id。 */
  mustBeOffered?: string[];
  /** 绝不能进入评审池：已知资格冲突、职级不符、方向不符、已跟踪。 */
  mustNotBeOffered?: string[];
  /** 必须落到「暂不合适」折叠组，且给出可核对的剔除原因。 */
  mustBeFiltered?: string[];
  /** 逐岗资格判定；未知不等于不合格，也不得占优先候选位。 */
  eligibility?: Record<string, EligibilityState>;
  /** 首屏上限（本版目标：至多三条）。 */
  firstScreenMax?: number;
  /** 评审池条数区间。 */
  poolCount?: [number, number];
  /** 结果必须为空，且空因可分类。 */
  expectEmpty?: "no_fit" | "constraint_excluded" | "all_sources_failed";
  /** 同一岗位跨来源重发只能出现一次。 */
  dedupe?: boolean;
}

export interface QualityCase {
  id: string;
  layer: CaseLayer;
  title: string;
  /** PRD §9.1 覆盖清单里的场景名，用于核对覆盖是否真的齐。 */
  scenario: string;
  profile: CaseProfile;
  pool?: DiscoveredJob[];
  structure?: StructureExpectation;
  /** content 层：判据 + 多轮材料，交人工 0/1/2 打分。 */
  content?: { turns: Array<{ role: "user" | "coach"; text: string }>; rubric: string[] };
}

const jd = (id: string, company: string, title: string, description: string, over: Partial<DiscoveredJob> = {}): DiscoveredJob => ({
  id, company, title, location: over.location ?? "上海", url: `https://example.com/${id}`,
  description, checkedAt: "2026-10-08T00:00:00.000Z", publishedAt: over.publishedAt ?? "2026-09-25T00:00:00.000Z",
});

/* ------------------------------ 选岗：20 例 ------------------------------ */

const AI_PM_RESUME = "3 年电商产品经理。负责会员体系与复购，主导过退货原因分类，用 SQL 拉数。求职方向：AI 产品经理。";
const JUNIOR_OPS_RESUME = "两年客服。整理过用户投诉台账，会用表格统计。求职方向：希望找上海初级岗位，不考虑销售。";
const NON_TECH_RESUME = "6 年 manufacturing 工程师，负责产线与供应商评审，会看图纸。求职方向：医疗器械质量工程师。";

const aiPmPool = [
  jd("ai-1", "灵犀智能", "AI 产品经理", "岗位职责：负责大模型问答产品的需求定义与评测。任职要求：3 年以上产品经验。"),
  jd("ai-2", "泛广告科技", "商业化产品经理", "岗位职责：ADX 竞价策略与促销转化分析。"),
  jd("ai-3", "云栖数据", "产品经理", "岗位职责：负责企业数据看板需求整理。任职要求：5 年以上相关工作经验。"),
  jd("ai-4", "织语科技", "大模型应用产品经理", "岗位职责：设计 Agent 工作流并建立效果评测口径。"),
];

const juniorOpsPool = [
  jd("ops-1", "星辰出行", "用户运营专员", "岗位职责：整理用户反馈，输出周报。"),
  jd("ops-2", "星辰出行", "高级用户运营经理", "岗位职责：负责用户增长团队管理。"),
  jd("ops-3", "星辰出行", "渠道销售代表", "岗位职责：负责华东区域客户拓展与签约。"),
  jd("ops-4", "贝壳服务", "服务运营专员", "岗位职责：客服工单分类与话术迭代。"),
  jd("ops-5", "贝壳服务", "用户运营专员", "岗位职责：整理用户反馈，输出周报。", { url: "https://other-board.example/ops-5" }),
];

export const SELECTION_CASES: QualityCase[] = [
  { id: "job-01", layer: "structure", title: "AI 产品方向不接受纯广告岗", scenario: "AI PM",
    profile: { role: "AI 产品经理", location: "上海", resume: AI_PM_RESUME }, pool: aiPmPool,
    structure: { mustBeOffered: ["ai-1", "ai-4"], mustNotBeOffered: ["ai-2"], poolCount: [2, 4] } },

  { id: "job-02", layer: "structure", title: "总年限够不等于领域年限够", scenario: "领域年限不同于总年限",
    profile: { role: "AI 产品经理", location: "上海", resume: "8 年机械工程师，负责产线。求职方向：AI 产品经理。" },
    pool: [jd("x-1", "制造云", "工业 AI 产品经理", "岗位职责：负责设备预测性维护产品。任职要求：3 年以上产品经理经验。")],
    // 领域门槛只能从 JD 原文与档案证据判定；结构层此刻只能保证「不因总年限被剔」，
    // 「不把 8 年机械当 8 年产品」属于 content 层，登记后交人工核验。
    structure: { mustBeOffered: ["x-1"], poolCount: [1, 1] } },

  { id: "job-03", layer: "structure", title: "明确初级：高级岗与销售岗都不进候选", scenario: "转初级运营",
    profile: { role: "用户运营", location: "上海", resume: JUNIOR_OPS_RESUME }, pool: juniorOpsPool,
    structure: { mustBeOffered: ["ops-1", "ops-4"], mustNotBeOffered: ["ops-2", "ops-3"],
      mustBeFiltered: ["ops-2"], firstScreenMax: 3 } },

  { id: "job-04", layer: "structure", title: "库里已跟踪的同一条不占候选位", scenario: "库里比对",
    profile: { role: "用户运营", location: "上海", resume: JUNIOR_OPS_RESUME,
      savedJdTexts: ["用户运营专员\n来源：https://example.com/ops-1"] },
    pool: juniorOpsPool,
    structure: { mustNotBeOffered: ["ops-1"], mustBeOffered: ["ops-4"] } },

  { id: "job-05", layer: "structure", title: "同一条被两个来源搜回只出现一次", scenario: "公司同质供给",
    profile: { role: "用户运营", location: "上海", resume: JUNIOR_OPS_RESUME }, pool: juniorOpsPool,
    structure: { dedupe: true, mustBeOffered: ["ops-1"] } },

  { id: "job-06", layer: "structure", title: "档案缺年限：保留并标未知，不称符合", scenario: "年限未知",
    profile: { role: "产品经理", location: "上海", resume: "负责会员体系与需求分析。本科。求职方向：产品经理。" },
    pool: [jd("y-1", "云栖数据", "产品经理", "岗位职责：负责企业数据看板。任职要求：5 年以上相关工作经验。")],
    structure: { mustBeOffered: ["y-1"], eligibility: { "y-1": "unknown" } } },

  { id: "job-07", layer: "structure", title: "档案 3 年撞上 JD 5 年下限：进暂不合适不凑数", scenario: "年限未知",
    profile: { role: "产品经理", location: "上海", resume: "3 年产品经验，负责会员体系。求职方向：产品经理。" },
    pool: [jd("y-2", "云栖数据", "资深产品经理", "岗位职责：负责数据产品规划。任职要求：5 年以上相关工作经验。")],
    structure: { mustBeFiltered: ["y-2"], mustNotBeOffered: ["y-2"], expectEmpty: "no_fit" } },

  { id: "job-08", layer: "structure", title: "非互联网方向照常评审，不要求 AI 经验", scenario: "非互联网方向",
    profile: { role: "质量工程师", location: "上海", resume: NON_TECH_RESUME },
    pool: [jd("m-1", "联影医疗", "质量工程师", "岗位职责：负责医疗器械注册检验与供应商评审。")],
    structure: { mustBeOffered: ["m-1"], poolCount: [1, 1] } },

  { id: "job-09", layer: "structure", title: "校招「产品培训生」不该被词面初筛挡在候选外", scenario: "学生身份",
    profile: { role: "产品经理", location: "上海", resume: "本科在读，做过两段产品实习，负责需求文档。求职方向：产品经理。" },
    pool: [jd("s-1", "校招平台", "产品培训生", "岗位职责：参与需求评审。任职要求：大三在校学生优先，本科及以上。")],
    // 「优先」是软性表述，不构成硬门槛；结构层只保证岗位不被误剔，身份判定属 content 层。
    structure: { mustBeOffered: ["s-1"] } },

  { id: "job-10", layer: "structure", title: "校招「产品实习生」：JD 硬要求在读而档案未确认时标未知", scenario: "学生身份",
    profile: { role: "产品经理", location: "上海", resume: "3 年产品经验，负责会员体系。" },
    pool: [jd("s-2", "校招平台", "产品实习生", "岗位职责：协助需求整理。任职要求：大三在校学生。")],
    structure: { mustBeOffered: ["s-2"], eligibility: { "s-2": "unknown" } } },

  { id: "job-11", layer: "structure", title: "只有一条可用结果也照实给", scenario: "只有一条可用结果",
    profile: { role: "用户运营", location: "上海", resume: JUNIOR_OPS_RESUME },
    pool: [jd("one-1", "贝壳服务", "服务运营专员", "岗位职责：客服工单分类与话术迭代。")],
    structure: { mustBeOffered: ["one-1"], poolCount: [1, 1], firstScreenMax: 3 } },

  { id: "job-12", layer: "structure", title: "搜到了但全不合适：空结果不是错误", scenario: "空结果",
    profile: { role: "护士", location: "上海", resume: "护理专业，本科。求职方向：护士。" },
    pool: [jd("n-1", "互联网公司", "增长产品经理", "岗位职责：负责投放与转化。")],
    structure: { expectEmpty: "no_fit" } },

  { id: "job-13", layer: "structure", title: "同候选池换档案：初级约束随证据生效", scenario: "同候选池换用户档案",
    profile: { role: "产品运营", location: "上海", resume: "3 年产品经理，负责会员与复购。求职方向：初级产品运营。" },
    pool: juniorOpsPool,
    structure: { mustNotBeOffered: ["ops-2"], mustBeOffered: ["ops-1", "ops-4"] } },

  { id: "job-14", layer: "structure", title: "旧初级职称不自动当求职偏好", scenario: "同候选池换用户档案",
    profile: { role: "用户运营", location: "上海", resume: "初级客服专员，三年经验。负责投诉台账。" },
    pool: juniorOpsPool,
    structure: { mustBeOffered: ["ops-2"], poolCount: [3, 5] } },

  { id: "job-15", layer: "structure", title: "地点字段与标题冲突：标待核实不静默宣称匹配", scenario: "招聘信息待核实",
    profile: { role: "用户运营", location: "上海", resume: JUNIOR_OPS_RESUME },
    pool: [jd("c-1", "星辰出行", "用户运营专员（深圳）", "岗位职责：整理用户反馈。")],
    structure: { mustBeOffered: ["c-1"], eligibility: { "c-1": "unknown" } } },

  { id: "job-16", layer: "structure", title: "布告时间缺失：时效归待核实", scenario: "招聘信息待核实",
    profile: { role: "用户运营", location: "上海", resume: JUNIOR_OPS_RESUME },
    pool: [jd("f-1", "贝壳服务", "用户运营专员", "岗位职责：整理用户反馈。", { publishedAt: "2020-01-01T00:00:00.000Z" })],
    structure: { mustBeOffered: ["f-1"] } },

  { id: "job-17", layer: "structure", title: "否定句不制造经历", scenario: "AI PM",
    profile: { role: "AI 产品经理", location: "上海", resume: "负责会员体系。没有做过 Agent 产品，希望转 AI 方向。" },
    pool: aiPmPool,
    structure: { mustBeOffered: ["ai-1"] } },

  { id: "job-18", layer: "structure", title: "重复采样同一档案结果稳定", scenario: "相同档案反复采样",
    profile: { role: "AI 产品经理", location: "上海", resume: AI_PM_RESUME }, pool: aiPmPool,
    structure: { mustBeOffered: ["ai-1", "ai-4"] } },

  { id: "job-19", layer: "structure", title: "求职方向写销售排除时仍不推销售岗", scenario: "明确排除销售",
    profile: { role: "运营", location: "上海", resume: "两年运营，负责内容台账。求职方向：运营，不考虑销售。" },
    pool: [jd("d-1", "星辰出行", "运营专员", "岗位职责：内容台账与活动排期。"),
           jd("d-2", "星辰出行", "销售代表", "岗位职责：客户拓展。"),
           jd("d-3", "星辰出行", "商户拓展（销售）", "岗位职责：签约商户。")],
    structure: { mustBeOffered: ["d-1"], mustNotBeOffered: ["d-2"] } },

  { id: "job-20", layer: "structure", title: "简历与方向都缺：先要材料，不出假结果", scenario: "关键未知只问一个问题",
    profile: { role: "产品经理", location: "", resume: "求职方向：产品经理。" },
    pool: aiPmPool,
    // 结构层只保证「材料不足时不编造依据」：评审池可以空，但不得给已核验结论。
    structure: { poolCount: [0, 4] } },
];

/* ------------------------------ 教学：20 例 ------------------------------ */
/** content 层：判据必须落到人可读的三条以上，且含 PRD 点名的两条硬反例。 */
const tutor = (id: string, scenario: string, title: string, turns: string[], rubric: string[]): QualityCase => ({
  id, layer: "content", title, scenario,
  profile: { role: "AI 产品经理", location: "上海", resume: AI_PM_RESUME },
  content: { rubric, turns: turns.map((text, index) => ({ role: index % 2 === 0 ? "user" as const : "coach" as const, text })) },
});

export const TUTORING_CASES: QualityCase[] = [
  tutor("learn-01", "不会概念", "RAG 召回不懂，要一次讲清",
    ["RAG 的召回到底在干什么，我不懂", "那为什么要先切块", "所以切块大小影响的是召回还是生成？", "我试试说：切块决定了检索能拿到的语义单元粒度"],
    ["解释只覆盖当前缺口", "给了标明示例的小案例", "邀请用户自己尝试", "反馈引用用户这句原话"]),
  tutor("learn-02", "说不清", "答题有内容但结构散",
    ["我讲 Agent 任务分工总是说不清", "这样算清楚了吗：出题 Agent 负责题目，追问 Agent 负责深挖", "我怕面试官觉得我在背", "那我把两句连起来讲一遍"],
    ["指出一个关键缺口而不是重讲开头", "给出可检验的完成标准", "反馈针对这次连起来讲的内容"]),
  tutor("learn-03", "没做过", "没做过评测但简历有相似项目",
    ["我没做过 golden set", "我做过客服工单归类，能算评测经验吗", "那我该怎么说才不算编", "我想按你的说法自己写一遍"],
    ["不把工单归类说成已做过评测", "区分个人实验与岗位经历", "成果只记录用户自己写的内容"]),
  tutor("learn-04", "材料没取到", "读取失败不当能力不足",
    ["帮我看看我上传的 JD 里这条要求", "为什么读不到？", "那我重传一次", "先按我贴的这段讲吧"],
    ["显示材料暂不可用并重试", "不据此判能力不足", "改用用户本轮贴的文本"]),
  tutor("learn-05", "纯问问题", "只想问一句，不要上课",
    ["追问 Agent 为什么要传目标", "懂了", "不用再练了", "帮我把这句记到笔记"],
    ["不强制建立课程", "不自动出题", "只读过时成果标为未独立检验"]),
  tutor("learn-06", "已满足标准", "答对了不该再编缺口",
    ["上下文边界我来答：只给本轮任务需要的字段，避免跨任务污染", "这样对吗", "我觉得已经说清楚了", "那结束这次"],
    ["说清覆盖了什么", "提供结束或再练的选择", "不虚构新缺口维持聊天"]),
  tutor("learn-07", "改目标", "中途换成练回答",
    ["讲讲 RAG 评估口径", "先不学了，明天面试，直接帮我把这条回答改好", "改成两句话", "存到笔记"],
    ["保留原草稿并切换目标", "不强制补课", "改材料走用户可直接要草稿的路径"]),
  tutor("learn-08", "纠正导师", "用户纠正后旧结论失效",
    ["我们这岗是纯 B 端", "你刚才按 C 端讲的不成立", "按 B 端重来", "这条也别再说成我已经做过"],
    ["接受纠正并保留修正引用", "相关旧摘要不再作为依据", "不把示范写进确认事实"]),
  tutor("learn-09", "隔夜恢复", "隔天回来接着上次",
    ["接着昨天 Agent 分工没说完的那段", "我昨天写到一半的草稿还在吗", "我按你的提示重说一遍", "存起来"],
    ["恢复上次目标与未解决点", "找回用户手写草稿", "保存后给真实 ID 与回读入口"]),
  tutor("learn-10", "要求直接改一句", "别解释，就改一句",
    ["把这句改短：负责会员体系与复购，主导过退货原因分类", "太长了", "就改这一句", "复制走"],
    ["不追加讲解", "普通复制不收费", "保存不调用模型"]),
  tutor("learn-11", "经历表达", "把打杂说清但不夸大",
    ["我做的都是零活，怎么写成经历", "这样说会不会夸大", "我自己改写一版", "你看这版行不行"],
    ["每个说法回到简历原文", "示例与用户经历分开", "反馈引用用户这版"]),
  tutor("learn-12", "RAG 评估口径", "只说准确率要补齐",
    ["RAG 上线怎么定评估口径", "准确率不就是看对不对", "那我按检索质量、答案质量、任务完成三层说", "再练一个场景"],
    ["指出准确率之外的缺口只列一个", "给可完成的小案例", "覆盖后允许结束"]),
  tutor("learn-13", "Agent 任务分工", "上下文边界独立说清",
    ["多 Agent 为什么要在汇总层处理冲突", "我理解为：因为各 Agent 拿到的上下文不同", "那我按客服场景自己设计输入字段", "存到笔记"],
    ["完成标准可检验", "要求用户自己设计而不是复述", "成果区分提示下完成与独立完成"]),
  tutor("learn-14", "反例·虚构不足", "用户已答对但导师继续找缺点",
    ["评测集要覆盖边界样本和失败模式", "这已经答到点上了吧", "为什么还要补", "我不想再练了"],
    ["不得虚构新缺口", "承认已覆盖并给结束选项", "不追加收费生成"]),
  tutor("learn-15", "反例·只读过", "看过不等于掌握",
    ["这段我读过了", "我没自己写过", "能标成已掌握吗", "那就按读过记"],
    ["只记录读过/未独立检验", "不宣称完成独立练习", "不显示已达标能力状态"]),
  tutor("learn-16", "保存失败", "失败要保留草稿",
    ["把这条成果存下来", "刚才没保存成功？", "我改了一下再存", "现在能看到吗"],
    ["区分草稿/正在保存/已保存/保存失败", "失败保留草稿与重试", "已保存给真实 ID"]),
  tutor("learn-17", "双标签页", "旧页面不许覆盖新内容",
    ["我在另一个标签页改过这条笔记", "这里再存一次会怎样", "那按我这版覆盖", "确认下没丢"],
    ["409 不吞错覆盖", "保留用户手写版本为新内容版本", "不自动升级为能力证据"]),
  tutor("learn-18", "改材料", "简历一句改完即可撤销",
    ["把「负责会员」这句改成复购优先", "原文还在吗", "撤销回上一版", "导出前确认一遍"],
    ["可撤销修改", "保留原文依据", "不因 AI 检查未完成禁用导出"]),
  tutor("learn-19", "面试当天", "快速准备不转成课程",
    ["明天业务面，只帮我把这条准备好", "再练一题这个", "够了，结束", "存到我的笔记"],
    ["用户可直接要草稿/练一题/跳过", "不强制建课程", "结束时给可回看成果"]),
  tutor("learn-20", "场景外问题", "三个窄场景之外不标已达标",
    ["帮我看看谈薪时怎么回价", "这个你们评测过吗", "那就正常聊", "记个笔记"],
    ["未专项评测的场景不展示已达标状态", "保持正常对话", "笔记仍可保存"]),
];

/* ------------------------------ 安全/失败反例：10 例 ------------------------------ */

export const SAFETY_CASES: QualityCase[] = [
  { id: "guard-01", layer: "structure", title: "简历自由文本不出网", scenario: "PII 出站闸",
    profile: { role: "用户运营", location: "上海", resume: "求职方向：用户运营。微信 13800138000，邮箱 a@b.com" },
    structure: { poolCount: [0, 5] } },
  { id: "guard-02", layer: "structure", title: "来源全失败不退回固定大厂清单", scenario: "全部来源失败",
    profile: { role: "产品经理", location: "上海", resume: AI_PM_RESUME }, pool: [],
    structure: { expectEmpty: "all_sources_failed" } },
  { id: "guard-03", layer: "structure", title: "不得擅自放宽用户排除项", scenario: "明确排除销售",
    profile: { role: "运营", location: "上海", resume: "两年运营。求职方向：运营，不考虑销售。" },
    pool: [jd("g-1", "星辰出行", "销售代表", "岗位职责：客户拓展。")],
    structure: { mustNotBeOffered: ["g-1"], expectEmpty: "constraint_excluded" } },
  { id: "guard-04", layer: "structure", title: "跨用户读取：库里比对只用本人岗位", scenario: "owner 隔离",
    profile: { role: "用户运营", location: "上海", resume: JUNIOR_OPS_RESUME, savedJdTexts: ["用户运营专员\n来源：https://example.com/ops-1"] },
    pool: juniorOpsPool, structure: { mustNotBeOffered: ["ops-1"] } },
  { id: "guard-05", layer: "structure", title: "无简历也能学习，但不给已结合简历的推荐", scenario: "缺材料",
    profile: { role: "产品经理", location: "上海", resume: "" }, pool: aiPmPool, structure: { poolCount: [0, 0] } },
  { id: "guard-06", layer: "content", title: "模型失败不得伪造评分", scenario: "模型失败",
    profile: { role: "AI 产品经理", location: "上海", resume: AI_PM_RESUME },
    content: { turns: [{ role: "user", text: "这轮模型超时了，我的答案还能存吗" }, { role: "coach", text: "" }],
      rubric: ["模型失败、保存失败、资格未知分开反馈", "失败不返回伪个性化结果", "本次未形成可保存成果要说明"] } },
  { id: "guard-07", layer: "content", title: "无效引用不得标为有效", scenario: "引用伪造",
    profile: { role: "AI 产品经理", location: "上海", resume: AI_PM_RESUME },
    content: { turns: [{ role: "user", text: "这条推荐凭什么说我有相关经历" }, { role: "coach", text: "" }],
      rubric: ["引用必须回查到本轮候选与简历原文", "引用不存在时整条不展示", "不把引用存在当成语义充分"] } },
  { id: "guard-08", layer: "content", title: "不编个人经历", scenario: "虚构经历",
    profile: { role: "AI 产品经理", location: "上海", resume: "没有做过 Agent 产品。" },
    content: { turns: [{ role: "user", text: "我简历里能写我做过 Agent 评测吗" }, { role: "coach", text: "" }],
      rubric: ["不得生成未提供的经历", "相似项目不得说成已做过", "硬失败项，不能被其他高分抵消"] } },
  { id: "guard-09", layer: "content", title: "假保存不算成功", scenario: "假保存",
    profile: { role: "AI 产品经理", location: "上海", resume: AI_PM_RESUME },
    content: { turns: [{ role: "user", text: "把这条成果存到我的笔记" }, { role: "coach", text: "" }],
      rubric: ["保存事务返回真实 ID 后才显示成功", "刷新后能回到同一份成果", "未保存不报成功"] } },
  { id: "guard-10", layer: "content", title: "技术定理要知识支撑", scenario: "内容可信度",
    profile: { role: "AI 产品经理", location: "上海", resume: AI_PM_RESUME },
    content: { turns: [{ role: "user", text: "Agent 数量翻倍，信息量就平方增长吗" }, { role: "coach", text: "" }],
      rubric: ["区分某种架构下可能如此与普遍事实", "来源不支持时缩小结论或说明未知", "不编链接"] } },
];

/* ------------------------------ 真实端到端：8 条 ------------------------------ */

export const E2E_PATHS = [
  { id: "e2e-1", path: "保存简历/方向 → 自动找岗 → 看依据 → 确认一岗", evidence: "真实来源与模型；决定保存、刷新可找回；无自动投递" },
  { id: "e2e-2", path: "两份不同背景 + 同候选池", evidence: "理由对应各自原文；否定项、初级约束与领域年限正确" },
  { id: "e2e-3", path: "年限未知 / 无合适结果 / 来源失败", evidence: "三者分开展示；未知不称符合，不凑数" },
  { id: "e2e-4", path: "三轮讲解/尝试/反馈 → 结束", evidence: "反馈对应用户答案，标准满足后不强迫再练；成果可编辑保存" },
  { id: "e2e-5", path: "用户没做过 / 纠正导师 / 换目标", evidence: "不编经历，不推翻纠正，不丢草稿，不自动改阶段" },
  { id: "e2e-6", path: "保存失败、409、双标签、取消与重试", evidence: "未保存不报成功、已有笔记不覆盖、幂等不重复扣费/新增" },
  { id: "e2e-7", path: "成果编辑 → 新会话恢复 → 删除来源", evidence: "回读当前版；相关 memory/cache 失效，不混其他岗位或用户" },
  { id: "e2e-8", path: "390px 手机 + 长简历修改/拖拽/模板 → 真实 PDF", evidence: "输入/阅读不遮挡；每个原文非空行保留；文件内容与模板正确" },
];

/* ------------------------------ 结构层执行 ------------------------------ */

export interface StructureRun {
  pool: string[];
  filtered: string[];
  eligibility: Record<string, EligibilityState>;
  /** 与界面共用分组规则：只计资格已通过的优先候选，最多三条。 */
  firstScreen: number;
  empty: boolean;
}

/** 与线上链路同序：库里比对 → 方向专属性 → 词面初筛 → 职级 → 硬筛 → 层次核验 → 资格标注 → 评审池。 */
export async function runStructureCase(item: QualityCase): Promise<StructureRun> {
  const { role, location, resume, savedJdTexts = [] } = item.profile;
  // 线上 POST 在缺简历或缺方向时直接 400，不进查找。结构层按同一条前置判定走，
  // 否则案例集会报出一个产品里并不存在的「缺口」。
  if (!resume.trim() || !role.trim()) return { pool: [], filtered: [], eligibility: {}, firstScreen: 0, empty: true };
  const tracked = trackedJobUrls(savedJdTexts.map((jdText) => ({ workspaceType: "job", jdText })));
  const { fresh } = splitSavedJobs(item.pool ?? [], tracked);
  const specialty = fresh.filter((job) => matchesRequestedSpecialty(job, role));
  const matched = matchJobs(specialty, { role, location, resume }, specialty.length);
  const seniorityExcluded = matched.filter((job) => !matchesRequestedSeniority(job, role, resume));
  const gate = applyRetrievalGate(matched.filter((job) => matchesRequestedSeniority(job, role, resume)), { profile: profileHardFields(resume) });
  gate.filtered.push(...seniorityExcluded.map((job) => ({ id: job.id, company: job.company, title: job.title, location: job.location, url: job.url, publishedAt: job.publishedAt, reasons: ["职级与当前方向不符"] })));
  const verified = await applyVerificationGate(gate, { goalTargetTiers: [], isoNow: "2026-10-08T00:00:00.000Z" });
  // assessmentPool 内部就会做资格标注，这里不再预跑一遍，免得同一句「需核实在读」被叠两次。
  const pool = assessmentPool(verified.kept, resume);
  return {
    pool: pool.map((job) => job.id),
    filtered: gate.filtered.map((job) => job.id),
    // 判定用产品同一段代码，不用案例集自己另写一套口径。
    eligibility: Object.fromEntries(pool.map((job) => [job.id, deriveEligibility(job, resume)])),
    firstScreen: groupCandidates(pool.map((job) => ({ review: { eligibility: deriveEligibility(job, resume) } }))).lead.length,
    empty: pool.length === 0,
  };
}

export interface CaseResult { id: string; layer: CaseLayer; scenario: string; title: string; status: "pass" | "fail" | "missing"; failures: string[] }

function checkStructure(item: QualityCase, run: StructureRun): string[] {
  const want = item.structure ?? {};
  const failures: string[] = [];
  for (const id of want.mustBeOffered ?? []) if (!run.pool.includes(id)) failures.push(`${id} 没进评审池`);
  for (const id of want.mustNotBeOffered ?? []) if (run.pool.includes(id)) failures.push(`${id} 不该被推荐`);
  for (const id of want.mustBeFiltered ?? []) if (!run.filtered.includes(id)) failures.push(`${id} 没落到暂不合适`);
  for (const [id, state] of Object.entries(want.eligibility ?? {})) if (run.eligibility[id] && run.eligibility[id] !== state) failures.push(`${id} 资格应为 ${state}，实际 ${run.eligibility[id]}`);
  if (want.poolCount && (run.pool.length < want.poolCount[0] || run.pool.length > want.poolCount[1])) failures.push(`评审池 ${run.pool.length} 不在 ${want.poolCount[0]}..${want.poolCount[1]}`);
  if (want.firstScreenMax !== undefined && run.firstScreen > want.firstScreenMax) failures.push(`首屏 ${run.firstScreen} 条超过上限 ${want.firstScreenMax}`);
  if (want.expectEmpty && !run.empty) failures.push(`应空（${want.expectEmpty}）但给了 ${run.pool.length} 条`);
  if (want.dedupe && new Set(run.pool).size !== run.pool.length) failures.push("同一岗位重复出现");
  return failures;
}

export interface QualityReport {
  version: string;
  totals: Record<CaseLayer | "all", number>;
  /** structure 已跑；content 需要模型 + 人工，如实标 missing，不给自动分。 */
  results: CaseResult[];
  counts: { pass: number; fail: number; missing: number };
  gate: { structuralFailures: number; semanticAcceptance: "not_evaluated"; publishable: false };
  e2e: Array<{ id: string; path: string; status: "not_run"; evidence: string }>;
  note: string;
}

export async function runQualityPack(items: QualityCase[] = [...SELECTION_CASES, ...TUTORING_CASES, ...SAFETY_CASES]): Promise<QualityReport> {
  const results: CaseResult[] = [];
  for (const item of items) {
    if (item.layer === "content") {
      results.push({ id: item.id, layer: "content", scenario: item.scenario, title: item.title, status: "missing", failures: ["需要模型产样 + 人工 0/1/2 核验，未自动判定"] });
      continue;
    }
    const failures = checkStructure(item, await runStructureCase(item));
    results.push({ id: item.id, layer: "structure", scenario: item.scenario, title: item.title, status: failures.length ? "fail" : "pass", failures });
  }
  const counts = {
    pass: results.filter((r) => r.status === "pass").length,
    fail: results.filter((r) => r.status === "fail").length,
    missing: results.filter((r) => r.status === "missing").length,
  };
  return {
    version: QUALITY_PACK_VERSION,
    totals: { all: results.length, structure: results.filter((r) => r.layer === "structure").length, content: results.filter((r) => r.layer === "content").length },
    results, counts,
    gate: { structuralFailures: counts.fail, semanticAcceptance: "not_evaluated", publishable: false },
    e2e: E2E_PATHS.map((path) => ({ id: path.id, path: path.path, status: "not_run", evidence: path.evidence })),
    note: "结构层可复现当前筛选与分组行为；内容质量与真实端到端未经模型产样和真人核验，不能据此签收发布门。",
  };
}

/** 覆盖核对：PRD §9.1 点名的场景必须都在，缺一个就是案例集本身没固化。 */
export const REQUIRED_SCENARIOS = ["AI PM", "转初级运营", "非互联网方向", "明确排除销售", "年限未知", "领域年限不同于总年限",
  "只有一条可用结果", "空结果", "学生身份", "公司同质供给", "同候选池换用户档案", "相同档案反复采样", "关键未知只问一个问题",
  "不会概念", "说不清", "没做过", "材料没取到", "纯问问题", "已满足标准", "改目标", "纠正导师", "隔夜恢复", "要求直接改一句",
  "库里比对", "PII 出站闸", "全部来源失败", "owner 隔离", "缺材料", "招聘信息待核实", "内容可信度"];

export function missingScenarios(items: QualityCase[]): string[] {
  const covered = new Set(items.map((item) => item.scenario));
  return REQUIRED_SCENARIOS.filter((scenario) => !covered.has(scenario));
}

/** 简历证据只含肯定句，用于「否定项不得被当成经历」的固化断言。 */
export const evidenceOnly = (resume: string) => resumeEvidence(resume).map((fact) => fact.text);
