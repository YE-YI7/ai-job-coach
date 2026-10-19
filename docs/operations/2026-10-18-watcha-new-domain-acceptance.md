# 新域观猹登录与主域切换验收

2026-10-18 本地 / 2026-10-19 UTC。仅处理域名与认证连续性，不改用户简历、作答、余额或 UI 排版。

## 真实新域登录先验收

- 本人已在现有 Vercel 项目保存新域独立的 `WATCHA_YIZHI_CLIENT_ID` / `WATCHA_YIZHI_CLIENT_SECRET`，两项 Production Secret。只核对配置元数据，不读取、复述或写入凭据值。旧 `WATCHA_CLIENT_ID` / `WATCHA_CLIENT_SECRET` 不变。
- `1301487` 分域凭据选择器与 `b3a6403` 迁移验收保护先上线，生产 `dpl_6mpSW6bFZyKMYpPo23z877B7TV56`。此时未切公开主入口。
- 验收入口 `?check_existing=1` 仅设置 5 分钟 HttpOnly/Secure/SameSite=Lax cookie；回调找不到已存在的观猹账号或查询失败就停止，不创建空账号、不猜测合并身份。普通注册入口不被该临时验收条件限制。
- Chrome 新域先确认 `authenticated:false`，随后真实经观猹基本资料授权回到 `https://yizhioffer.com/cockpit`，不是复制 Cookie 或伪造会话。
- 新旧域正常 `/api/auth/session` 对比，应用用户 UUID 与 provider 身份精确相同。UUID、邮箱、凭据、code、token、Cookie 不进入本公开报告。
- 新域会话端点与工作区分别整页刷新，仍是同一原账号，8 个岗位与保存的原资料可见。应用用户数 59 / Auth 用户数 99 前后不变，没有生成新空账号。
- 这是本次本人账号的跨客户端身份连续性实测，不冒称所有观猹账号都已验证，也不以昵称匹配代替 provider ID。

## 原数据保护证据

本轮开始、真实 OAuth 后及刷新后重复只读整行聚合，基线相同。之前 Qoder 发布之后用户另有真实编辑，因此本轮采用当下重新读取的基线，不拿旧报告的不同哈希覆盖或回滚资料。

| 对象 | 条数 | 整行聚合 MD5 |
| --- | --- | --- |
| 全站旧作答 `interview_answers` | 41 | `0881efbb0a4a159ba1e7b5460c6007d8` |
| 全站 `coach_opportunities` | 33 | `10387ab8df982aabc46f6e5acd85d09f` |
| 本人原账号工作区 | 10 | `ae949dcd2e71a2bd443842ed6af7e853` |

口径 `md5(string_agg(row_to_json(row)::text,'' order by row.id))`，不只看条数。没有直接 SQL 写入或迁移；正常 OAuth 会更新既有登录时间、基础 profile/token/session，不把这类认证更新说成完全没有数据库写入。未调用真实模型、付费推荐、短信或充值，没有付款迁移验收。

## 公开主域切换范围

仅在上述真实登录、原身份、刷新和整行数据校验通过后制作 `23a8174`：

- Production `NEXT_PUBLIC_BASE_URL` 新增为公开值 `https://yizhioffer.com`。原环境未定义该变量；未覆盖任何旧域客户端或支付变量。
- canonical、sitemap、robots 的 sitemap 指向、公共 Agent 引导和工具链接指向新域。Eval 内部导航使用当前 origin 相对路径，不把已有登录强制跨域。
- 旧域仅 `/`、`/agent/*`、`/tools/*`、`/privacy`、`/llms.txt` 以临时 307 跳新域。旧 `/login`、`/cockpit`、`/admin/*`、`/api/*`（含 OAuth / 支付回调）不做整站跳转，保留原 host Cookie 与兼容路径。
- 新 www 到新裸域、旧裸域到旧 www 的既有 Vercel 规则不变；不删除域名、不改 DNS / NS、不停用旧应用。

## 测试与发布记录

