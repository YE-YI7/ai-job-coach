# Eval 产品数据后台验收

## 范围与权限

本人要求在既有Eval补UV/PV、用户ID/注册方式、埋点时长估算、次留和功能次数，按用户查看导师对话、简历、JD；确认保持现有简洁样式、默认30天、只供现有管理员。运行代码提交 `29365ea16f8927e26f55d7d64c6749e838bf15c4`；不修改认证名单，不创建公开数据站，不调用模型/短信/付款/积分兑换，不写旧作答、用户资料或钱包。

入口：`https://yizhioffer.com/admin/evals/analytics`。Eval运行页顶部“数据”进入；原运行/反馈/方案对比保持。

口径和边界见 `docs/product/2026-10-21-eval-analytics.md`。关键：北京时间自然日；统一页面事件与旧三入口分开，不双计；匿名/账号不跨身份合并；只统计成熟注册批次D1；会话间隔估时而非真实前台停留。已知测试/预览/internal剔除，未标记QA和历史host缺口保留。不将历史缺覆盖说成0。

## 本地与隔离Chrome

- 70项Jest（13套）：新统计/分页/权限/字段白名单/遮蔽/服务端host环境，以及既有模型菜单、简历对话、Markdown/流式/减动效回归全部通过；16项既有Eval脚本通过。
- 类型检查和本次TS/TSX定向lint通过。Next本地构建成功，136/136静态页与两个新动态路由；未改依赖清单。中间件等框架既有弃用告警不扩修。
- 独立隔离副本 `/tmp/yizhi-analytics-acceptance.r97sw2`：只含合成账户、导师和资料，模拟API与本地认证绕行仅存在该临时副本，没有进入产品提交。Chrome真实点击验证筛选、空态、7/30天、返回、分页、导师/简历讨论加粗无星号、材料三层、刷新重读及503错误（没有指标假0）。
- 桌面1465、手机390：页面不横向溢出；表格保留自身横滚。图表手机字体修正为32 SVG单位、344px图实际13.76px。焦点遵守本人否决彩框/灰框的既定约束，用标签加粗/“输入中”/下偏柔影。减少动态效果关闭新增详情入场。
- 截图：上述临时目录 `desktop-final.png`、`mobile-final.png`、`focus-event.png`、`focus-user-mobile.png`、`material-mobile-body.png`；全部合成数据，不是正式数据证据。
- Impeccable手动扫描一次+一次复核，剩现有Eval等宽ID栈未列根DESIGN的提示；独立finish-review要求两项修复后逐项resolved/ship，未扩称生产通过。独立documenter确认无需新增全局设计token；已同步surface brief已完成本地验收，未擅修历史Trace宽度文档漂移。

## 正式发布与实测

Preview `dpl_aQrGi5hnBdtwASyFQMiJa7xF22tM`，READY，3m2s，原版代码29365ea；匿名访问新页面跳登录。正在使用现有Vercel网页登录，对同代码做普通Production重建（不是staged+promote，不冒称相同Preview构建）。正式环境不新增凭据、不调安全策略。

首次Production `dpl_8iDRN468EnkQn2xcPh83xNRy4Km2` READY（3m14s）后，真实核数发现历史埋点存在无法关联当前users的ID，原实现把活跃账户算到113而当前账户60。没有将其认作测试/机器人，也没有改表或归并账号；补充互斥未关联记录桶并排除产品指标，提交 `bddf3da8ccc0df60c6b9bf8d9a2c3c8c5e8c953b`，新增回归覆盖。

最终Preview `dpl_7xNiG2tiwsvMeyMuPaVXxa5ZYwRU` READY（1m42s）；最终Production `dpl_Bn7H9dhYwycRmVkdK34D8Ke3JP7w` READY（3m10s），正式域名已指向该构建。地址 `https://ai-job-coach-m110pvlc4-velmavalienteqejimu22-jpgs-projects.vercel.app`，代码bddf3da。均为普通Production重建，不冒称相同预览构建promote。

### 实际页面与权限

