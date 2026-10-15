# 国内招聘源每日核验 · 2026-10-15

## 已接入来源

当前代码实际为八源，不沿用旧巡检笔记的七源状态：腾讯、网易、百度、美团、京东应届、快手校招/实习、小米、滴滴。按当前适配器发匿名公开请求，没有账号、用户 Cookie 或模型调用。

执行 `JOBS_SOURCE_SMOKE=1 NODE_USE_ENV_PROXY=1 npm test -- --runInBand lib/jobs/domestic-sources.live.test.ts`，三个真实来源验收用例全部通过：

| 来源 | “产品”国内原始候选 | 招聘用途 |
| --- | ---: | --- |
| 腾讯 | 40 | 社招，列表摘要不冒充完整任职要求 |
| 网易 | 40 | 社招 |
| 百度 | 20 | 社招 |
| 美团 | 38 | 社招 |
| 京东 | 5 | 应届生招聘 |
| 快手 | 40 | 校招/实习 |
| 小米 | 38 | 社招，含汽车/硬件业务 |
| 滴滴 | 40 | 官网社招入口；具体资格以岗位原文为准 |

主烟测八次请求、零失败、零截断，共 261 条原始候选，5763ms。另做四次关键词对照请求：滴滴“产品”40、“物流”37，其中31个物流ID不在产品批次；小米38/37，其中37个物流ID不同，汽车/硬件与职责/要求断言通过。以上是候选和来源证据，不是推荐数量、推荐质量或云端付费搜岗端到端验收。

来源解析、国内筛选、关键词隐私闸、个性化与岗位决策等八套100项回归通过。未改变简历/方向/国内地点/年限学历等硬门槛、原文引用和少量展示规则。

## 阿里官方入口进一步定位：尚未接通

本轮通过 agent-reach 的公开网页/脚本只读研究路径核对官方入口，不使用搜索索引充当官网直连。集团入口 [talent.alibaba.com](https://talent.alibaba.com/) 当前引用公开脚本 `https://g.alicdn.com/platform/new-careers-portal/2.0.4/alibaba-group.min.js`；脚本中集团站的 `./pages/off-campus` 映射至 `RoutePage404`，不能继续把集团根域的旧职位列表路径当成现行统一列表。此为静态路由证据，不扩大为所有阿里职位入口不可用。

脚本实际使用的公开页面配置 [recruit-page-home.json](https://fc.alibaba.com/0.0.7/default/recruit-page-home.json) 列出了阿里云、淘天、通义、菜鸟、高德、钉钉等独立招聘入口。这些链接只用于后续来源导航，**不能因此把整组公司登记为已连接**。

按配置链接核对 [careers-tongyi.alibaba.com](https://careers-tongyi.alibaba.com/)，当前公开配置站点别名为 Token Foundry，社招 channel 为 `ty_group_official_site`。其 `subsidiary.min.js` 声明只读列表 `POST /position/search`，请求字段为 `key`、`pageIndex`、`pageSize`、`channel`、`language` 等。使用官网声明的参数、匿名自有 User-Agent、不带 Cookie/Authorization，产品关键词请求返回 **HTTP403 / Forbidden**；一次补读确认同样403后停止。未借用用户会话、未构造认证/反爬凭据、未调用投递/收藏/简历接口。403不解释为“没有岗位”，通义及阿里仍不加入运行时覆盖。

原始公开脚本只留 `/tmp/yizhi-alibaba-{app,vendors,subsidiary}-20261015.js`，不将整份脚本、页面临时 token 或招聘联系人字段写入 Git。字节、小红书、B站本轮没有完成新的匿名列表/详情验收，保留此前未接通状态，不把历史错误码伪称今日实测。

## 非互联网来源：比亚迪复核

按此前已读官方社招脚本字段，匿名请求 `https://job.byd.com/portal/api/portal-api/position/queryList`：`searchType:1`、`zpType:"00251"`、`vagueCondition:"质量"`、`pageNum:0`、`pageSize:10`。返回 code0、total1，深圳“主任感知质量工程师”，ID `2054491604131110913`。

同ID `POST /portal/api/portal-api/position/queryDetail` 返回 code0，标题/城市一致，`tagDetailList` 的工作职责、任职要求可读，保留车辆工程/机械/材料等专业、本科及5年以上相关经验等门槛。`publishTime` 仍为 null，不借创建时间、读取日期或关联岗位日期替代。列表自身的 `detail`、`tag` 为空，不能省略详情请求后伪称已获得全文。

比亚迪仍是研究源，未新增适配器。当前 `searchLiveJobs` 按源/关键词任务计调用数，一项任务内增加详情扇出会低报真实请求预算。下一步应先给列表+详情设计独立的实际请求预算、部分失败和字段归属回归，再考虑接入；不把这条质量岗位直接展示给产品经理用户，也不以少量公开岗位证明全行业覆盖。

## 发布与数据边界

本轮仅增加本报告，无运行时代码、UI、环境变量或数据库变更，不重复部署。两个正式域名 `/api/health` 跟随既有重定向后均200、`{ok:true,database:"ok"}`；不把健康检查当来源或用户流程验收。

没有真实用户付费推荐、模型调用、充值、用户资料/旧作答/余额写入，也未操作 Chrome 登录态。既有八源本轮无新增异常，阿里/比亚迪尚未新增运行时覆盖，无需用户决策，按心跳要求保持安静。只提交本报告，不带入另一任务的 Chrome 诊断文档、`.impeccable/build/` 或共享业务文件的其他改动。
