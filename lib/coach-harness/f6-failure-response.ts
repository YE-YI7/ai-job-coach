/** No draft is not success and does not mean the user's material is poor.
 * Do not invite another billable attempt when the runtime exhausted itself. */
export function f6FailureResponse(error: unknown) {
  if (!(error instanceof Error) || error.message !== 'F6_AUTHOR_CALL_BUDGET_EXHAUSTED') return null;
  return {ok: false, reasonCode: 'resume_author_no_draft', retryable: false,
    error: '本次已读取资料，但未能生成新稿，修改没有保存。原简历保持不变；请先不要连续重试，故障已记录。'};
}
