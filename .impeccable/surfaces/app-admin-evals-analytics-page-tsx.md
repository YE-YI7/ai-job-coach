---
version: 1
slug: "app-admin-evals-analytics-page-tsx"
primary_target: "app/admin/evals/analytics/page.tsx"
related_targets: ["app/admin/evals/analytics/AnalyticsClient.tsx","app/admin/evals/analytics/Analytics.module.css"]
---

# Eval 运营数据 · 实现与口径

授权：本人要求在现有 Eval 加看数功能，并确认沿用现有简洁样式、默认近30天、管理员私有访问。入口 `/admin/evals/analytics`，Eval 页顶部“数据”。不新建公开站点，不调用模型、短信或支付，不改用户资料、作答、积分和认证配置。

## 数据契约

- 来源：`users`、`product_events`；逐用户再读取 `coach_agent_turns`、`coach_resume_tasks`、`conversation_messages` 和 `coach_opportunities`。只读、按需、分页，不查询凭据、钱包或旧作答表。
- 时间：北京时间自然日，7/30/90天含今天至读取时刻；按服务端 `created_at`，不是不可信客户端时钟。全量账户数不受时间过滤，新增、活跃、用量受时间过滤；用户材料是当前保存记录，不冒称期间快照。
- 页面UV/PV：统一 `page_viewed` 存在时只统计此事件，历史三种页面事件不叠加；不存在时显示历史入口统计，明确不是全站覆盖。统一埋点启用前的日期是缺数据，不填0。前台路由挂载/切换且可见时一次，刷新另计；过滤后台与API，不含query或用户ID。服务端追加host和运行环境；旧事件缺host不能归到新域。匿名浏览器与登录ID不强行合并，也不能称自然人数。
- 功能次数：按事件名分别统计次数、去重标识及已登录账户，不将开始/成功/失败相加成完成次数。`resume_agent_trace`是诊断，排除活跃和使用次数。
- 时长估算：同一标识事件相隔超过30分钟另开会话，单次间隔最多记5分钟；单事件会话记0，显示其数量。会话均时长=总可观测秒数/会话数，不能称实际前台停留；没有事件为不可估算。
- 次留：期间注册用户，注册次日发生产品活动才算返回；只有次日已完整结束的批次进入分母，今天/昨天注册保持待成熟；分母0显示“待积累”。不把旧账户登录当新注册，不用`last_active`替代产品活动。
- 仅排除显式配置的internal账号、事件internal/qa/is_test、已知growth-qa来源、development/preview环境；未标记测试账号无法自动识别，覆盖说明保留。`users.provider`原样映射注册方式，空值显示未记录，不反推登录方式或补写历史。
- 服务端聚合读取限20000事件/10000账户，稳定排序分页；超限报错并要求缩小范围，绝不显示被截断的假总量。页面不自动轮询；手动刷新从后台重读，不持久化用户内容到localStorage。
- 明细每页20，正文上限60000字、单简历讨论任务最近100轮，超限明确提示。导师原始prompt、lease、fingerprint、任意metadata、文件链接不返回；仅允许字段，手机号/邮箱/Bearer/sk凭据遮蔽。工作稿复用现有只读替换函数，与原文分开标识。

## Direction contract

THESIS：扩展现有Eval的私有数据视图；先总览，再选用户读材料，不做一屏指标卡墙。模式Operate。

OWN-WORLD：继承Eval暖白、墨绿、Outfit西文与直立中文无衬线，ID等宽；表格仅行线。没有新材质、新图像或设计系统改写。

STORY：管理员先确认统计区间与覆盖范围，看PV/UV趋势、会话估时和成熟次留；再看功能、来源，按用户ID追溯导师与岗位材料。

FIRST VIEWPORT：76px同族导航；标题和7/30/90天筛选在同一行。本人反馈主要是布局层级后，左侧明确“用户使用”所选周期，右侧“网站访问”明确实际覆盖起点，避免把新访问埋点和30天账户指标混在一个清单。访问不足两天不画空大图；精确日表仍可展开。下方功能使用默认不混页面访问，埋点代码收起，勾选可查看全部。用户列表选择后原位展开，窄屏垂直堆叠，长ID可换行。

FORM：本人确认的现有后台扩展，不做新世界抽签；seed不适用。签名交互是“用户ID→只读对话/岗位→原文/工作稿/JD”渐进读取；仅新加载详情180ms轻入场，减少动态效果时关闭。

FINISH：unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance。

## 验收

2026-10-21 后续：本人明确要求排除自己的全部看板数据。通过原会话与已有手机号找回关联记录确认两个账号，生产专用排除配置保存，不更改账号或资料。账号从用户数、留存分母、流量、功能、时长和列表统一排除；五类资料直查在后台读正文前返回无记录。已确认浏览器的匿名标识单独排除，不推断其他匿名人。生产排除账号配置缺失时503失败关闭。统一页面采集覆盖起点独立于被排除访客，零外部访问仍为0，不退回旧访问数。具体发布/复算与保护哈希见 `docs/operations/2026-10-21-analytics-owner-exclusion.md`；不扩大到Eval运行记录删除。

已完成71项Jest、16项Eval脚本、136页构建及类型/lint；合成隔离Chrome桌面1465/手机390的筛选、空态、分页、对话Markdown、逐层材料、刷新与503不报假0通过。独立review两项修复均resolved；输入继续遵守本人无彩框要求。文档验收无需新全局token/图像，不扩修历史漂移。最终bddf3da/Bn7H9dh正式页面/权限/7与90天API/原账号四类明细可读；独立SQL逐项复算一致，历史未关联ID事件单列，后台不计PV，前台0→1→2落库。41旧作答/36机会和积分三表整行hash未变。详见项目operations/2026-10-21-eval-analytics-acceptance.md；未复制真实正文到报告。
