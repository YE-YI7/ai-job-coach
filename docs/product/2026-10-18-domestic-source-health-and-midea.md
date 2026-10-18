# 国内招聘源核验与美的社招接入 · 2026-10-18

本轮由 16:01 UTC（America/Los_Angeles 09:01）的来源心跳触发。先读仓库规则、业务作战盘、10-08 原始契约和 10-18 早间巡检报告，再用当前代码与正式版本复核；不把早间结果当本轮请求。

## 当前状态

美的官方匿名社招适配器已上线；运行代码为 `b5b0280` 加硬筛接线修复 `ad1dc4b`，来源版本为 `cn-official-v8-ten-sources`。2026-10-18 16:24 UTC，新旧正式域名均回读为同一实测构建 `dpl_2u85L5vXPHLWDL7QUKHtRHRZqsD9`、`sourceCommit=ad1dc4b`、READY/production，未切主域或改变认证/支付配置。

本次只改来源层和对应测试，不调整 UI、简历/方向/地点策略、最终推荐数量、用户账号、旧作答或余额。不调用真实用户付费推荐、模型或充值，不使用用户浏览器、Cookie、登录、验证码或认证凭据。

## 正式基线与既有九源

本轮先读正式域名部署信息：`www.ai-job-coach.xin` 与 `yizhioffer.com` 均指向 `dpl_GwtXnw5nQf7iboAUHc52F1Vr7eGS`、`sourceCommit=18f7fc6`、READY/production，同一项目 `prj_fav7gQZKEEE2JO3b8v9S9leeRhkS`。MCP 返回团队 403 后，按相同团队的既有授权 CLI 回退读取；未重新认证、改变权限或读密钥。

新旧裸域及 www 共四个 `/api/health` 跟随既有重定向均 HTTP200、`ok:true,database:ok`。正式 `POST /api/coach/jobs/discover` 匿名返回应用 401「请先登录」，没有进入收费推荐。来源代码与此正式提交比对后才开始修改，不把待发 UI 改动作为基线。

修改前九源真实烟测 9 次请求、0 失败、0 截断，7446ms、300 条原始国内候选；三个关键词对照再 6 次请求，4 项 live 验收通过。另有来源/筛选/核验/恢复定向 12 套 158 项通过。这是本轮初始基线，和下方十源最终验收分开记录。

## 新来源：美的官方社招

### 来源与实际请求

