export function chatPanelWidth(hostWidth: number, requested: number, workspace: boolean) {
  const reserve = workspace ? 578 : 420;
  const maximum = Math.max(320, Math.min(760, hostWidth - reserve));
  return { maximum, width: Math.max(320, Math.min(maximum, Number.isFinite(requested) ? requested : 384)) };
}
