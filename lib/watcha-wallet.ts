import { getDbClient } from './db';
import { consumeWatchaPayTransfer, getWatchaPayAccess, watchaPayConfiguration, WatchaPayError } from './watcha-pay';

export async function getPendingWatchaTransfer(userId: string) {
  const config = watchaPayConfiguration('chat');
  if (!config) return null;
  const db = await getDbClient();
  if (!db) throw new WatchaPayError('database_unavailable');
  const { data, error } = await db.from('watcha_point_transfers').select('id,amount').eq('user_id', userId)
    .eq('environment', config.environment).eq('entitlement_id', config.entitlementId).eq('status', 'pending').maybeSingle();
  if (error) throw new WatchaPayError('wallet_unavailable');
  return data;
}

export async function getWatchaPointBalance(userId: string): Promise<number> {
  const config = watchaPayConfiguration('chat');
  if (!config) return 0;
  const db = await getDbClient();
  if (!db) throw new WatchaPayError('database_unavailable');
  const recovered = await db.rpc('recover_watcha_points', { p_user_id: userId, p_environment: config.environment });
  if (recovered.error) throw new WatchaPayError('wallet_unavailable');
  const { data, error } = await db.from('watcha_point_wallets').select('balance').eq('user_id', userId).eq('environment', config.environment).maybeSingle();
  if (error) throw new WatchaPayError('wallet_unavailable');
  return data?.balance ?? 0;
}

export async function hasWatchaOperation(userId: string, operationId: string) {
  const config = watchaPayConfiguration('chat');
  if (!config) return false;
  const db = await getDbClient();
  if (!db) throw new WatchaPayError('database_unavailable');
  const { data, error } = await db.from('watcha_point_reservations').select('id').eq('user_id',userId)
    .eq('environment',config.environment).eq('operation_id',operationId).maybeSingle();
  if (error) throw new WatchaPayError('wallet_unavailable');
  return Boolean(data);
}

/** Explicit exchange only. Pending transfers survive timeout/process death and reuse their exact debit. */
export async function redeemWatchaPoints(userId: string) {
  const config = watchaPayConfiguration('chat');
  if (!config) throw new WatchaPayError('configuration_action_required');
  const db = await getDbClient();
  if (!db) throw new WatchaPayError('database_unavailable');
  let transfer = await getPendingWatchaTransfer(userId);
  if (!transfer) {
    const account = await getWatchaPayAccess(userId, 'chat');
    if (!account.configured || account.result.access === 'unavailable') throw new WatchaPayError('configuration_action_required');
    const amount = account.result.entitlement.remaining;
    if (amount < 1) return { balance: await getWatchaPointBalance(userId), redeemed: 0 };
    if (amount > 100000) throw new WatchaPayError('quota_limit');
    const created = await db.rpc('begin_watcha_transfer', { p_user_id: userId, p_environment: config.environment, p_entitlement_id: config.entitlementId, p_amount: amount });
    if (created.error) throw new WatchaPayError('wallet_unavailable');
    transfer = Array.isArray(created.data) ? created.data[0] : created.data;
  }
  if (!transfer?.id || !Number.isSafeInteger(transfer.amount)) throw new WatchaPayError('invalid_transfer');
  // Never cancel an ambiguous debit: reissuing this same ID is the recovery path.
  await consumeWatchaPayTransfer(userId, 'chat', transfer.id, transfer.amount);
  const credited = await db.rpc('credit_watcha_transfer', { p_id: transfer.id, p_user_id: userId, p_environment: config.environment });
  if (credited.error || !Number.isSafeInteger(credited.data)) throw new WatchaPayError('exchange_pending');
  return { balance: credited.data as number, redeemed: transfer.amount as number };
}

export async function reserveWatchaPoint(userId: string, operationId: string) {
  const config = watchaPayConfiguration('chat');
  if (!config) return null;
  const db = await getDbClient();
  if (!db) return null;
  const { data, error } = await db.rpc('reserve_watcha_point', { p_user_id: userId, p_environment: config.environment, p_operation_id: operationId });
  if (error) throw new WatchaPayError('wallet_unavailable');
  const row = Array.isArray(data) ? data[0] : data;
  return row?.reservation_id ? { id: `watcha:${row.reservation_id}`, source: 'watcha', remaining: Number(row.remaining) } : null;
}
