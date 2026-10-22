# Grok 数据工作区验收与返修单

2026-10-22 · Codex。结论：**未通过验收，不部署**。不是仅差美化；筛选口径、正文安全处理、会话内容和主要下钻路径仍有缺口。

代码目录：`/Users/yi/Documents/Codex/yizhi-resume-block-repair-1016`。
检查基线 HEAD：`84392065825b59f352e1e20a9d2740166b9a7d7d` 加 Grok 未提交工作区。
原需求仍以 `docs/product/2026-10-22-analytics-business-datasets-grok.md` 为准。本文件给出已验证的问题和下一轮准入，不代替原需求。

## 已做的验证

- 原提交的两套 Jest：17 项通过。但是 API 测试仅新增了 business store mock，没有验证新业务分支；5 项新逻辑测试不足以证明数据契约完整。
- 新增离线复现：`node scripts/audit-analytics-business.cjs`。9 项断言，**1 通过、8 失败**。只用虚构账号、事件、消息和内存数据库；不读取环境密钥、不连接正式库、不调用模型。退出码 1 是本次候选未通过，不是把失败报告包装成绿灯。
- 原组件浏览器回放：`node scripts/audit-analytics-business.cjs --serve`，`http://127.0.0.1:3419/?view=users`。直接编译候选 BusinessWorkspace 及其 CSS，React/字体由本机已有依赖提供，同源 API 为虚构响应。这是局部组件回放，**不是 Next 服务端鉴权／正式数据／真实登录验收**。
- 浏览器实见：25 人只展示 20 人且没有下一页；选用户能打开会话，但 Markdown 星号裸露；再点 GEO 同屏残留上一会话；读取错误后清空条件，表格恢复但错误提示没有消失。390px 基础表回放没有整页横向溢出；不外推所有窄屏内容通过。
- 手动 Impeccable detect 已对候选 4 个 UI 文件执行一次，仅报 CSS 中已有的 Sfmono-Regular 文档声明警告。该字体规则原本存在，不作为这次引入问题；检测通过也不代表上述业务交互通过。没有启用自动钩子。
- 未读取真人简历／对话、未写旧作答、未动积分／支付／认证、未调模型或短信。本轮没有构建发布，没有改变正式版本。没有宣称已完成正式数据对账、Next 整体构建或线上管理员验收。

## Grok 必须返修的发布阻断项

| 编号 | 问题与复现 | 修改要求与通过条件 |
|---|---|---|
| P1-A | `businessUsers` 用起始日判断整个区间的新老。10/20–10/22 内 10/21 注册的用户被标 unknown。 | 日视角逐日判断；区间视角在区间内注册为 new，起点前为 old，真正缺历史才 unknown。补区间边界与空注册时间测试。 |
| P1-B | `inWindow` 按字符串比较 ISO 时间。同一个北京时间零点，`2026-10-21T16:00:00+00:00` 被排除。 | 统一解析时间戳再比较；带 Z、时区偏移、不同小数精度的等价时刻结果一致。跨午夜时长按所属业务日分摊，不直接丢掉间隔。 |
| P1-C | 同一 request 的两条 `coach_response_received` 被当成 2 个完成轮；只计回复事件，不证明用户消息和回复已保存。 | 明确发送、回复、完成轮来源与分母；稳定 request/turn 去重，必要时补选事件 request_id。保存的事实缺失就未知，不把模型返回／响应事件当成交付。补重试、失败无回复、仅用户消息用例。 |
| P1-D | feature 参数只影响 `featureUsers`，没有传给 `businessUsers`；实际表也不显示 featureUsers。虚构两用户仅一人用功能，筛选后仍返回两人。 | 后端先确定同一个有效用户集合，再作用于全部指标、总数、分页和下钻；时长仍用选中用户的完整日活动流。日期、功能与人数点击后的列表必须对账。 |
| P1-E | 新 store 的 hideContact 只遮手机号／邮箱，绕过旧 store 的 redactEval；虚构 Bearer 标记原样返回。 | 复用现有统一凭据／联系方式遮蔽和长度上限。补 Bearer、sk 类虚构串与长文本的回归；保留遮蔽／截断提示，不下发任意 metadata。不能因管理员权限省略正文安全处理。 |
| P1-F | 同一 turn 的用户与导师时间相同，再按 `:mentor`／`:user` ID 排序，导师被排在用户前。 | 同一 request/turn 内先问题后答复，跨 turn 仍稳定时间排序；不能仅交换当前数组掩盖分组排序。 |
| P1-G | 会话读取 `.limit(200)`，没有下一页／截断标记；用户接口有 nextOffset，但页面完全没有分页。 | 全链路稳定分页，同批冻结 asOf；200+ turn 不静默丢失。25+ 用户能翻到下一页，刷新／返回仍保留 offset、选中用户和筛选。 |
| P1-H | BusinessWorkspace 在 GEO 或下一用户读取失败时仍可展示上一会话；成功后没有清 error。 | 用请求上下文约束显示及异步响应，切换后隐藏或明确标注旧数据，恢复成功清错误；日期／用户／视图切换、慢响应、503→成功分别做浏览器回归。不得把 A 的正文显示成 B 的详情。 |
| P1-I | 当前会话只查 coach_agent_turns；简历聊天、JD、面试、阶段判断没有接入，文字声称“仍走原详情”却没有入口。Trace 被固定写成“未捕获 Eval”。 | 接上原需求中的内容分区与真实关联链，复用既有只读读取能力。当前稿明确为当前稿；没有历史快照不能伪造，但不等于隐藏已有当前材料。仅对确实无关联的记录显示未捕获；有 Trace/修改 ID 的样本必须点通。所有关联 ID 重新校验所属用户、排除策略和管理员权限。 |
| P1-J | 新 `?run=` 只在 Eval 首页最新列表中查找；列表默认只返回 20 条。真实旧 run 会被误报不存在；已有 selected 还可能压过 requestedRun。 | 已有 `/api/admin/eval-runs?id=…` 精确读取目标；找到后真实定位，不拿列表第一个顶替；不在最近 20 条、404、刷新、已有选择均测试。Analytics 必须传确切关联，不按用户“最新一条”凑。全局 Eval 原有开发记录不因 analytics 本人排除被删除。 |

