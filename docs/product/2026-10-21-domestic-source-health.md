# 国内招聘源每日核验 · 2026-10-21

心跳触发于16:05 UTC，本轮核验截至16:13 UTC。先读当前仓库规则、ME益职作战盘、10-08原始契约与10-18接入/10-20日检报告。没有新增运行时来源、代码修复或部署；研究结果不计入已接入数量。

## 当前代码与正式版本

来源仍为 `cn-official-v8-ten-sources`：腾讯、网易、百度、美团、京东应届、快手校招/实习、小米、滴滴、小红书、美的。当前HEAD `ce5dfe5` 是文档提交；实际正式运行 `e7f6cb5`。从来源接入提交 `ad1dc4b` 至当前HEAD，`lib/jobs/live-sources.ts` 与公开来源live测试无差异，工作树也未修改这两个文件。

正式 `yizhioffer.com` 经现有授权CLI回读为 `dpl_9d3XJNTbQqBoaffrjohy4fK8fTCs`、`sourceCommit=e7f6cb5`、READY/production，项目 `prj_fav7gQZKEEE2JO3b8v9S9leeRhkS`。正式 `/api/health` HTTP200、`ok:true,database:ok`；匿名 `POST /api/coach/jobs/discover` 返回应用401「请先登录」，没有进入收费推荐。没有借用用户应用会话、修改旧域或第三方配置。

## 十源真实匿名请求

执行现有显式开启的公开来源测试：

```sh
JOBS_SOURCE_SMOKE=1 NODE_USE_ENV_PROXY=1 npm test -- --runInBand lib/jobs/domestic-sources.live.test.ts
```

5项live测试首轮全部通过。十源主烟测10次请求、0失败、0截断，7489ms，共325条原始国内候选：

| 官方源 | 产品关键词有效候选 | 用途边界 |
| --- | ---: | --- |
| 腾讯 | 40 | 单公司社招；列表摘要不是完整任职要求 |
| 网易 | 40 | 社招 |
| 百度 | 20 | 社招 |
| 美团 | 38 | 社招 |
| 京东 | 5 | 应届招聘，不冒充社招 |
| 快手 | 40 | 校招/实习，不冒充社招 |
| 小米 | 38 | 社招，含汽车/硬件业务 |
| 滴滴 | 40 | 社招入口，具体资格仍按原文 |
| 小红书 | 39 | 国内在招且职责/要求有效 |
| 美的 | 25 | 社招，含制造/家电/楼宇等业务 |

另外8次适配器请求验证关键词差异：小红书产品39/物流11，11个不同ID；滴滴40/38，35个不同ID；小米38/38，38个不同ID；美的25/2，2个不同ID。美的额外一次原ID详情核验，编号、标题、职责与资格均与列表一致，未拼接关联岗位。

整套18.554秒，实际共19个招聘源请求（适配器18次＋美的验收详情1次）。不把验收详情藏在运行时 `calls=1` 中，也不因候选数量随招聘更新变化就判定失败。本轮未复现10-20京东/快手首轮故障，不删除或改写那次失败记录。

325是原始候选，不是推荐数量。简历、方向、国内地点、年限/学历/应届等硬筛与原文引用保持不变，最终最多展示5条、首屏3条；美的制造岗不会因此自动展示给互联网方向。

## 优先研究来源与边界修正

使用agent-reach的Exa定位官网，再直接读取官网公开页面、静态脚本和已声明的只读入口。不使用浏览器、Cookie、登录或验证码；搜索索引只定位，不作为官网直连成功证据。内置搜索本轮未返回结果，随后使用既有Exa，不将工具无结果记为官网故障。

### 字节：纠正旧路径失效的解释

