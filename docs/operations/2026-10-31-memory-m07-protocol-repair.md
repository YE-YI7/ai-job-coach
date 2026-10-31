# Memory M07 · 原生工具与质检证据修复

用户要求修复M06两个技术断点后再展示。B05、deepseek-v4-flash、原始益职AI材料、六块冻结私有记录不变。上一M06历史及比较只读；本轮另起M07确定性预留和新对照，不清失败锁、不写原简历/旧作答/积分。

## 可复现原因与实现

- M06实际callLLM请求没有tools：只有正文菜单与手写JSON动作约定。M07只对显式管理员精确连接启用原生函数；SDK按tool_calls接收空正文、保留真实ID/参数并计量；assistant/tool消息按同ID接回，选中块读入下一次facts。普通流式聊天和默认路由不启用，未迁移框架、未换模型。
- 缺memoryDecision以前触发五次整稿生成。原生提交schema明确该字段，运行器不再为了非核心说明循环整稿；没读入按未激活记录，不能后台自动全读或宣称有Memory收益。
- 错误引文以前直接丢掉整个结果。现在返回确切sourceId/引用/对应原文，只开放repair_evidence最小修复，正文冻结；仍非法就拒绝，修复后才调用原质检。完整块回放纠正M06事后分析：原sourceId resume-line-11正确，同块既有Jev又有Eval；引文漏了“2保存”的“2”，并非引错编号。历史误判保留、新档纠正，没有替模型猜ID或改主张。
- 产品质检必须对grounding error提供原主张与候选连续引用、来源编号、新增语义维度和具体新主张。正常稿不逐句吐证据；不完整先同质检补证一次，不误导原编辑破坏稿件；所有原价值/格式/事实/贡献否决仍在。修复styleContract.editorialContract残留旧目标，待审before为同一原材料，编辑与审稿同任务/同facts。
- Trace阅读器只补原生submit_edit解析及context_load选择显示，沿用执行动线/短要点和完整I/O，不把产品质检当额外Judge。仅修引用的调用不能盖掉已有候选正文。UI只改运行版本标识，无样式改动。

## 一手依据（设计取舍，不当作收益证明）

Anthropic工具工程：明确工具契约和有用错误响应、真实工具结果反馈与行为级评估，不因标点或等价表述差异严格拒绝。https://www.anthropic.com/research/writing-tools-for-agents

Anthropic按需上下文/Memory：持久存储与工作上下文分层，按任务取回；不把全库强灌替代自主选择。https://www.anthropic.com/research/effective-context-engineering-for-ai-agents 与 https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool

Harness²原论文v1：冻结模型/环境，以参考执行和候选的行为对照推动修正；保留失败经验，但行为差异不是正确性证明。没有安装该框架或夸为完整自进化。https://arxiv.org/html/2610.14224v1

DeepSeek原生tool_calls与tool_call_id接续协议：https://api-docs.deepseek.com/guides/tool_calls/ 。直接接口支持不代替TokenDance实际验收，网关不支持时显式失败，不静默退文本协议。

## 已执行本地门禁

4套定向37条通过，包括原生工具到SDK/空正文非空响应/真实ID/usage/作用域/失败不降级、Memory只加载自选块并对齐编辑与质检、引用错误局部返修、质检协议补证冻结候选。零费用真实历史输入回放1条通过，B05与原料未变、新协议不可冒用旧控制。

全量正式命令`npm test -- --runInBand`326套3175条通过，6套11条跳过为既有配置/可选私有回放；tsc、ESLint和生产build成功。首次误用`npx jest`少了项目指定VM参数，PDF动态导入1条失败，原日志保留；随后按package.json正式命令全量重跑，未改/跳过PDF测试。Trace node30条通过。Impeccable对本次两个UI解析/版本文件手动detect一次，结果[]，不启用自动hooks、不扩修历史问题。

## 尚待实际完成

发布仅管理员实验/阅读器，普通默认Harness不切。生产目标ai-job-coach（prj_fav7gQZKEEE2JO3b8v9S9leeRhkS，team_7qIutahimwnjCje1fOtQEPyT），从已核正式74d4c5a继续；不混M06发布后仅文档追加或备份A。MCP团队授权403，已确认原CLI正常登录，因此使用现有CLI，不要求本人重新验证。

正式发布后通过正常Chrome管理员会话跑M07新两臂，各最多6次上游，自动重试0；全部输入输出、真实加载、候选、产品审稿、后验分析、耗时和usage参考费用进Eval。新七列保留M06失败稿，原C04b仍在历史对照。只有实际读取/编入/质量通过才能签对应项，不能用本段预告完成。

## M07.1：真实M07失败保留，再修接口而非要求模型抄得更准

M07真实7调，原生工具实际被使用：有Memory臂自主load四块并编入facts，后来又inspect/recall/release，所以不能把最后零加载说成从未读取。load只回元数据不回正文、六种接口重叠，诱发重复操作；无Memory仍因漏抄“2保存”的2导致非连续引文，局部修复也重复该遗漏。全部旧运行保留，不能算有效Memory收益。

M07.1本次短任务只提供find、load完整原文、submit三项，仍自主选择任意块/顺序或none，不强制读取；load回执直接带所选源原文和sourceId，不含未选块。没有长期compaction/release需求，不暴露无法同步从历史消息释放内容的伪管理接口。选择编号后由服务端绑定不可变原文，不再让模型逐字抄引文；质检以sourceId和候选段落ID给出主张差异证据，后端查存在，原质检继续审语义和质量。来源绑定不等于事实/贡献通过，B05和全部语义否决保留。新两臂共同使用M07.1协议，M07控制不能复用。

## M07.1实测与M07.2最小补验

有Memory臂24eaa04c-76bd-43bb-aa86-6161094a5422真实完成：模型自主读4块，选中正文在下次编辑facts及产品质检中一致，3次上游/52.817秒/参考USD0.0047881944。读取的是成本证据限制、Eval运行、定位、个人判断角色四块，没有强灌另两块。产品机检通过不代表用户接受、也不证明已写出所有具体贡献。

无Memory臂1827477d-71cf-4d70-af7f-d36782baa975耗3次/72.356秒/USD0.00408325，质检对4条事实错误和1条质量错误提供了5条证据，原程序要求证据条数必须等于事实错误数，额外的质量证据被机械拒绝。M07.2仅改为全部事实错误必须有证、可额外给真实错误项的有效证据；未知/重复/缺少引用仍拒绝。原质量finding及否决不删、不改passed。

M07.2不再重跑已通过Memory臂：私有零费用回放逐字断言三次真实messages、nativeTools、phase及最后draft/loadedFacts与原运行相同且完成；仅再次运行无Memory失败分支。读取复用结果必须属于当前账号，源/知识/B05/任务hash及provider/model/原M07.1版本、已加载非空均匹配，任何不符409，不偷偷重跑或收费。网页与档案明确标注复用原3次，本次新增0。两臂LLM输入契约保持M07.1不变，版本差异仅宿主验证多余证据，供研究对照而非泛化结论。

M07.2门禁：私有逐字原生回放及证据协议6条通过；正式全量327套3181条通过、7套12条按既有/私有可选配置跳过（新增私有回放已单独真实执行）；生产build、随后串行tsc与定向ESLint退出0。首次全量暴露route测试默认仍指向原with_memory新跑入口，改为真实无Memory补验，并新增相同冻结条件复用/不一致拒绝/零新增调用测试；保留首轮失败日志，不删除断言。没有放宽事实或贡献标准。
