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

FIRST VIEWPORT：76px同族导航；标题和7/30/90天筛选在同一行。左侧纵向指标清单，右侧真实每日PV/UV折线与精确值表；下方两列功能/次留。用户列表选择后原位展开，窄屏垂直堆叠，长ID可换行。

FORM：本人确认的现有后台扩展，不做新世界抽签；seed不适用。签名交互是“用户ID→只读对话/岗位→原文/工作稿/JD”渐进读取；仅新加载详情180ms轻入场，减少动态效果时关闭。

FINISH：unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance。

## 验收

本地验收已完成：70项针对性Jest、16项Eval脚本、136页构建、类型/lint；Chrome合成隔离环境验证桌面1465、手机390、筛选/空态/分页/对话Markdown、逐层资料、刷新及503不显示假0。独立review两项修复（手机图表字、输入焦点）均resolved；输入按本人既定无彩框约束使用“输入中”/标签加粗/下偏柔影。文档验收确认继承既有DESIGN，无新全局token或图像；历史Trace宽度文档漂移不扩修。正式聚合/权限/埋点落库与旧数据哈希仍待发布后单独验，不复制真实材料到报告。
