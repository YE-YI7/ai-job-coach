# 国内招聘源每日核验 · 2026-10-17

## 结论与当前版本

已接入的九个官方适配器本轮全部通过真实匿名请求核验，没有新增运行时来源、修复或重大故障；维持正式版本，不重复发布。当前工作分支为 `codex/resume-block-repair-1016`、文档 HEAD `907099a`，适配器版本 `cn-official-v7-nine-sources`。正式部署 metadata 核对为 `b4ab64a681e0f24d794dd9cba14dab25c161d162` / `dpl_Fmb9XPpp9qAY4FWzbXt2CVrQKRZQ`，项目 `prj_fav7gQZKEEE2JO3b8v9S9leeRhkS`，READY / production。

共享主 checkout 仍有其他任务的认证、支付和样式改动；本轮只在已有干净工作树增加本报告，不带入协作者改动。

## 九源实际公开请求

运行 `JOBS_SOURCE_SMOKE=1 NODE_USE_ENV_PROXY=1 npm test -- --runInBand lib/jobs/domestic-sources.live.test.ts`，4个真实来源验收通过。主烟测9次请求、0失败、0截断，5957ms，300条原始国内候选：

| 官方来源 | “产品”候选 | 用途边界 |
| --- | ---: | --- |
| 腾讯 | 40 | 社招，列表摘要不冒充完整要求 |
| 网易 | 40 | 社招 |
| 百度 | 20 | 社招 |
| 美团 | 38 | 社招 |
| 京东 | 5 | 应届招聘 |
| 快手 | 40 | 校招/实习 |
| 小米 | 38 | 社招，含汽车/硬件业务 |
| 滴滴 | 40 | 官网社招入口，资格仍以原文为准 |
| 小红书 | 39 | 社招，在招且正文有效 |

另6次匿名请求做关键词对照：小红书产品39/物流11，11个物流ID不同；滴滴40/37，36个物流ID不同；小米38/37，37个物流ID不同。检查原页HTTPS链接、国内地点、正文与资格字段；小红书继续剔除占位正文，不以首页可读代替适配器成功。

来源解析回归5套68项，个性化、关键词隐私闸、岗位决策、检索/核验与搜索恢复回归6套84项，共11套152项通过。本轮无运行时修改，未重跑全量229套；10-16的全量结果不冒充今日结果。简历/方向/地点及学历、年限、校园身份硬门槛、原文证据与少量展示策略未改。300条是原始候选，不是推荐数量，也没有运行收费模型评审。

## 未接入来源研究与失败记录

使用 agent-reach 的公开网页阅读路径定位，再按官网已公开的页面/脚本字段发匿名请求；不使用用户Cookie、个人浏览器登录态或认证凭据。

- **字节**：[官网](https://jobs.bytedance.com/)直接HTTP200。当前公开PC脚本 `pc.aaf0da03.js` 包含把 `/position/list` 映射到 `/position` 的逻辑；实际 `/position/list` 响应正文是 Not Found，后续 `/position` 明确HTTP404。首页或静态配置不等于可用职位列表，本轮没有编造API参数/岗位数据，也没有接入新适配器；旧405不是今日结果。
- **阿里/通义**：[通义招聘页](https://careers-tongyi.alibaba.com/)HTTP200，当前页面配置仍明确 `portalOfficialChannel: ty_group_official_site`、Token Foundry。公开 `subsidiary.min.js` 声明根域 `POST /position/search`，按公开列表字段匿名请求产品、pageIndex1/pageSize10/channel/language，返回HTTP403、Forbidden。确认边界后停止，不换身份或补造凭据，不能解释为没有合适岗位，也不把通义单站结果扩大成阿里全集团结论。
- **B站**：[招聘入口](https://jobs.bilibili.com/)经公开网页阅读能返回介绍正文；直接请求先fetch失败，再一次25秒连接超时。未取得今日列表响应，没有把10-12的 `ajSessionId不能为空` 当今日实测错误，更不能将阅读代理拿到介绍页称为官网列表直连。暂不接入、不操作用户浏览器。
- **比亚迪/非互联网**：匿名 `POST https://job.byd.com/portal/api/portal-api/position/queryList`，使用已核对的 `searchType:1,zpType:00251,vagueCondition:质量,pageNum:0,pageSize:10`，code0/total1。再按原ID `2054491604131110913` 请求 `queryDetail`，code0、深圳主任感知质量工程师，工作职责与任职要求可读，保留本科、5年以上PQ相关经历等硬门槛。`publishTime`仍null，未用createTime替代。列表和详情共2个真实请求，不拼接关联岗位，不把质量岗推荐给产品方向。

比亚迪仍是研究源。重新核对当前代码：`searchLiveJobs.calls` 返回裁剪后源/关键词任务数，`fetchJson`没有共享实际请求计数器；若在adapter内直接追加详情，会低报出网次数。下一步应让列表和详情共用请求预算，预留各源首查机会，详情部分失败时保留成功岗位并显式报告失败，再补预算耗尽/同ID字段归属回归。本轮不把此跨层改动伪装成一个已接通的小适配器。

研究临时证据保留在 `/tmp/yizhi-{bytedance,bilibili,byd}-*-20261017.*`（B站请求未成功写入页面不算证据）；完整第三方脚本/招聘正文不进入Git。agent-reach v1.5.0检查仍为最新，无升级或新通知。

## 正式站与权限边界

Vercel MCP读取团队部署返回403，按映射使用CLI原授权、显式同团队 `team_7qIutahimwnjCje1fOtQEPyT` 成功回退；没有重认证、变更权限或读取密钥。www与裸域 inspect 均为上述同一READY部署，API选取projectId和releaseCommit核对一致。

两个正式域名的 `/api/health` 跟随既有重定向后均200、`{ok:true,database:ok}`。匿名搜岗POST返回应用401“请先登录”，没有进入推荐执行。没有新的构建、promote、环境变量、数据库或UI变更；不运行UI扫描。

本轮不调用真实用户付费推荐或模型，不写简历、旧作答、余额或充值，不使用用户Cookie。健康检查不证明云端九源长期稳定或用户收费推荐全链路；10-16记录的额度上游间歇失败并未在本轮处理或宣称修复。

没有新来源上线、重大故障或需要用户决策，按心跳约定保持安静；日检自动化仍有效，无需修改或删除。