- Chrome从正式Eval iframe内“数据”进入正式新路由，既有管理员会话正常；刷新重读，7天UI筛选、7/90天真实API200、恢复30天通过。匿名无Cookie请求401；成功及拒绝路径使用私有不缓存。非管理员403与伪造metadata提权是单测反例，不冒称另一个真人账号实测。
- 原账号导师辅导20条/页、简历讨论4项、历史聊天10条、岗位11项均真实读取200且private,no-store。当前表历史消息角色仅user/assistant（聚合核对），没有读取模型prompt或凭据字段。
- 只读展开已有 `Cursor 前端验收（虚构）` 档案，当前工作稿仍含QA-CURSOR-SAVE-2，源文仍含QA-CURSOR-TAIL，JD非空；原有手改和源文独立保存。未新建账号/机会、未发送任何导师消息或运行改稿。
- 管理员后台刷新前/后，该账号page_viewed均0；新开正式首页变1，刷新变2；两条host=yizhioffer.com、environment=production、page=/均真实落库。仅本次2条前台访问及既有首页埋点是预期新增遥测，未声称它们是自然增长用户。
- 正式截图 `production-overview.png`、`production-mobile.png` 在上述临时目录；手机宽390、文档宽384无页面横向溢出。完整数据加载后拍摄，非加载骨架。CDP设备模拟已清除；正式后台保留为交付页。

### 独立复算

固定窗口北京时间2026-09-22起至 `2026-10-21T12:01:00.997Z`（API读取时刻，非全天结束）。后续访问继续增加，不把此快照当实时常量。Supabase独立SQL与实际同源管理员API逐项一致：

| 指标 | API | 独立SQL |
| --- | ---: | ---: |
| 当前账户 / 新增 / 活跃账户 | 60 / 23 / 24 | 60 / 23 / 24 |
| 产品事件 | 933 | 933 |
| 已标测试等 / 未关联 / 诊断 | 134 / 611 / 107 | 134 / 611 / 107 |
| 统一PV / UV | 10 / 10 | 10 / 10 |
| 可观测秒数 / 会话 | 33795.126 / 418 | 33795.126 / 418 |
| 注册D1返回 / 成熟分母 / 待成熟 | 3 / 22 / 1 | 3 / 22 / 1 |

会话均时长80.8496秒、注册D1约13.636%；不是实际前台停留或全体自然人留存。新页面UV/PV只从本次上线有记录，旧入口单列，不补造历史。复算SQL保存在同目录 `2026-10-21-eval-analytics-recompute.sql`。

最终71项Jest（13套）与既有16项Eval脚本通过，类型/lint和云构建通过。未改既有模型菜单、对话流式/Markdown、前台编辑和PDF逻辑；本轮未新做模型/PDF收费调用，不冒用之前PDF验收作为新功能的模型效果证据。正式health返回ok/databaseok、匿名401；未把短时检查扩称长期基础设施健康。

## 数据保护基线

整行哈希算法 `md5(string_agg(t::text,'' order by t::text))`，只记录计数与哈希，不记录原文。

| 表 | 发布前行数 | 发布前哈希 |
| --- | ---: | --- |
| interview_answers | 41 | 4e13749d834d65ba1213c5da9faedd54 |
| watcha_point_wallets | 1 | 911203ce80ef77ab10df3a333e393dab |
| watcha_point_transfers | 1 | 772e13a5cd6cb3bc100c6caf337f56da |
| watcha_point_reservations | 6 | d9074173be468ca74a52a9f975befdfd |
| coach_opportunities | 36 | c485f8bd28f7fc4956f9a3b6916a0475 |

本次不新增测试账户/机会、不新开导师对话、不发短信、不调用模型；明细读取只返回白名单字段，联系方式/可识别凭据遮蔽，所有管理员API按请求校验权限且private/no-store。

最终重读上述五张表的行数与整行哈希全部与发布前一致（41/1/1/6/36），包括归档虚构QA在内的全部机会也未变化。没有执行数据迁移、积分兑换、充值或外部配置变更。临时合成验收服务停止，ME共享仅更新本地业务交接，未提交其他协作者暂存项。
