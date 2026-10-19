# 旧域退役与新域独立运行验收

2026-10-18 本地 / 2026-10-19 UTC。本人明确：主域 `https://yizhioffer.com`，旧 `ai-job-coach.xin` 到期不续。只做域名、入口和第三方配置迁移；不重写简历、旧作答、账号身份或余额。

## 已落实的配置与发布

- 阿里云旧域自动续费实际为关闭；未续费、购买套餐或删除旧 DNS。保留到期前兼容入口，域名失效后旧书签不保证可跳转，不依靠旧域继续提供新站服务。
- 爱猹收沿用原应用、现有上架的 ¥9.90 / 10 积分商品、权益与生产密钥，仅将应用访问网址保存为新裸域；重新加载控制台已确认。没有创建新商户、改商品价格或扣款。
- 支付 access 请求使用固定 `https://yizhioffer.com/cockpit` 返回地址；浏览器返回本身不作为付款成功证据，仍由服务端对同一应用用户重查权益并经用户确认兑换。
- Resend 新增并验证 `yizhioffer.com`（us-east-1），仅开通发信，收信关闭。阿里云只加 `resend._domainkey` TXT、`rsend` CNAME、`send` CNAME；未改网站 A / www、MX / NS。公开 DNS 查询及 Resend Verified 状态均已核对。沿用原 Sending / All domains 密钥，不读密钥值或新增凭据。
- `FROM_EMAIL=noreply@yizhioffer.com` 已配置 Production / Preview / Development；`TOKENPAY_APP_URL=https://yizhioffer.com` 已配置 Production，均为非敏感公开配置，需新构建生效。
- 免费 Agent `0.8.8` 安装/更新入口、隐私引导、插件主页已迁到新域，更新清单只接受新裸域及新 www 的标准 HTTPS origin；旧安装分支 backend 以独立干净工作树仅迁入 5 个发布文件与 3 个文档链接，不把网页功能混入 backend。实际 MCP 闭环、升级连续性及知识热更回归通过，远端 backend `d929d26`。
- TokenPay 请求归因头优先于已有 Key 的归因元数据，服务端默认/Production 配置已改新域；没有要求用户重新绑 Key、读取或替换已有加密连接。官方依据：[应用归因](https://tokendance.space/docs/app-attribution)、[OAuth](https://tokendance.space/docs/api-key-oauth)。

## 代码边界与验证

- 新域观猹使用独立配置，测试在删除旧域两项凭据后仍可构造新域授权并交换 token，不回退旧凭据。实际原账号登录连续性见前一份报告；本次最终构建仍需再验。
- 旧首页、公开工具、登录、工作区、管理、邀请、兑换、新手、简历评分、手机号设置、聊天、详情、面试、个人资料、注册等浏览器入口转新域，query / 路径需正式探针验收。旧已在途 API 回调不做整站跨域跳转，避免丢 host Cookie；新流程不从旧域发起。
- `d39ace0` Agent 发布，`1fa0d38` 运行默认值/支付返回/旧入口，`9ac51ab` 文档及 skill 单 URL，`0c5158f` 剩余旧页面入口。当前候选是干净 `git archive`，不含共享截图或 Supabase 临时目录。
- 定向域名/支付/观猹 3 套 51 项通过；此前相关 10 套 101 项通过，类型、任务文件 lint、shell 语法、skill validator 通过。全量 2476 passed / 4 failed / 10 skipped；四项仍是已存在的 Manus / Greenhouse / Lever / Ashby JD 导入失败，没有放宽 SSRF 规则刷绿。
- 本轮未更改组件排版或样式，仅后端、配置、链接与文档；不运行 UI detect，自动钩子保持关闭。

## 原资料基线

使用 `md5(string_agg(row_to_json(row)::text,'' order by row.id))` 整行聚合，开始与候选构建期间均相同：

| 对象 | 条数 | 整行 MD5 |
| --- | --- | --- |
| 旧作答 | 41 | `0881efbb0a4a159ba1e7b5460c6007d8` |
| 全站工作区资料 | 33 | `10387ab8df982aabc46f6e5acd85d09f` |
| 本人原账号资料 | 10 | `ae949dcd2e71a2bd443842ed6af7e853` |

没有修改用户资料的 SQL 或 schema 迁移。不把正常登录更新 profile / session / last_active 说成完全没有认证数据更新。唯一测试数据写入是正常登录表单给官方模拟邮箱创建的一条验证码，未读取验证码、未验证登录，随后以精确邮箱和本次时间窗删除这条测试记录（1 条），复查残留 0；没有清理真人验证码或限流记录。

## 最终正式版本与 Chrome 验收

- `0c5158f` 干净归档 Production 候选 `dpl_BvZ21Xg7qdqCK1E18fVUY7AC1JMi`（`ai-job-coach-7ey3aa16a-velmavalienteqejimu22-jpgs-projects.vercel.app`）云构建、类型检查及 133 页生成成功。候选健康 200 / database ok，匿名 session 401 / authenticated false；promote 前确认正式仍为本任务上版 `23a8174`，未覆盖协作者的新发布。
- promote 同一构建后，新正式域元数据 READY / Production / sourceCommit `0c5158f`。新旧裸域及 www 四个 health 跟随正常跳转均 200 / database ok，正常验证 TLS，没有绕过警告。
- 正式旧 www 的首页、登录、工作区、Eval、手机号设置、简历编辑、详情、面试复盘、个人资料、注册、Agent、观猹 / TokenPay 授权入口共 13 项真实 HTTP 均 307 到新裸域对应路径，测试 query 保留。空 `:path*` 的工作区会先到新域尾斜线再由 Next 规范化，未回旧域或丢 query。
- 新 authorize 307 至观猹，回调明确新域；仅输出 provider / callback 与是否有配置，不记录 Client ID、state、code 或 token。新 sitemap / robots / llms 均 200 且无旧域绝对 URL；正式 Agent release 0.8.8 / update_url 新域。
- Chrome 正式新域重新发起 `check_existing=1` → 观猹既有账号基本资料授权 → 新 `/cockpit`，非复制 Cookie 或伪造会话。正常 session 页面精确匹配原用户 UUID；session 整页刷新仍 authenticated true / 同原 UUID；工作区整页刷新仍 8 个岗位及已保存材料。
- OAuth / 刷新后再次聚合：上表 41 / 33 / 10 的整行哈希全部不变，应用用户 59 / Auth 用户 99 没有增加。没有新空账号或旧作答改写。
- Chrome 正式登录表单向 [Resend 官方测试地址](https://resend.com/docs/dashboard/emails/send-test-emails) 发送一次，页面进入“验证码已发送”且生产发件人为新域，表明应用请求被邮件供应商接受；不冒称真人收件箱收到或已验证邮件登录。未读取/填写验证码，测试记录已精确清理。
- 新域原账号积分窗口可正常查询：益职积分 0 / 渠道待兑换 0，生产上架商品 ¥9.90 / 10 积分、支付宝二维码可见。没有点击购买确认或兑换；窗口 handoff 留给非收款方测试买家。
- 最近 5 分钟 error 查询无条目，仅发布短窗，不是长期稳定性保证。一次 CUA 读取超时后原生 Chrome 仍响应，随后工作区正常读到；未强退、清 Cookie、重启或关闭用户原页面。
- 用户保存的历史简历中仍有其原写的旧产品链接，未批量改写简历、笔记或作答；这不属于运行配置，域名到期后该历史外链可能失效，需本人决定是否更新材料。旧版本地 Agent 也需升级至已发布 0.8.8，旧缓存代码不会被远端发布自动改写。

## 10-19 本人付款后的继续验收

- 本人回复测试买家已付款；Chrome 原账号新域积分窗口点击“付款后刷新”，真实服务端渠道查询由 0 变为 **10 积分**，益职本地余额仍 0。不是凭支付回跳、示例响应或人工 SQL 入账确认。
- 只读账本核对：本地余额 0、pending transfer 0、AI reservation 0。尚未兑换或消费，不把渠道到账说成益职入账、资金结算或整笔业务交付完成。
- 本人问 2FA 并授权接管。原 GitHub 设置页实际已登录且 2FA 为 Enabled，验证器 Configured、GitHub Mobile Configured；未改这些配置，未展开/读取恢复码。新的 Supabase 登录通过现有 GitHub，确实被 GitHub 一次性 checkup 拦截：`Verify your two-factor authentication (2FA) settings`，提示不能再延迟核验。点击 Verify 2FA now 后当前只提供验证器验证码输入；More options 仅为重配凭据入口，已收起，没有点击重配。
- 2FA 核验页和新域积分兑换确认区均已保留交本人。验证码只能由本人私下填写并提交；渠道兑换明确不可原路退款，勾选和兑换也交本人，不代替提交。
- 渠道到账后再验旧作答/工作区：41 / 33 / 10 的上表整行哈希仍相同；本次没有修改产品代码或重新部署。

## 当前未完成项（不能宣称全部迁移收尾）

1. Supabase 默认 Auth Site URL / redirect 白名单仍未核到。现有 MCP 能读项目元数据和执行只读 SQL，但没有 Auth 配置工具；另一个已有浏览器上下文也实际回到 Supabase 登录页。数据库 `auth.instances` 为 0 行，不能从它还原托管配置。官方配置读取接口是 [Management API GET /v1/projects/{ref}/config/auth](https://supabase.com/docs/reference/api/v1-get-auth-service-config)，本轮没有可用的已授权调用入口。保留此项为未完成，不提取连接凭据、不绕过 GitHub 核验、不关 2FA，也不再要求本人反复验证。下节的运行路径核查不等于第三方配置已经迁完。
2. **积分兑换按本人决定暂缓，不属于本轮待操作项。** 上轮已实际查到渠道 10 积分，但还未兑换到益职；本轮不刷新渠道余额、不购买、不点击兑换、不消费或调用收费模型。后续仅在本人重新明确继续后，再验入账幂等与余额刷新。官方 [爱猹收接入说明](https://pay.watcha.cn/agent.md) 明确收款方不能购买自己的商品。

## 10-19 无需本人重复验证的独立复验

- **Chrome 真实新域登录通过。** 使用独立验收标签，经新域正常观猹授权入口携带 `check_existing=1`，只允许恢复已有身份；观猹页面只授权账户基本信息，正常回到新域 `/cockpit`。浏览器实际读取会话端点，登录后精确匹配原账号 UUID，刷新会话端点后仍为同一身份。没有复制 Cookie、伪造会话、退出旧页面或创建 QA / 空账号。
- **工作区刷新通过。** 新域工作区整页刷新后仍正常显示原来的 8 个岗位及已存简历。只读数据库在登录前后分别聚合，旧作答 41 条、全站工作区 33 条、本人资料 10 条的整行 MD5 均与上表完全一致；应用用户 59 / Auth 用户 99 均未增加。正常 OAuth 仅有认证 token / 会话状态更新，不改业务资料、原件、旧作答或余额。
- **新域入口与发布未漂移。** `vercel project inspect --non-interactive` 确认目标为现有 `ai-job-coach`；新域实际仍指向同一个 Ready / Production 部署 `dpl_BvZ21Xg7qdqCK1E18fVUY7AC1JMi`。新域 health 200 / database ok；新 www 到新裸域；新首页 canonical、robots / sitemap / llms 及 Agent release 0.8.8 都没有旧域绝对 URL。公开授权探针只记录 provider origin 与 callback，回调明确为 `https://yizhioffer.com/api/auth/watcha/callback`，未记录 state、Client ID 或 token。
- **旧入口与续费边界。** 匿名旧 www 的工作区 / Eval 入口转新域，携带的查询参数在迁移跳转中保留；未登录时最终停在新域登录页属正常鉴权。旧裸域当前先到旧 www，再到新域，工作区另有标准尾斜线规范化跳转；不把它写成单次直跳。新域发起的本轮登录和刷新没有返回旧域。阿里云旧域行的自动续费 `aria-checked=false` 已重新只读确认；不执行续费、下单、扣费、DNS 或 NS 变更。旧书签只在域名到期前尽力兼容，到期后不保证可跳转。
- **现有权限的 Supabase 核查。** 目标项目 `get_project` 返回 `ACTIVE_HEALTHY`，SQL 基线与复验均成功；但这些都不能代替 Auth Site URL / redirect 配置读取。新开已有内置浏览器上下文的目标配置页，加载后实际转登录页，未继续发起登录、开新账号、重置密码或触发额外验证。
- **当前登录运行路径单独确认。** `lib/session.ts` 自签会话，`lib/auth.ts` 验证站点 Cookie；手机号验证、邮箱验证和观猹回调均使用 `createSessionToken`。邮箱发送走 `lib/email.ts` / Resend，Supabase Auth Admin 只用于可选创建身份。这三条当前登录路径不走 Supabase 默认 OAuth / OTP 重定向，因此不能把个人 GitHub checkup 当成已验通的新域站点登录的前置阻塞。这个判断只覆盖上述代码和本轮真实登录路径，不宣称 Supabase 托管配置已改好，也不覆盖未来新增认证功能。
- **回归与范围。** 重跑域名 / 观猹分域凭据 / 支付返回地址 3 套 51 项，全部通过；未重跑全量测试，不替换前文全量结果。没有运行时代码或 UI 变更，无需新构建、重新部署或 UI detect；本轮只更新本报告。没有购买 / 兑换、短信 / 邮件发送、真实模型调用或用户资料 SQL 写入。
- 刷新后侧栏证据只保留在私有本机：`/private/tmp/yizhi-domain-original-sidebar-after-refresh.png`。截图刻意避开简历联系方式与正文，不进仓库，不公开用户材料。

验收截图仅私有本机：`/private/tmp/yizhi-pay-new-domain-settings.png`、`/private/tmp/yizhi-mail-new-domain-verified.png`、`/private/tmp/yizhi-new-domain-mail-accepted.png`；支付 handoff 截图带购买二维码，仅本人交接，不进入仓库或公开报告。没有公开手机号、凭据、支付 ticket 或真人简历截图。

回退只涉及部署版本或配置，不回滚用户资料；回退前必须检查当前线上版本，不能覆盖协作者的新发布。旧域不续费决定不因技术回退改变。