## 仍未完成的需求，不得写成“已开发完”

1. 三个视角需要完整的标题、可见筛选摘要、清空、自选指标列与排序。功能用业务标签选择，不要求运营记事件名。
2. 按用户需要精确 ID、当期活跃／全部已注册、新老、实际阶段、轮数范围与功能等可组合筛选。现在只有 feature 文本输入，不能完成原需求。无法证明付款时继续禁用已付款，不能伪装“未付费”。
3. 基础数据补发送与导师消息分别计数、平均条数分母、估时覆盖、断点／明确失败／未知；UV/PV/来源/成熟 D1 保留为可选数据，不把旧功能永久藏掉。
4. 会话入口直接显示当日用户列表，而不是一句“先从按用户里选”。提供日内／完整跨日会话，用户→会话→内容→Eval 可返回。`replaceState` 不能代替所有导航，否则浏览器返回无法回到上一层。
5. 正文用已有安全 Markdown 渲染，用户／导师清晰气泡和时间，不再次裸露 `**`；详情长文本独立滚动。
6. 所有页面／嵌套正文与 URL 直查继续服务器排除本人关联账号、QA 和已确认匿名标识；生产排除配置缺失仍应失败关闭。离线上大写本人排除前置检查已通过，须补其他 owner、user/session/task/opportunity/run/change 归属测试。

## 推荐返修顺序和交付

先修 A–H 的数据／读取／状态问题，补真实 store 与 route 测试；再接 I–J 的详情／Trace 和三个业务视图的缺口；最后一次性做桌面／窄屏截图与浏览器路径验收。无需知识整合 Agent、额外模型费用或数据库写操作。

必须提供：明确修改文件清单、新增回归、截图、当前不支持的字段与原因；不得以“没有历史快照”为由删掉所有简历／JD／面试详情。不能删除离线失败用例来变绿；接口改变可修改复现脚本的适配层，但保留业务断言。验收后才能由 Codex 合入发布。

```sh
npx jest lib/admin-analytics-business.test.ts app/api/admin/analytics/route.test.ts --runInBand
node scripts/audit-analytics-business.cjs
node scripts/audit-analytics-business.cjs --serve
/Users/yi/Documents/Codex/2026-07-13/github-plugin-github-openai-curated-remote/me/.agents/skills/impeccable/scripts/impeccable detect --json app/admin/evals/analytics/BusinessWorkspace.tsx app/admin/evals/analytics/Analytics.module.css app/admin/evals/analytics/page.tsx public/eval-lab/app.mjs
```

截图应基于最终 Next 管理员路径，使用隔离虚构 fixture 或明确脱敏的只读资料；本轮局部 UMD 回放不能替代生产鉴权与数据验收。`--serve` 只绑定本机 loopback，不要公开部署。

## 发布边界

- 保留已正式发布的 `3c43a40` OCR 热修，不恢复字面相似度一票否决；不追加此前已用完的两次真实模型授权。
- 不碰 Cursor 的 C 端、工具栏、打印、模型选择与聊天体验；不把主开发树中的其他候选一起发布。
- 旧作答、简历和积分原表均只读。GEO 不运行、不定时、不新增收费服务。
- 本轮只新增该验收／返修单和离线复现脚本，Grok 在途源文件保持不变；尚未向外部 Grok 发送消息，ME 的 inbox 留下接续入口。

## 本轮源码指纹

```text
7cc400f31a244ff7504b690ff05bf915ab6585af60a0b71a5a2f90376119c80f  lib/admin-analytics-business.ts
37d70c38213ade79523b0c5bbb90cd853de6ec21d476b4e7f7ffde38f76fa071  lib/admin-analytics-business-store.ts
7487a5b8c1018afaa6cb1340c33ebb02c261c98859db4cb991cdbee8911d1281  app/admin/evals/analytics/BusinessWorkspace.tsx
119f5ed79ac8730e2c55354615f320e8c937f313b2826d146c84ed5b75893fb6  public/eval-lab/app.mjs
```