- 旧的 [根路径职位页](https://jobs.bytedance.com/position) 仍HTTP404、正文Not Found。
- 但本轮 [招聘首页](https://jobs.bytedance.com/) HTTP200，公开导航明确指向 **`/experienced/position`**；按该入口带产品关键词的 [公开页面](https://jobs.bytedance.com/experienced/position?keywords=%E4%BA%A7%E5%93%81) HTTP200。
- 因此，不能再把旧 `/position` 的404概括成「字节当前职位入口不可用」。页面包含公开构建配置，当前 `pc.aaf0da03.js` 可读；仍未完成实际关键词列表、原ID详情及字段门槛验收，没有新增适配器或猜造内部API/会话。页面200不等于取得岗位全文。

### 阿里：单站拒绝与网络失败分开

- [通义招聘页](https://careers-tongyi.alibaba.com/)与公开 `2.0.7/subsidiary.min.js` HTTP200，仍声明 `POST /position/search` 与 `ty_group_official_site`。
- 携公开channel、language、产品关键词和分页字段匿名请求，HTTP403/Forbidden后停止；未更换身份、补认证或绕过风控。不解释成没有岗位。
- Exa另定位到 [控股集团社招](https://talent-holding.alibaba.com/off-campus/position-list?lang=zh)，本机一次直接请求 `TypeError: fetch failed`。没有取得直接列表响应，不能把索引可见的职位算已接入，也不把它归因为通义的403。通义一站不等于阿里全集团。

### B站：仍未完成匿名列表验收

[官网](https://jobs.bilibili.com/)HTTP200，当前页面引用 `app.b102573e.js`。对既有公开只读 `/api/rts/position/query` 的匿名空JSON诊断返回HTTP200、业务 `code=-101,message=ajSessionId不能为空`。这是入口诊断，不是关键词功能验收；不补造session或借Cookie，仍未接入。

### 非互联网：海尔新增研究证据，比亚迪保持前置条件

- [海尔集团官网「加入海尔」](https://www.haier.com/careers/)实际链接到 [海尔社招官网](https://maker.haier.net/client/job/index)，不是仅凭相似域名认定官方。
- 社招页HTTP200，公开表单与 `basic.js` 声明 `POST /client/job/searchdata.html`，字段 `page/pagesize/key/source/core_job`；未使用登录态、Cookie或投递接口。
- 匿名产品/物流请求均HTTP200、业务 `status=1`，官网总数分别99/5，列表原ID不同。只查第一页，不把总数当作已抓取或已核验岗位数量。列表字段实际为 `job_name/location/func_desc/education_required/work_experience` 等，不能按相似站点猜成 `jobname` 或 `description`。
- 首条列表原ID `10232251` 的 [公开详情页](https://maker.haier.net/client/job/detail/id/10232251) HTTP200，可读职责、任职要求和青岛地点，要求包含相关工科专业、8年以上智能控制器软硬件经验及3年以上团队管理经验；不是普通互联网产品岗。未输出招聘人员字段或收存完整第三方JD。
- **海尔仍是研究源，不增加覆盖数量**。本轮没有证明列表已具备完整资格正文；若需详情扇出，应与比亚迪一样先完成列表＋详情共享实际预算、既有源首查保障、部分失败可见和同ID字段归属测试，不能直接接入并把多次请求算成一次。
- [比亚迪官网](https://job.byd.com/portal/pc/)HTTP200，沿已核对公开字段匿名质量列表HTTP200/code0。**本轮没有重跑详情**，不复用10-20同ID详情结果冒充今天请求。仍未接入，实际预算与部分失败处理要求不变。

研究共21次官网/其公开静态资源直接请求（包括阿里控股一次失败、字节及海尔页面/脚本的重复阅读）；与live套件19次分开，合计40次。Exa/搜索工具调用和正式站健康/权限检查不混入招聘源请求数。未执行自动重试、广泛翻页或全站抓取。

## 回归、保护与下一步

来源、扩充、制造门槛、个性化、检索/核验、公开搜索和恢复8套124项通过；另计上述1套5项live。没有全量、类型检查、生产构建或UI扫描，本轮不借用此前结果。agent-reach仍v1.5.0最新，未升级。

没有运行时、环境或数据库修改，没有模型、真实用户付费推荐、短信、充值、兑换、用户资料/旧作答/积分写入。没有运行旧两源synthetic-account验收脚本（它会建用户/写数据且断言已过时）。只提交本报告，不部署文档，不混其他会话的SEO/GEO、前端、工具栏或打印改动。

下一步先沿字节官网实际experienced入口查证公开列表/详情契约；海尔与比亚迪都先补真实多请求预算与部分失败机制，再考虑运行时接入。现有十源本轮通过，没有新源上线、未恢复重大故障或用户决策请求，按约定保持安静。
