/** 有正在进行的问答时，邀请由当前辅导承接，不插入另一门旧课。 */
export function canShowTutorInvitation(input: {
  turnCount: number;
  busy: boolean;
  loading: boolean;
  pending: string;
  message: string;
  dismissed: boolean;
}): boolean {
  return input.turnCount === 0 && !input.busy && !input.loading && !input.pending && !input.message.trim() && !input.dismissed;
}
