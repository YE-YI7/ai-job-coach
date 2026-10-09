# 爱猹收接入状态（2026-10-09）

## 实际完成与未完成

已实现服务端额度权益适配器、鉴权只读查询接口和沙箱消耗探针。没有修改现有 TokenPay 或站点额度扣费，没有发布购买按钮，没有开启真实扣款。

已通过 Chrome 原生 UI 创建沙箱商品与沙箱 Key，并完成官方控制台的真实模拟购买、API 查询、扣减、幂等重放和余额不足验证。内置浏览器及扩展控制接口仍超时；Chrome 原生应用控制可用。没有读取 Cookie 或冒用其他经营主体。

未完成：把沙箱 Key 安全配置到益职服务端、通过益职自身适配器执行真实端到端验收、超时恢复验收、正式支付宝签约、付款后业务交付、微信支付/微信开放平台申请。控制台联调通过不等于益职已能收款。

## 2026-10-09 Chrome 沙箱实测

- 应用：`app_01m4fktv01m0hs9ag871f3tes1`，当前为沙箱。
- 商品：`sku_01m4g10z90gew9kzgnej07bbjk`，名称「益职 AI · 求职辅导体验包（沙箱）」。
- 权益：`ent_01m4g10z90vcfpjs3ewwkd0a1y`，次数额度。
- 唯一档位：「链路测试包（非正式售价）」，3 次 / 模拟 ¥1.00；不是正式定价，没有真实资金交易。
- 用户明确确认后创建「益职服务端联调（仅沙箱）」Key；仅在平台管理，不复制密钥到聊天、Git 或本地文件。
- 独立用户 `yizhi_sandbox_e2e_20261009`：网页检查余额 0 → 模拟购买 → 自动回读余额 3。
- 官方控制台 API 调试实际发送 `access`：200 / granted / remaining 3。
- `consume`：amount 1，固定 idempotency_key `yizhi-sandbox-e2e-20261009-debit-001`，200 / consumed 1 / remaining 2。
- 同编号同参数重放完成后，另发 `access` 回读 remaining 2；没有重复扣减。
- amount 3、独立编号 `yizhi-sandbox-e2e-20261009-insufficient-001`：409 / insufficient_quota；随后回读仍为 2。
- 隔离用户 `yizhi_sandbox_isolation_20261009`：200 / purchase_required / remaining 0，没有共享已购买用户的额度。
- 支付二维码组件报加载失败；平台自带「无法扫码？在新窗口打开」网页入口完成模拟购买。二维码路径本轮未通过，不能宣称扫码实测成功。
- 调试页含示例响应：必须等待请求完成及回读结果，不能将切换用户后临时展示的 remaining 10 等示例当真实余额。
- 未创建正式 Key，未切换线上环境，未改变现有 TokenPay 或站点免费额度。

## 已核验官方契约

来源：https://pay.watcha.cn/ 及该页面公开的控制台接入指南，2026-10-09 实读。

- 当前由支付宝处理商品、签约、交易与资金。不能宣传已支持微信支付。
- `POST https://pay.watcha.cn/v1/entitlements/access`，Bearer 服务端 API Key；参数 `entitlement_id`、产品内部稳定 `user_id`，可选 `return_url`。
- `POST https://pay.watcha.cn/v1/entitlements/consume`，参数增加正整数 `amount` 和稳定 `idempotency_key`。
- 额度响应的 `access` 仅是余额分类，不预留额度；以实际原子消耗响应为准。
- 消耗没有撤销或退款 API，不能直接接到现有 reserve→模型→失败退还流程。
- 沙箱/正式 Key、商品、用户、权益隔离。商品绑定实际支付宝收款账号后不能更换。
- 商品创建、档位和签约在控制台/渠道托管页完成，不能编造公开商品写 API。

## 服务端配置（密钥不进入聊天或前端）

```dotenv
WATCHA_PAY_ENVIRONMENT=sandbox
WATCHA_PAY_API_KEY=<控制台生成的 wpay_test_ 密钥>
WATCHA_PAY_CHAT_ENTITLEMENT_ID=<真实额度权益 ID>
WATCHA_PAY_RESUME_ENTITLEMENT_ID=<真实额度权益 ID>
WATCHA_PAY_INTERVIEW_ENTITLEMENT_ID=<真实额度权益 ID>
WATCHA_PAY_LIVE_ENABLED=false
```

如三个能力共享一个余额池，上述三个 ID 可映射到同一商品；如独立计算余额，则对应不同商品。映射必须来自真实配置，不虚构 ID。当前未修改已有 `.env.example`（含协作者改动）。

`POST /api/payments/watcha/access` 只接受 `{ "capability": "chat" }`（或 resume/interview）。用户身份只从登录会话取，拒绝客户端传 buyer ID、权益 ID、金额或消耗数。全响应 private/no-store。没有配置返回 configured=false；没有 key、商品或审核并不等于支付完成。未知类型/状态/金额/响应、网络错误失败关闭。

购买入口仅允许已核验的 pay.watcha.cn/render.alipay.com HTTPS 或官方 alipays://platformapi Scheme；未核验 QR 域名不转发。若真实沙箱返回其他域名，须核验官方托管来源再扩展，不放开任意重定向。

沙箱消耗函数不向客户端提供路由，且拒绝 live。重试相同参数复用同一编号，无法解析消耗结果时不再创建新编号重扣。平台控制台已有上述真实沙箱消耗记录，益职自身函数仍待安全配置后验收。

## 正式启用门禁

1. 使用本人或真实合作经营主体完成控制台配置，不借执照伪装主体；本人实名认证/签约不能由 Agent 冒签。
2. 沙箱真实模拟购买→稳定用户查询→消耗→同编号重放→余额回读，通过跨用户隔离、余额不足、超时恢复。
3. 先完成持久业务订单/交付与补偿设计：模型失败不扣用户额度，模型成功后扣款超时不双扣；已经付费的产物必须可回读。不能仅“生成成功后扣”而无并发、交付和对账处理。
4. 正式个人准入由爱猹收/支付宝审核确认；无营业执照不承诺所有线上支付能力可开通。微信另行审核，未取得渠道资质之前保持不可用。
5. 切换 live Key/商品且显式开启 gate 后，必须实际验证付款、到账、交付、退款和对账才能上线购买按钮。前端回跳不能授予额度，余额由权益服务读取，不凭跳转写入站点余额。

这轮只交付后端预接入，不把它称为已能收款或已替用户办妥开放平台。

## 本轮验证

- 独立干净快照：185 套 / 1886 用例通过，既有 2 套 / 4 用例跳过；`tsc --noEmit` 与生产 build 成功，本轮代码 ESLint 0 error。
- 新增 31 用例覆盖未配置关闭、正式 gate、环境 Key 不匹配、身份注入、未知协议、危险购买地址、跨用户消耗编号隔离、精确重试、非明确 409、模糊扣款结果和禁止真实扣款探针。
- 早期官方公开接口无凭据请求返回 401，只证明入口可达及鉴权存在；本轮已追加上述真实控制台沙箱联调，但未验证益职服务端实际调用。
- 未做 UI 变更，不运行设计扫描；不混入工作树中既有 auth/admin 改动。