- [美的招聘官网](https://recruit.midea.com/)及其公开前端 `recruitOut.1c6d674982bfb40db2dc.js` 声明 `/backend` 下的列表和详情接口；公开 `app-home.252f5e0b6c133a0c95a0.js` 使用 `publicationName`、`pageIndex`、`pageSize` 查询社招岗位。
- 匿名 `POST https://recruit.midea.com/backend/rec/home/out/official/position/list`，表单编码 `pageSize=40&pageIndex=1&publicationName=产品`；没有 Cookie、Authorization 或 sessionId。只发送过闸后的岗位关键词，不发送简历、姓名或联系方式。
- 产品查询：官网 `total=42`、首批 40 条，适配器保留 37 条国内有效在招候选。物流查询：原始 4 条，仅保留合肥 1 条；另外三条的原文地点明确是埃及、越南、巴西，不冒充国内岗。物流有效 ID 不在产品结果中，证明关键词确实影响返回。
- 首条工艺工程师岗位 `8a5ea4809f6fc65f019f7d09aef40468` 的同编号详情 `GET /backend/rec/home/out/official/position/info/{id}` 真实 HTTP200，ID、标题、地点、职责、任职要求与列表一致。该核验不拼接详情中的关联推荐岗位。
- 官网前端明确将社招条目导航至 `/recruitOut/ihr/social/jobApplication?positionId={id}&recruitType=social`；本轮按列表原 ID 打开此公开页面 HTTP200。页面 shell HTTP200 与同 ID 详情正文核验是两项证据，未把 shell 当作正文。

### 运行时边界与硬筛

美的列表已带 `postDuties`、`qualification`、`education`、`minWorking`、`maxWorking`，因此运行时每关键词只读一页、最多 40 条，不再发详情请求。只接收合法 32 位源 ID、公开且在招 `releaseStatus=1/isInternalApply=N`、明确国内地点和有实质文字的职责/要求；丢弃空、占位、已结束、未来开始及异常日期条目。保留原工作地点与门槛文字，剥离 HTML/脚本，不带出人员字段。不把创建、更新或计划起始日期冒充首次发布日期，`postedAt=null`。

发布前补测发现初版仅写「官网工作年限字段：3-5年」，现有硬筛不识别这段结构化门槛。新增失败用例复现后，改为「3-5年工作经验」，并为各字段保留分句边界；同样的源码字段现在进入既有学历/年限硬筛，长部门名称不会吞掉证据。没有改年限判定规则、放松门槛或把制造岗位自动推荐给产品经理用户。

国内源数从九到十；既有路由按来源数动态预留每源首查，所以官方查询预算从 9 到 10，连同两次公开搜索和一次批量读取仍按 `3 + DOMESTIC_SOURCE_IDS.length` 明示总预算 13。新增这一请求对应新增公司，不靠临时抬高预算隐藏多级请求；原九源的首查机会不受影响。比亚迪仍未接入，列表/详情共享实际预算和部分失败处理仍是它的前置条件。

### 最终真实来源验收

```sh
JOBS_SOURCE_SMOKE=1 NODE_USE_ENV_PROXY=1 npm test -- --runInBand lib/jobs/domestic-sources.live.test.ts
```

最终 5 项 live 测试通过。十源主烟测 10 次请求、0 失败、0 截断，13856ms、337 条原始国内候选：

| 来源 | 产品关键词有效候选 | 用途边界 |
| --- | ---: | --- |
| 腾讯 | 40 | 社招；列表摘要不冒充完整要求 |
| 网易 | 40 | 社招 |
| 百度 | 20 | 社招 |
| 美团 | 38 | 社招 |
| 京东 | 5 | 应届招聘，不冒充社招 |
| 快手 | 40 | 校招/实习，不冒充社招 |
| 小米 | 38 | 社招；含汽车/硬件业务 |
| 滴滴 | 40 | 官网社招入口，资格以原文为准 |
| 小红书 | 39 | 国内在招且职责/要求有效 |
| 美的 | 37 | 官网社招入口；家电、楼宇科技及制造等业务 |

此外，小红书产品39/物流11（11个不同ID）、滴滴40/37（36个不同ID）、小米38/37（37个不同ID），共6次请求；美的产品37/物流1（1个不同ID）另2次，最后额外1次同编号详情验收。最终 live 套件合计19次真实匿名请求，其中适配器18次、专用于验收的美的详情1次，不能把详情藏在运行时 `calls=1` 中。全套约25秒，不将本机来源成功扩大为云端长期稳定或真人付费推荐已验收。

337条是原始候选，最终仍需按用户简历、方向、国内地点和硬门槛筛选、核验与评审，最多展示5条、首屏3条；没有爬到多少就展示多少。

## 待接入来源与失败报告

- **字节**：本机官网及其当前 `pc.aaf0da03.js` HTTP200，仍可见 `/position/list` → `/position` 的映射；本轮两个公开列表页面均 HTTP404、正文 `Not Found`。未猜造内部参数或使用验证码/认证信息，仍未接入。
- **阿里/通义**：官网及公开 `subsidiary.min.js` HTTP200，按其公开 `ty_group_official_site`、language、关键词、分页参数匿名请求 `/position/search` 仍 HTTP403 `Forbidden`，确认后停止。网页读取服务超时不等于本机官网不可达，单个站点结果也不冒充阿里全集团。
- **B站**：本轮官网与当前 `app.b102573e.js` HTTP200，公开脚本声明 `/api/rts/position/query`；匿名请求返回 HTTP200但业务 `code=-101,message=ajSessionId不能为空`。没有借用户会话、补造 session 或绕过限制，仍未接入。这是本轮新请求，不沿用早间连接失败判断原因。
- **比亚迪**：当前公开社招脚本及匿名质量列表可读；列表 HTTP200/code0/total1，再对原 ID `2054491604131110913` 请求详情 HTTP200/code0，深圳主任感知质量工程师的职责、专业、本科及5年以上PQ经历要求可读。`publishTime=null`，不从关联岗位借日期。列表/详情共2次真实研究请求；没有将质量岗推荐给产品方向。

新研究来源先经过 agent-reach 的公开搜索/网页路径定位，再读取官网已公开页面、静态脚本与只读接口；索引只用于定位，不作为已接通证据。未使用个人浏览器或 Cookie，不调用投递/收藏/个人简历等写入接口。agent-reach v1.5.0 本轮检查仍是最新，无升级。

## 回归与保护

- 最终来源、路由隐私/故障、硬筛、个性化、决策和恢复：11套177项通过，其中美的31项自制字段测试。硬筛接线缺口先有失败复现，再修复通过。
- 最终类型检查通过；本次7个代码/测试文件 lint 0 error，1个原有路由测试 unused-vars warning。没有修改 UI 文件，不运行 UI 扫描、不启用自动钩子。
- 最终 `ad1dc4b` 固定提交的干净快照全量2418通过、10跳过、4失败；241套通过、1套失败、5套跳过。失败仍为既有 `app/api/opportunities/analyze/route.test.ts` 的 Manus、Greenhouse、Lever、Ashby 公开JD导入，预期200而收到503；未把本次验收报为全绿，也未扩修无关导入逻辑。最终云端 webpack、TypeScript 与132页构建通过。
- 当前共享工作树有其他任务的认证、UI、照片与材料改动；仅显式提交本任务7个代码/测试文件，从固定提交生成独立干净归档部署。完整第三方脚本、JD、人员字段、私有数据和临时证据不进入Git。
- 无数据库迁移、真实用户资料/旧作答/余额写入，无充值或真实用户模型调用。不用健康端点代替登录、推荐质量或各源在云端的长期验收。

## 发布结果

代码提交 `b5b0280`、`ad1dc4b` 已推至既有独立分支。对 `ad1dc4bee3b423775e6251ea8689e70ea965e765` 做独立干净归档，无共享工作树的未提交UI/照片改动；按已有团队和项目部署 Production `--skip-domain`，候选 `dpl_2u85L5vXPHLWDL7QUKHtRHRZqsD9` 完成云端构建，回读项目和 sourceCommit 均正确。

候选通过已授权CLI的部署保护通道读取 `/api/health` HTTP200、`ok:true,database:ok`，匿名 `POST /api/coach/jobs/discover` 应用401「请先登录」；未使用应用登录态。发布前再次回读旧www仍是本轮基线 `18f7fc6/dpl_GwtXnw5nQf7iboAUHc52F1Vr7eGS`，没有覆盖其他会话的新发布，再promote上述同一构建。

16:24 UTC正式回读：`www.ai-job-coach.xin` 与 `yizhioffer.com` 均为 `ad1dc4b/dpl_2u85L5vXPHLWDL7QUKHtRHRZqsD9`、READY/production、原项目。四个新旧裸域/www `/api/health` 跟随原重定向均HTTP200、数据库ok；旧www匿名搜岗仍应用401。此部署最近5分钟error查询没有返回条目，仅是短窗口，不等于持续健康、所有来源已在云端长期跑通或真实付费推荐已验收。

日检仍沿用同一自动化、原日程和目标线程，清单更新为十源并保留比亚迪的实际预算/部分失败前置条件。旧域、主域、OAuth/短信/支付配置与用户资料/旧作答均未修改；新域观猹独立客户端仍等待运营交付，不能把本次来源发布写成该登录问题已解决。

初版 `b5b0280` 的 `dpl_3MnndNy5b4pKERxmGJq32gqNf6wQ` 因补测发现年限接线缺口，虽然构建成功但未promote，不作为正式发布结果。必要时的已核实回退构建是原 `dpl_GwtXnw5nQf7iboAUHc52F1Vr7eGS`，本轮未执行回退。
