# 模型成本遥测：新调用估算口径

核验日期：2026-10-23。仅遥测；不修改旧行、模型请求/路由、重试、额度、积分、支付或旧作答。正式部署须另获本人批准。

## 单价来源与边界

实现入口：`lib/llm-cost-rates.ts`。只匹配表中准确 provider + model，未核实的模型继续 null，不用“名字里有flash/chat”推断价目。

- [Step 官方价格](https://platform.stepfun.com/docs/zh/pricing/details)：人民币/百万token，3.7 Flash 未命中1.35、命中0.27、输出8.1；5 Preview分别7、0.70、20。同时收录该表中的3.5 Flash及2603、1o Turbo Vision。
- [DeepSeek 官方价格](https://api-docs.deepseek.com/quick_start/pricing)：美元/百万token。当前 Flash 峰值0.3/0.006/1.2，Pro峰值1.32/0.044/3.96。选峰值参考上界并写入 `peak-upper-bound`，不假装已处理中国节假日、折扣与实际扣费时段。只收录文档明确的Flash旧名别名，不擅自给旧chat/reasoner套当前价。
- [TokenDance 自身公开价目API](https://tokendance.space/portal/api/models/all)：收录近30日实际出现的8个网关模型及Step5。读取OpenAI chat-completions协议价格，而非划线reference价、原厂价或Claude协议价；DeepSeek两种分时条目按已公开最高时段作峰值参考。比如3.7 Flash为1.08/0.216/6.48，而非直接Step的价格。[页面也列出不同服务商价格](https://tokendance.space/models/step-3.7-flash)，公开参考不能保证个性化路由/折扣后的实扣。

人民币价格为了兼容现有 `estimated_cost_usd` 字段，按 **1 USD = 7.2 CNY** 的明确规划假设换算，`pricing_version` 带 provider、2026-10-23、reference/peak-upper-bound 和 cny-usd-fx7.2。不是实时汇率，不是账单；不含工具、存储、税费、余额赠金等其他项目。

新表不会回填历史行。特别是旧Step行的 cache_hit_tokens=0 曾意味着字段漏采，不能据此当作真实零命中；历史null成本不可机械换成0。

## 缓存与缺失值

采集优先覆盖 prompt_cache_hit_tokens、Step的cached_tokens、prompt_tokens_details.cached_tokens、input_tokens_details.cached_tokens，以及兼容的cache_read_input_tokens；也可由有效prompt_cache_miss_tokens推导。命中+未命中必须等于输入总量，不再把输出推理token重复计价。

显式0与未报告不同。无缓存报告时，Eval onUsage为null，成本按全部输入未命中作参考上界，版本加cache-unknown-upper-bound；不凭缺失字段宣称缓存失效。无完整token用量或未知价目时成本仍null；有效失败/截断若已返回用量仍记录成本，状态仍error，不当成功。

## 不改变旧报价/收费

旧run-ledger事前报价共用了原估算函数。已将该路径显式固定为 estimateLegacyUnitCost，保留原DeepSeek两档数值及旧version；原报价、收费测试原样通过。新 estimateGenerationCost 只供生成事件/其Eval用量使用，不修改实际扣积分函数。

旧报价参考过期的问题因此被明确保留，并非继续作为新遥测真价使用；若要调整对用户的报价，应另立任务，不借本轮偷偷改。

## 给季卡分析的提醒

`/Users/yi/me/益职作战盘/2026-10-23-按用户模型成本.sql` 当前仍对历史null套DeepSeek代理价，并把TokenDance调用混在一起。本轮不静默改其口径或回填历史。季卡定价前必须把站点承担的Step/直连调用，与用户自带TokenDance连接的参考用量分开；后者不自动等于本站的供应商支出。历史代理成本占比和参考汇率需显式展示，不可把“有数字”当成实际账单。

## 验收范围

定向回归覆盖直接/网关价格分离、Step原生及嵌套缓存、显式0、缺失/非法值、未知模型、无usage、输出推理不重复、流式/非流式调用落库映射、截断仍失败且保留用量。管线测试运行真实callLLM/规范化/估算/recordGenerationEvent，只模拟供应商和数据库，证明新写入载荷为非null；不是正式数据库新行或真实扣费证明。

本轮没有模型费、短信、生产DDL/DML或部署。正式新调用验证需在本人批准部署后进行，不能因为本地通过而声称线上已经有新成本记录。
