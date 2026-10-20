import type { ResumeConversationTurn } from './resume-task-types';

// Longer than the bounded 45s model call plus persistence/settlement. An expired
// receipt is recoverable even if the browser closed before the response arrived.
export const RESUME_MESSAGE_LEASE_MS = 90_000;
export function resumeMessageExpired(turn: ResumeConversationTurn, now = Date.now()) {
  return turn.status === 'pending' && now - Date.parse(turn.savedAt) >= RESUME_MESSAGE_LEASE_MS;
}

/** Public copy must not expose raw provider errors, keys, prompts or stack traces. */
export function resumeMessageFailure(error: unknown): NonNullable<ResumeConversationTurn['failure']> {
  const message = error instanceof Error ? error.message : String(error || '');
  if (/timed?\s*out|timeout|超时/i.test(message)) return { code: 'timeout', message: '模型回复超时了，这条消息已保留。可以重新发送。' };
  if (/network|fetch|connection|socket|ECONN|网络/i.test(message)) return { code: 'network', message: '暂时没连上模型服务，消息已保留。可以重新发送。' };
  if (/额度|余额|积分|quota|balance|402/i.test(message)) return { code: 'quota', message: '当前模型额度不足，消息已保留。补充额度后可以重新发送。' };
  if (/401|403|认证|授权|api.?key|credential/i.test(message)) return { code: 'authentication', message: '模型服务暂时无法验证账号，消息已保留。请检查账号连接后重试。' };
  if (/429|rate.?limit|频繁/i.test(message)) return { code: 'rate_limit', message: '模型服务现在比较繁忙，消息已保留。稍后可以重新发送。' };
  return { code: 'unavailable', message: '这条消息暂时没处理完成，内容已保留。可以重新发送。' };
}
