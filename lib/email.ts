/**
 * 邮件发送工具 - 使用 Resend
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'onboarding@resend.dev';

interface SendEmailResult {
  success: boolean;
  error?: string;
}

/**
 * 发送验证码邮件
 */
export async function sendVerificationEmail(
  email: string,
  code: string
): Promise<SendEmailResult> {
  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY 未配置');
    return { success: false, error: '邮件服务未配置' };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `益职AI <${FROM_EMAIL}>`,
        to: [email],
        subject: `您的验证码：${code}`,
        html: generateVerificationEmailHtml(code),
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Resend API 错误:', errorData);
      return { success: false, error: '发送邮件失败' };
    }

    return { success: true };
  } catch (error) {
    console.error('发送邮件异常:', error);
    return { success: false, error: '发送邮件失败' };
  }
}

/**
 * 生成验证码邮件 HTML
 */
function generateVerificationEmailHtml(code: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#fffbeb;font-family:'Helvetica Neue',Arial,'PingFang SC','Microsoft YaHei',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="min-height:100vh;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table width="420" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:20px;box-shadow:0 4px 24px rgba(0,0,0,0.06);overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#f97316,#ea580c);padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:1px;">益职 AI</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">您的私人求职导师</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 16px;color:#374151;font-size:16px;line-height:1.6;">您好，</p>
              <p style="margin:0 0 28px;color:#374151;font-size:16px;line-height:1.6;">请使用以下验证码完成登录：</p>
              <div style="background:#fff7ed;border:2px dashed #fed7aa;border-radius:12px;padding:24px;text-align:center;margin:0 0 28px;">
                <span style="font-size:36px;font-weight:800;letter-spacing:8px;color:#ea580c;font-family:'Courier New',monospace;">${code}</span>
              </div>
              <p style="margin:0 0 8px;color:#6b7280;font-size:14px;line-height:1.5;">验证码 5 分钟内有效，请勿将验证码分享给他人。</p>
              <p style="margin:0;color:#6b7280;font-size:14px;line-height:1.5;">如果这不是您本人的操作，请忽略此邮件。</p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px 28px;border-top:1px solid #f3f4f6;text-align:center;">
              <p style="margin:0;color:#9ca3af;font-size:12px;">&copy; ${new Date().getFullYear()} Dawn AI. 版权所有.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
