# DS 调研落地：先发布，再测引用与有效访问

2026-10-21（America/Los_Angeles）。用户批准第一批验收后发布；本文件承接 ME 的 `益职作战盘/2026-10-22-SEO-GEO作战手册.md`，不覆盖 DS 原稿。原稿文件日期为22日，不据此把本次执行日期改成22日。

## 本次落地

先发布六个已有公开入口：官网、Agent 手册、JD 对照、Offer 比较、无业绩数字写法、四问面试复盘。此次新增是后两页；不是一次新增六页。新来源归因进入现有管理员「数据」页；不另建 PV 采集器、不统计本人及隔离验收，不发送简历/JD/对话正文。

已有 Offer 比较工具先承接「两个 Offer 怎么选」，不再立刻做同义落地页；外包岗位、秋招选择与工具比较只列为候选题，不凭下拉词就断言低竞争，也不发布未经核实的工具排名。

## 正式引用基线：沿用 DS 测试集

续接时已发现DS新交付的 `/Users/yi/me/益职作战盘/2026-10-22-AI引用基线-20题测试集.md` 与配套 `2026-10-22-AI引用基线-记录表.csv`。**引用实验只以这份DS题目及原编号为准**，先原文执行其1/3/5/9/16五题×5引擎；不拿下表替换或混合分母。CSV已核为101个实际换行、100条待填数据，不是已经运行的100个结果。

DS表里的未来承接路径不等于已上线；Offer题现由 `/tools/offer-compare` 承接，JD题现由 `/tools/resume-jd-gap` 承接，不为凑题目就复制新页面。5题试点每引擎分母5、全试点25，不称20题完整品牌基线；完整20题才使用每引擎20/全量100。版本/联网/失败状态可先补在备注，后续记录表结构调整前保持原始结果可追溯。

## 站内产品事实回归题（独立候选，非第二份引用基线）

以下20问仅为站内公开事实覆盖的候选检查清单，不当作DS引用实验，不据此汇报品牌出场率。未运行，不是真实用户输入；如未来另立实验，先另定版本与预算，不附用户材料或使用本人付费模型连接。

| ID | 固定问题 | 首选证据页面 |
| --- | --- | --- |
| G01 | 益职 AI 是做什么的？ | / |
| G02 | 益职 AI 网页版和本地 Agent 有什么区别？ | /agent |
| G03 | 益职 AI 是否需要另绑模型平台才能使用？ | / |
| G04 | 益职 AI 有哪些免登录工具？ | / |
| G05 | 简历对不上 JD，应该先检查什么？ | /tools/resume-jd-gap |
| G06 | 怎样对照岗位要求找简历里的证据缺口？ | /tools/resume-jd-gap |
| G07 | 简历关键词越多越容易通过筛选吗？ | /tools/resume-jd-gap |
| G08 | 实习没有业绩数据，简历怎么写？ | /guides/resume-without-metrics |
| G09 | 没有提升百分比，怎样体现实习价值？ | /guides/resume-without-metrics |
| G10 | 简历里参与、负责、主导有什么区别？ | /guides/resume-without-metrics |
| G11 | 没有结果数据时，简历能写哪些具体产物？ | /guides/resume-without-metrics |
| G12 | 面试结束后怎么做复盘？ | /tools/interview-review |
| G13 | 有没有不登录就能用的面试复盘模板？ | /tools/interview-review |
| G14 | 面试复盘应该记录哪几个问题？ | /tools/interview-review |
| G15 | 面试答得不好，下一次应该先练什么？ | /tools/interview-review |
| G16 | 两个 Offer 怎么比较，不只看薪资？ | /tools/offer-compare |
| G17 | Offer 信息还不全，应该先问 HR 什么？ | /tools/offer-compare |
| G18 | AI 求职工具能替我做最终职业决定吗？ | / |
| G19 | 怎么判断 AI 改简历是不是编造了经历？ | /guides/resume-without-metrics |
| G20 | 求职用本地 Agent 前，需要准备哪些材料？ | /agent |

## 测试与统计口径

- 第一轮每引擎先跑同一组20问；建议豆包、DeepSeek、Kimi、元宝、文心，是否可访问按实际记录。未运行不填0，不把拒绝/超时当作无引用。
- 全量为20问×5引擎＝100条；按引擎报告成功数/20、品牌提及数、官网带链接引用数、第三方提及数。成功样本率与完整测试集率同时保留，防止失败样本令结果虚高。
- 原始记录字段：batch_id、query_id、engine、model_version、network_mode、login_state、tested_at、run_status、brand_mentioned、own_domain_cited、third_party_mentioned、citation_urls、evidence_path、notes。证据只含合成问题和返回答案，不含账号资料、Cookie 或凭据。
- 引用指标不等于访问或转化。站内只观察受控来源、公开工具真实使用、登录/注册等现有事件；来源未传递不等于没有 AI 访问，不补造历史归因。
- 搜索单列索引、展现、点击、有效工具操作。Search Console/百度/Bing验证与sitemap提交需现有站长权限，未核对前不写「已提交/已收录」。没有排名、流量或60–90天见效保证。

## 下一包交接与门槛

1. DS：只读执行其ME原始测试集，保存证据与失败记录；先报原表1/3/5/9/16五问×各引擎的可访问性小样，再决定剩余问题。若需付费，先报总预算，不自动批量调用。
2. Grok：对答案做引用核验，区分「提到名称」「引用官网」「引用第三方」；比较同题同引擎的前后结果，不把作者自述的平台占比当全行业规律。
3. Qoder：暂不新增页面。待实际展现/点击、站内问题或引用缺口支持某一主题后再给单页 brief；每页必须有独立用户问题、真实来源和可用动作，不能只是标题换词。
4. Codex：负责当前六入口上线和来源排除核验；站长权限、下一批具体主题及任何付费订阅另行确认。本文件只准备交接，未自动给其他聊天发消息。

## 依据与限制

[Google AI optimization guide](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide) 与 [AI features](https://developers.google.com/search/docs/appearance/ai-features) 支持可靠、原创、可索引内容和常规 SEO；不是所有国内引擎的统一规范。不把固定段落长度、llms.txt、特殊 schema 当排名条件。DS 的第三方引用样本只作为假设来源，非益职效果。
