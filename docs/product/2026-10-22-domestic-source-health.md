# 国内招聘源每日核验 · 2026-10-22

心跳触发16:00 UTC，本轮检查16:00—16:05 UTC。先读当前AGENTS、ME益职作战盘、10-08来源契约与10-21最近日检。没有运行时代码修改、新适配器、数据库变更或部署；以下研究不计入已接通数量。

## 当前代码与正式版本

当前HEAD `47725a0`，国内来源仍 `cn-official-v8-ten-sources`：腾讯、网易、百度、美团、京东应届、快手校招/实习、小米、滴滴、小红书、美的。`git diff ad1dc4b HEAD` 及 `git diff 0bdaafa HEAD` 对 `lib/jobs/live-sources.ts`、`lib/jobs/domestic-sources.live.test.ts` 均无差异；这两文件工作树也未改。

现有Vercel CLI只读核对项目 `prj_fav7gQZKEEE2JO3b8v9S9leeRhkS` 后，正式 `yizhioffer.com` 解析到 `dpl_E3MjDgmagEMXJSn1qYbFiqMLYLWN`，READY/production；部署详情 `githubCommitSha=0bdaafa6f9212276e93d87bf8d85d2ec2caa39e5`。`/api/health` HTTP200、`ok:true,database:ok`；匿名 `POST /api/coach/jobs/discover` HTTP401「请先登录」。未带用户会话，没有进入收费推荐，也没有读写用户材料、作答或积分。

因此本轮公开适配器测试与正式版来源代码一致，但测试运行在本机服务端环境，不声称逐个源在云端或真人推荐端到端已验。

## 十源真实匿名公开请求

执行当前显式开启的测试：

```sh
JOBS_SOURCE_SMOKE=1 NODE_USE_ENV_PROXY=1 npm test -- --runInBand lib/jobs/domestic-sources.live.test.ts
```

首轮5项全部通过，没有重跑。十源主烟测10请求、0失败、0截断，8949ms，326条原始国内候选：

| 官方源 | 产品关键词候选 | 用途边界 |
| --- | ---: | --- |
| 腾讯 | 40 | 社招、单公司；列表摘要不是完整任职资格 |
| 网易 | 40 | 社招 |
| 百度 | 20 | 社招 |
| 美团 | 38 | 社招 |
| 京东 | 5 | 应届，不能当社招覆盖 |
| 快手 | 40 | 校招/实习，不能当社招覆盖 |
| 小米 | 38 | 国内社招，含汽车/硬件 |
| 滴滴 | 40 | 官网社招入口，具体门槛按原文 |
| 小红书 | 39 | 国内在招，职责与资格有效 |
| 美的 | 26 | 社招，家电/制造/楼宇等业务 |

关键词对照额外8次适配器请求：小红书产品39/物流11，物流有11个不同ID；滴滴40/38，36个不同ID；小米38/38，38个不同ID；美的26/2，2个不同ID。美的另1次公开原ID详情读取，编号、标题、职责和资格与列表一致。

完整live套件20.82秒，实际19次招聘源请求＝主测10＋关键词对照8＋美的验收详情1；验收详情不是运行时适配器内的隐藏请求。美的当前运行时列表自带完整职责/资格，仍每次1请求。岗位数量变动不等于适配器故障，也不删除10-20曾有首轮失败的历史。

326不是推荐数。保留简历、方向、国内地点和学历/年限/应届等硬筛、原文引用与最终最多5条/首屏3条；不把新增制造业候选直接推荐给互联网求职方向。

## 优先来源研究与未接入原因

全程使用公开页面、其实际引用静态脚本和已声明只读接口；请求使用益职自身User-Agent。没有浏览器登录态、Cookie、验证码、会话伪造或反爬绕过。网页阅读工具只作页面定位，不当作直连列表成功证据。

### 字节：当前experienced入口可读，仍无列表/详情验收

