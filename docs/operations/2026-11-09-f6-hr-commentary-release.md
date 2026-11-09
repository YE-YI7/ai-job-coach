# F6 + 原文 HR 点评发布记录

## 用户确认与范围

用户否决 HR JSON 解析器，明确确认“保留独立 HR 点评，去掉格式解析和拒收，点评交原作者自行核实返修”，并要求上线试用。

正式入口保留 F6 原作者、v1.3资源、5工具及自主选用；接入独立新上下文 HR 点评，原文回交同一作者。没有 HR JSON/字段/题数/逐字引用解析或拒收；只有空响应、传输错误被记录为未完成。作者可以采纳、核实后修改，也可保留原稿，不把 HR 建议当新增事实。

- 作者总上限12次（含回应HR），HR最多1次，均不自动重试；不增加第二轮审稿。超时/返修失败保留已生成正文，明确未完成，不伪称通过。
- HR请求优先 `deepseek-v4-pro`，沿用现有连接/站点路由：已连接观猹账号按其模型目录执行，未连接账号仍按已配置站点托管模型路由。实际 served model、token与耗时沿现有模型遥测入Trace；不承诺所有账号都是不同权重的模型。作者模型选择与计费路由未改。
- H0a正常交稿与依据标注一起交付；身份/联系方式、账号归属、改稿范围、映射、revision/lease/CAS、保存后扣额度仍保留。内容疑点供确认，不使用词面核对拒收整稿。
- 原作者system与5工具hash保持不变。运行标识更新为 `f6-origin-runtime-v4-hr-commentary`，健康端点公开新增HR策略和上限；旧实验只读，不重写。
- 点评随artifact/quality/task summary保存。界面默认折叠，标明首稿与返修未复审；手工编辑立即失效隐藏，刷新回读历史review时按既有resumeCheckStale显示“修改前点评”，不作为当前评审。无SQL迁移，不改钱包/配额代码，不修改旧作答。

## 验证

- 15份旧HR真实输出（原来全部被协议拒收）零费用回放：15/15原样回交，不做内容裁决。只是接线验证，不是新模型质量实验。
- 全量Jest：353套、3336条通过；7套/12条既有跳过。类型检查通过；定向ESLint零错误，3条CockpitApp既有unused告警。
- 正式POST测试覆盖作者→HR→同一作者、自然语言/三问不拒收、已生成稿保留、一次额度结算、保存summary/quality；仓库FakeDb验证回读、手写失效和账号隔离，未改旧作答与积分。
- 1440×900 / 390×844 浏览器虚构夹具：折叠/展开/刷新可见，入口44.5px，无横溢或JS异常。Impeccable仅3条未改动历史色值advisory，无本次新增问题。
- 本轮新增模型调用0，费用0；没有声称付费完整新链路或真实用户云端验收已跑。用户授权本版上线试用，不将软件回归写成稿质优胜。
- 证据目录（私有，不部署）：`/Users/yi/Documents/Codex/yizhi-bench-h0ah2-20261109/plain-commentary-release/`。

## 发布

2026-11-09 13:17 UTC 已按本人授权切正式，未混入备份恢复或其他未验收实验包。

- 代码：`e50050efe1e1a7df86cfa24e76c3571ca6627a68`（前一提交 `9c78572`），分支 `codex/f6-workspace-delivery-1108` 已推送。e50050e仅补手写后历史HR点评的失效标识。
- 最终部署：`dpl_42Cf73nLbuYjZK7LYfgCuCk43YfL`，production / READY；[固定构建](https://ai-job-coach-8nwdpokdp-velmavalienteqejimu22-jpgs-projects.vercel.app)。项目 `prj_fav7gQZKEEE2JO3b8v9S9leeRhkS`、团队 `team_7qIutahimwnjCje1fOtQEPyT`。
- Next.js 16.3.0，云端构建约2分钟，类型与构建通过；既有middleware/preferredRegion弃用警告保留。先 `--prod --skip-domain`，验证后 promote 同一构建，未将preview重建冒充已验构建。
- `9c78572` 的第一次staged构建 `dpl_DNMKbRNWmLvm9R6pzTzkCkXnH2wi` 也成功，但被最终版本取代，未切到正式域名。
- 切换前只读再核正式仍是旧 `9KdZ`；切换后分别inspect `yizhioffer.com` 和 `www.yizhioffer.com`，都回指最终 `42Cf`。root健康200/数据库ok，返回v4原文HR策略、五工具与原system/tool hash；www沿既有重定向回读同健康值。
- 待发布构建和正式入口均验：首页/登录200，匿名cockpit307到登录，匿名改稿POST401（未认证，不发模型请求）。开发夹具匿名请求被登录保护307，未冒称已在生产登录态打开fixture；生产代码本身禁用development夹具。
- 指定最终部署查询最近10分钟error日志，没有返回记录；只是发布短窗，不证明真实新改稿质量或长期无错。外部drains/告警配置本轮未审计。
- 本轮没有真实账户付费生成、真实云端保存或新PDF验收；软件回放和虚构UI通过不升级成模型效果证明。旧H2失败批及费用保持原样，旧作答和积分未写入。

回滚点保留：`dpl_9KdZ48ou6dFgPbnYk2quYbimkxS9` / `ai-job-coach-81ogy5dla-velmavalienteqejimu22-jpgs-projects.vercel.app`。只有出现需要回滚的实际问题并按用户授权范围处理；本轮未回滚。
