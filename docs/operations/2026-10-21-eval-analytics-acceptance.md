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

待补正式证据：生产部署ID/状态、管理员页面真实200/刷新、匿名401/无缓存、DB独立统计交叉、读材料、后台不计PV、前台新埋点落库与完整旧数据哈希对比。

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