- 最终认证/跳转/发现 6 套 45 项通过，`tsc --noEmit` 通过。
- 最终全量 2474 passed / 4 failed / 10 skipped，247 suites passed / 1 failed。四项仍是先前 JD 导入 Manus / Greenhouse / Lever / Ashby，不是本次新增失败；没有放宽 SSRF / URL 安全规则刷绿。结果 `/tmp/yizhi-primary-cut-jest.json`。
- 本次 TS lint 除 `app/resume-score/page.tsx` 以外通过；该页三处 any 和未使用 structuredData 在 HEAD 原文件复现，当前只改公共 URL、不扩修历史页面。diff-check 通过。
- 本轮没有改变界面视觉、排版或交互结构，只改配置、认证、链接与元数据，不运行 UI detect；Impeccable 自动钩子保持关闭。
- 最终主域候选通过干净 `git archive` 构建，不带共享截图、Supabase 临时目录或其他在途文件。候选 `dpl_HtoYnGRMFPSp4QcbpnUjps2Vomwp`，发布验收如下。

## 最终正式站验收：已切公开主域

- 干净归档 `23a8174` 以 Production / skip-domain 暂存；webpack、类型检查、133 页生成通过。READY 后才检查候选 `/api/health` 数据库 ok、匿名会话 401 / `authenticated:false`。CLI curl 的 scope 参数转发异常仅为本地调用问题，去掉多余 scope、使用已链接项目后拿到真实 JSON，不把代理连接 200 当应用成功。
- promote 的是同一个 `dpl_HtoYnGRMFPSp4QcbpnUjps2Vomwp`，不是重建 Preview。新裸域和旧 www 的平台元数据均为该 ID、Production、READY、sourceCommit `23a8174`；未覆盖别人的更新版本。
- 新旧裸域与 www 四个 health（跟随原规范化跳转）均 200 / database ok；正常 TLS 校验，没有绕过警告或用 `-k`。
- 正式旧首页 307 到新首页，Chrome 从旧 www 首页实际到新裸域。Agent / 工具 / 隐私 / llms 跳转已验，query 保留；无 path 参数的 `/agent` 会先到 `/agent/` 再由 Next 规范化，不丢 query 或改到未知 origin。
- 旧 `/login` 200；匿名旧 `/cockpit` 仍回**旧域**登录，空授权码旧 callback 仍回旧域的“缺少授权码”错误，未跨域吃掉 Cookie。新 www `/cockpit` 仍到新裸域同路径。
- 正式新旧 authorize 分别使用不同 Client ID 的 SHA-256 指纹，旧指纹与切换前一致；回调分别留在各自域名。未输出原 Client ID / state / token，也没有通过探针执行伪造回调登录。
- 新首页、Agent、两工具页 canonical 均新域；sitemap 仅四个公共路径，robots sitemap 与 llms 均新域，不列工作区或 API。
- **切换后 Chrome 再次整页刷新新工作区：8 岗位、原保存材料正常。新域会话刷新及旧域会话刷新 UUID 与先前原身份一致。另打开旧域 `/cockpit`，仍为旧域、8 岗位可见。** 未新开或重写用户旧辅导。
- 最终再次 SELECT：上表 41 / 33 / 10 的整行哈希全部不变；应用用户 59 / Auth 用户 99 也不变。没有新空账号或旧作答/工作区的任何改写。
- 最终部署最近 5 分钟 error 查询无条目，只是发布短窗证据，不是长期稳定承诺；没有借此宣称支付、短信或所有其他功能重新验收。
- 新域工作区标签保留；临时 session / 旧域兼容 / 首页探针标签清理。用户原 Eval / 云控制台标签与未保存输入没有改动。新首页私有验收截图 `/private/tmp/yizhioffer-primary-live.png` 不含真人简历；包含真人联系方式的工作区截图不进入公开仓库或交付图。

## 回退与保留

若主域公开跳转出现问题，可 promote 先验通认证的 `b3a6403` / `dpl_6mpSW6bFZyKMYpPo23z877B7TV56`；其不包含公开跳转，仍保新旧凭据分离和原账号保护。公开 base 环境值可恢复未定义，但只有后续新构建才读取；不需要回滚用户数据。

旧域仍有旧认证/支付入口，10-30 UTC 到期续保仍需本人处理。此前截图 Secret 暴露是否由运营完成轮换，不能仅凭 env 元数据独立断言；本轮实际 token 交换仅使用本人安全保存的云变量，没有调用截图值。整稿质量 Eval、金额账本/支付双费用、TokenPay 旧入口、手机号低日限等独立待办不算本轮完成。