- [当前社会招聘入口](https://jobs.bytedance.com/experienced/position?keywords=%E4%BA%A7%E5%93%81)匿名HTTP200。不能再引用旧根路径 `/position` 的404概括当前官网入口失效。
- 当前页面引用公开 `pc.0a6af3b7.js`，与昨日 `pc.aaf0da03.js` 不同；脚本HTTP200。页面与脚本只作有限阅读，未遍历全部资源。
- 公开PC脚本可见 `getPositionDetail`／`job_post_detail` 调用，但尚未核出可验收的关键词列表和同ID完整详情契约；未猜内部API、执行验证脚本或补造会话。页面200和函数名不是接通证据，仍未接入。

### 阿里/通义：公开页面可读，列表拒绝后停止

- [通义招聘页](https://careers-tongyi.alibaba.com/)与其实际引用的 `2.0.7/subsidiary.min.js` HTTP200，公开脚本仍声明 `POST /position/search`、channel和language参数。
- 使用原公开channel `ty_group_official_site`、language、产品关键词及分页做一次匿名列表请求，HTTP403、JSON message `Forbidden`，随后停止。不解释成没有岗位，不切换身份或补认证。
- 这是通义一站结果，不概括整个阿里集团。昨日阿里控股入口网络失败的记录保留，本轮没有复验该入口。

### B站：列表仍缺官方要求的会话

- [招聘官网](https://jobs.bilibili.com/)HTTP200，当前公开position资源 `position.50d6a17b.js` 可读，并声明原ID详情路径 `/api/rts/position/query/{id}`。
- 对既有公开列表入口 `/api/rts/position/query` 做一次空JSON匿名诊断：HTTP200、业务code=-101、message「ajSessionId不能为空」。这是拒绝诊断，不是产品关键词列表验收。
- 不补造ajSessionId，不借Cookie，没有尝试详情ID枚举，仍未接入。

### 非互联网：海尔列表继续可读，比亚迪前置条件保留

- 沿昨日已由海尔集团官网确认的 [海尔社招入口](https://maker.haier.net/client/job/index)匿名HTTP200；没有重新读取集团链接页，官方归属沿用10-21已核证据，不伪称今天又验了一次集团链。
- 已声明 `POST /client/job/searchdata.html` 分别用产品、物流关键词与 `page=1,pagesize=3`、公开source/core_job空字段请求，均HTTP200、status=1，各返回3条。产品前三ID为10232315/10232251/10231995，物流为10232187/10231621/10231458，未复用同一批结果冒充关键词生效。
- 列表字段实际含 `job_name/location/func_desc/education_required/work_experience`；本轮只核字段、不同ID和列表返回，没有逐条核完整资格，也没有重跑详情。不保存或输出招聘联系人、薪资原始对象或完整第三方JD。
- 海尔仍是研究源；比亚迪本轮未重跑，沿用研究状态而不把旧详情当今日实测。两者接入前均须完成列表＋详情共用实际预算、既有源首查保障、部分失败可见与同ID字段归属回归，不能把多次详情请求藏成一次调用。

研究共15次本机可计数直连：四入口页面4次、其页面/静态脚本有限复读7次、通义/B站拒绝诊断2次、海尔两关键词2次。与live19次合计34次；另有网页阅读工具读取三个官方入口，不把工具内部出网次数猜入此计数。未全站抓取、广泛翻页、自动重试或调用付费检索/推荐模型。

## 回归、保护与收尾

8套124项确定性回归通过：`domestic-sources`、`domestic-expansion`、`live-sources`、`personalization`、`retrieval-gate`、`open-search`、`search-recovery`及harness retrieval；另计上述1套5项live。没有全量测试、类型检查、生产构建或UI扫描，本轮不沿用旧结果冒充重跑。agent-reach v1.5.0仍最新，未升级。

只新增本报告；其他会话的analytics交接、前端/工具栏/打印、存储报告和昨日巡检订正保留，不夹带提交。无运行时、环境、第三方配置、数据库或用户数据修改；没有模型、短信、充值、积分兑换，也未运行会创建QA/写数据的旧synthetic验收脚本。

当前 `vercel.json` 已对 `codex/production-release` 关闭Git自动部署；本轮仅文档提交，不手动部署或promote，不更换正式域名。前一主任务候选的浏览器/PDF门禁仍待，不因来源巡检通过而放行。

结论：十源当前匿名实测通过，未新增可发布来源、未完成来源修复、无重大失败或用户决策事项，保持静默。后续仍优先字节当前入口的公开列表/详情契约；阿里与B站遇拒绝守边界，海尔/比亚迪先补多请求预算与部分失败再接入。
