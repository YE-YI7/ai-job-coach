# TokenPay 运行手册

## 环境变量

- `TOKENPAY_ENCRYPTION_KEY`：32 字节密钥，支持 64 位十六进制或 Base64。只配置在服务端生产环境，不进入 Git、浏览器或日志。
- `TOKENPAY_APP_URL`：应用归因地址，生产环境使用 `https://www.ai-job-coach.xin`。

## 数据与计费

- OAuth 回调使用 Authorization Code + S256 PKCE；授权 code 和 verifier 只存在于短期 HttpOnly Cookie。
- API Key 使用 AES-256-GCM 加密后写入 `tokenpay_connections`。
- 用户连接 TokenPay 后，AI 路由使用其 TokenPay Key 与余额，不扣益职托管模型次数；断开后恢复原有额度。
- 充值只在用户点击确认后创建。支付状态每 3 秒查询一次，到达终态或过期后停止。

## 发布检查

1. 应用 `20260901090306_tokenpay_connections.sql`。
2. 配置两个生产环境变量并重新部署。
3. 验证未登录 API 返回 401、OAuth 跳转参数含 S256、回调 state 不匹配会失败。
4. 使用真实测试账户验证授权、余额、用户确认充值、到账刷新和断开连接。
5. 运行 Supabase 安全与性能 advisors，确认 TokenPay 表启用 RLS 且未向客户端角色授权。
