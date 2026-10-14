# 导师模型菜单：价格、速度与轻量模型

## 实现范围

用户要求补品牌 logo、去掉统一“价格待核实”、以千问 3.8 Max=0.7 做粗粒度相对速度比较，并补新阶跃和轻量省钱模型。保持既有对话、作答、自动模式与扣费机制不变。

- 新增可选 `step-5-preview`、`glm-5.3-flash`、`glm-5.3-flashx`、`qwen3.8-flash`、`mimo-v2.6-flash`，原 7 模型保留；自动高阶池不扩充、不暗改用户所选模型。
- 混元、阶跃、小米使用 TokenDance 官方作者目录引用的品牌资产，存本地；自动选择使用中性的 Sparkle，不假装某厂商 logo。
- 菜单每项显示普通输入 / 输出，以及单独的缓存命中输入价，统一人民币 / 百万 tokens；不能把缓存价当整次调用成本或承诺必命中。
- 只使用 TokenDance `openai:chat-completions` 的实际公开 `pricing.items`，不使用划线 `reference`，不混 Anthropic 缓存创建或不同协议计费。公开目录未提供某项缓存价时显示无单独缓存价，不造零价。
- 公共只读价格刷新 15 分钟缓存、3 秒超时、同进程并发合并；失败保留带原日期的最后参考价 / 2026-10-14 快照，1 分钟后可重试。多价格档保留范围，不把最低价冒充所有档价格。
- 速度为人工粗略估算，不是站点实测、tokens/s 或扣费倍率。Qwen3.8 Max=0.7；GLM Flash=1.0、FlashX=1.4、Qwen Flash=1.1、MiMo Flash=1.0、DeepSeek Flash=0.9、Step3.7=0.9、Step5=0.8、HY4=0.8、GLM5.3=0.8、KimiK3=0.7、DeepSeek Pro=0.6。用户允许比较刻度，不宣称可预期的响应时长。
- HY4 公开输入 6 / 输出 18，不再当作经济回退模型；相应诚实降级回归同步更新。

## 资料与证据口径

2026-10-14 匿名真实读取，无 Key、Cookie、充值或模型调用：

- https://tokendance.space/gateway/v1/models — 12 个确切模型 ID 都包含 `openai:chat-completions`。
- https://tokendance.space/portal/api/models/all — 站点前端实际使用的公开作者与价格目录；12 模型输入、输出、缓存价齐全。
- https://tokendance.space/docs/models.md — TokenDance 独立定价，最终实际费用看调用账单。
- https://huggingface.co/inference/models — 不同提供方的输入 / 输出 / 速率参考；没有独立缓存命中价列，不能冒称 TokenDance 缓存价格来自 HF。
- https://huggingface.co/zai-org/GLM-5.3-Flash — 官方模型卡，确认轻量定位、默认 reasoning effort=max，既有低 effort 包装覆盖新 GLM 变体且不扩大付费 token cap。

快照缓存价：HY4 0.3、DeepSeek4.1Flash 0.016、Step3.7 0.216、Step5 0.35、DeepSeekPro 0.27、GLM5.3 1.8、GLMFlash 0.207、FlashX 0.57、Kimi3 2、QwenMax0902 1.5、QwenFlash 0.1、MiMoFlash 0.02，均为元 / 百万命中输入 tokens；不是每次调用价。

## 验证

- 全量 213 套 / 2131 项通过；5 套 / 8 项显式跳过，包含新公开目录 live 项。
- 显式 `RUN_MODEL_CATALOG_LIVE=1` 单独真实通过：12 IDs / 协议 / 实时三项价格均成立；不是付费模型生成质量验收。
- 新回归覆盖缓存价语义、不同协议排除、零值 / 未提供 / 非法数、单位换算、阶梯范围、目录失败快照保留、并发刷新合并、全部品牌本地资产、新选项解析、旧自动池不变与禁止静默换模型。
- 类型通过；本轮 ESLint 无 error，2 条既有 img 建议不扩大处理。
- 手动 Impeccable detect 一次，批处理新引入的两处色值漂移；一次复核只剩既有 8px、旧焦点色、旧阴影 3 条 advisory，0 primary；自动钩子没有开启。
- Chrome 独立临时组件验收页（仅本地，发布前已移除）实际展开，1440×900 与 390×844 截图均查看，价格不挤占名称，无横向溢出，12 张品牌图片 complete / naturalWidth>0。没有因工具读到 DOM 就称截图通过。
- Chrome 原生读取可用；第一次绑定原生新标签时 CDP 点击未生效，换独立 owned 会话后展开可用。未声称官方扩展已永久修复。

生产发布、正式账号菜单与运行日志结果在发布后补录。未写用户材料、旧作答或笔记，未付费压测 / benchmark。
