# 新域观猹凭据填写准备

2026-10-18（本地）。状态：**代码和 Vercel 草稿表单已准备，未启用、未部署这次改动，未保存任何新凭据。**

## 本人今晚填写

Chrome 已打开现有 `ai-job-coach` 项目的新增环境变量面板：

https://vercel.com/velmavalienteqejimu22-jpgs-projects/ai-job-coach/settings/environment-variables?create=true

- 第一行 `WATCHA_YIZHI_CLIENT_ID`：填新域独立应用的 Client ID。
- 第二行 `WATCHA_YIZHI_CLIENT_SECRET`：只填运营今晚重置后的 Client Secret。
- 两行同为 **Secret**，环境为 **Production**；变量名与两条备注已填写，Value 空白。
- 填完点 Save，回“已保存”；不要点显示值、发聊天或发截图。不要改旧 `WATCHA_CLIENT_ID` / `WATCHA_CLIENT_SECRET`。
- 当前是未提交的浏览器草稿。若页面刷新导致草稿消失，按上述名称重新添加两行即可；不要为保留草稿保存假值或空值。

旧应用保持原样。之前截图中的 Secret 按暴露处理，不进入代码、配置、测试、文档或本地 env；本次没有调用它。本人和运营处理 Secret 重置，本轮未联系运营。

## 已准备的代码

`lib/watcha-oauth-config.ts` 将两个正式站的凭据严格分开：

| 请求域名 | 使用变量 |
| --- | --- |
| ai-job-coach.xin / www.ai-job-coach.xin | 原 WATCHA_CLIENT_ID / WATCHA_CLIENT_SECRET |
| yizhioffer.com / www.yizhioffer.com | 新 WATCHA_YIZHI_CLIENT_ID / WATCHA_YIZHI_CLIENT_SECRET |

正式域仅接受 HTTPS 默认端口与纯 origin；未知域、后缀仿冒、带凭据/路径/query/hash 的 base 均拒绝。仅非生产允许 loopback 开发 origin。新域任何一项为空都拒绝，不拼接或回退旧凭据。授权与 token 交换调用同一选择器，Secret 只进入观猹固定 HTTPS token 端点的 POST body，不进入授权 URL。现有 `state`、HttpOnly cookie、会话与账号映射逻辑不变。

缺配置时授权入口回当前登录页并保留安全 redirect，不生成一次性 state cookie；不可信 origin 返回 400、不向外站跳转。新 www 仍应由现有 Vercel 规则先跳裸域，运营当前登记的实际回调是 `https://yizhioffer.com/api/auth/watcha/callback`。若今后让 www 独立执行 OAuth，须另外登记其精确回调，不能只因选择器允许同一套凭据就宣称该回调已注册。

## 启用门槛

1. 运营重置新应用 Secret，本人保存到上述 Vercel Secret。
2. 运营明确同一观猹账号在新旧客户端的 `user_id` 是否一致。**目前未知，不把“拿到凭据”当成连续性确认。** 若不同，先设计明确的账号关联/验证流程，禁止按昵称或猜测身份自动合并。
3. 确认部署时仍基于最新正式代码，干净构建并检查旧域凭据路径不变；本轮没有触发部署或切主域。
4. 真实新域登录 → 刷新 → 原用户 ID 和工作区/旧作答只读校验；回查旧域登录路径。通过后再决定是否切公开主域。

没有改动数据库、用户资料、旧作答、余额、现有生产环境变量或域名配置。没有新短信、模型、付费调用。本次不是新域登录实测通过。

## 验证

- 4 个认证相关套件 37 tests 通过：旧/新域配对、缺一项不回退、可信 origin、授权 URL 不含 Secret、token body 配对、拒绝前无网络、授权入口安全 cookie、配置缺失恢复、旧回调与新 origin 回调。
- `tsc --noEmit` 通过；本次 TS 文件 ESLint 通过；diff-check 通过。首轮 TypeScript 抓到测试的 NODE_ENV readonly 赋值，已改用可恢复的 Reflect 环境夹具并复跑通过。
- 仅后端/配置/测试/文档修改，不运行 UI detect；Impeccable 自动钩子保持关闭。
- Vercel 页面实际可见两项正确名称、空 Value、Secret 选中与 Production 环境。页面保留给本人填写，没有 Save 操作。私有填写位置截图：`/private/tmp/yizhi-watcha-secret-form-prepared.png`，不作为公开产品素材。

全量测试：2468 passed、4 failed、10 skipped；246 suites passed、1 failed、5 skipped。失败仍是此前 `app/api/opportunities/analyze/route.test.ts` 的 Manus/Greenhouse/Lever/Ashby 四项 JD 导入，不新增失败、不放宽安全规则来刷绿，不称全绿。结果 `/tmp/yizhi-watcha-domain-prep-jest.json`。本次只提交这 8 个任务文件到既有 `codex/resume-detail-polish-1017`，不推 main、不带共享 UI 截图或 Supabase 临时目录。未触发正式部署；不得把准备代码、保存 Secret 或一次重部署写成登录验收完成。
