# Eval 实施分工与外包边界

2026-10-19 · 本人回复“我交给 Q 点”，交接已由本人发起；尚未收到可验收交付。本文是文件与接口契约，不代表外部已经完成。后端接口已在本任务代码实现，尚未部署；页面不能把本地演示或接口代码当成正式云保存验收。

实际仓库：`/Users/yi/Documents/Codex/yizhi-resume-block-repair-1016`，既有分支 `codex/resume-detail-polish-1017`。其他工具正在改 `components/cockpit/AgentConversation.tsx`，不得覆盖、格式化或带入本任务提交。保护所有未提交截图与 `supabase/.temp/`。

## Q 点：可外包的独立编码包

只改 `public/eval-lab/index.html`、`public/eval-lab/app.mjs`、`public/eval-lab/styles.css`、`scripts/eval-lab.test.mjs`，不要改后端、密钥、认证、业务简历、侧栏、手机号或支付。

目标：沿用当前 Eval 工作台的低密度版式，不增加一屏彩色卡片。增加“案例反馈”“方案对比”入口。现有 Trace/Agent I/O/输入/结果保持可用，历史缺数据继续标未采集。保存成功必须等服务端响应；失败保留输入、可重试；切记录不串稿；旧本机备注不可静默上传。正式站只用同源API，不写任何域名或密钥。只用明确虚构的UI测试样本，不运行真实模型。

### 后端契约（由 Codex 实现）

- `GET /api/admin/eval-feedback?runId=<UUID>` → `{ok:true,cases:[{id,runId,resumeTraceId,changeId,scope,category,verdict,note,expected,status,createdAt}]}`。不带runId为最近案例列表。401/403/503均需明确提示，不展示演示数据冒充后台数据。
- `POST /api/admin/eval-feedback`，JSON `{id:<新UUID>,runId:<当前正式运行UUID>,changeId:<该运行中的真实修改ID或null>,scope:"change"|"whole_document",category:"format"|"quality"|"grounding"|"questioning"|"system"|"other",verdict:"improve"|"fail"|"pass",note:<1..6000字>,expected:<0..6000字>}`。不能传用户ID/账号ID/原简历正文。返回 `{ok:true,feedback:<同列表项>,replayed:boolean}`；同编号同内容重试不重复保存，同编号不同内容409。只在正式记录可云保存；演示/导入仍本机，并明确说明。
- 具体修改下拉只列当前正式运行真实changes的ID/section；整稿问题选scope=whole_document且changeId=null。不得自行生成修改ID，不把段落编号当成修改ID。页面展示可复制的完整运行与修改ID。
- `GET /api/admin/eval-experiments` → `{ok:true,batches:[{id,label,status,createdAt,summary}]}`。
- `GET /api/admin/eval-experiments?id=<UUID>` → `{ok:true,batch:{id,label,status,createdAt,config,summary},runs:[{id,label,status,experiment,metrics,result,evaluation}]}`。此入口只读，不触发模型。
- experiment `{batchId,fixtureId,split:"development"|"holdout",strategy:"independent"|"self_review"|"format_only",formatPolicy:"preserve"|"repair"|"standard",repeat:number}`。
- metrics 至少展示已有的wallMs、calls、inputTokens、outputTokens、cacheHitTokens、estimatedCostUsd、actualCost与costStatus。null显示“未记录”，不能显示0或拿估价冒充实扣。运行成本和离线评测调用成本分开。

### 验收

1. 不假报云保存成功；双击/网络失败重试使用同UUID，刷新后重新GET恢复。
2. 多记录切换不混runId/changeId；切换时保存中的旧响应不能覆盖新页面。
3. 服务器拒绝不存在修改ID时显示原因；没有changes时只可提交整稿问题。
4. 方案结果有原输入/输出、版本/Trace入口、样本/格式/策略标签；失败和超时计入列表，不只展示成功。
5. 图表/表格清楚区分小样本观察与统计结论，未录LLM自评不造分，未实际导出的PDF标未验证。
6. 桌面/390px无新增横向溢出；键盘可用，焦点可见；不改全站视觉。

交付：文件清单、改动摘要、测试命令/结果、两类视口截图、已知限制。不提交/推送/部署或修改原账号数据。共享分支只提供本包diff，禁止git add -A、reset/clean/stash。

## Grok：等结果齐后交独立盲评

不让同一个起草者为自己的架构选冠军。由 Codex 提供脱敏且明确虚构的原始事实、匿名候选A/B/C和统一rubric，随机候选顺序，不给架构名称、运行成本或已有评分，要求逐项给证据及unknown，不能因短、长、术语多或看起来专业直接打高分。交换顺序复评检查偏序；发现事实越界先给硬风险，不用总分掩盖。

Grok只交判断和具体问题，不改原稿、模型配置或程序；不能接触密钥/支付，不能读取其他用户材料。盲评与规则判定冲突必须保留，交产品负责人校准。结果未齐前不启动这个包，以免做无效审查。

## 留在 Codex 的工作

事实边界、版本/并发保护、原编辑返修与逐问状态机、权限和后台持久化、三策略的真实执行与计量隔离、数据/积分保护、真实保存刷新与PDF、最终发布验收。这些环节审查成本接近亲自实现，不作为简单外包。若外部包迟迟无结果，不宣称完成或替外部结果背书；先完成不依赖它的后端与实验。
