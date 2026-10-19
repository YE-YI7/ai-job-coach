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

## 当前未完成项（不能宣称全部迁移收尾）

1. Supabase 控制台已过期，停在 GitHub 本人登录；Google 跳转卡住已恢复页面，未强退 Chrome 或填写凭据。待本人登录后核对 Auth Site URL / redirect 配置，不能仅凭代码推断已迁。
2. 本人已确认可以安排非收款方测试买家，已准备新域 ¥9.90 / 10 积分二维码并交本人安排买家亲自付款。仍待付款、同一应用用户权益复查、明确兑换及刷新持久化实测。没有付款就不能把商品可见、二维码可生成或控制台保存算支付成功。官方 [爱猹收接入说明](https://pay.watcha.cn/agent.md) 明确收款方不能购买自己的商品。

验收截图仅私有本机：`/private/tmp/yizhi-pay-new-domain-settings.png`、`/private/tmp/yizhi-mail-new-domain-verified.png`、`/private/tmp/yizhi-new-domain-mail-accepted.png`；支付 handoff 截图带购买二维码，仅本人交接，不进入仓库或公开报告。没有公开手机号、凭据、支付 ticket 或真人简历截图。

回退只涉及部署版本或配置，不回滚用户资料；回退前必须检查当前线上版本，不能覆盖协作者的新发布。旧域不续费决定不因技术回退改变。
