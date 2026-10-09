jest.mock('./db', () => ({ getDbClient: jest.fn() }));
jest.mock('./watcha-pay', () => ({ watchaPayConfiguration: jest.fn(), getWatchaPayAccess: jest.fn(), consumeWatchaPayTransfer: jest.fn(), WatchaPayError: class extends Error { constructor(public code: string) { super(code); } } }));
import { getDbClient } from './db';
import { consumeWatchaPayTransfer, getWatchaPayAccess, watchaPayConfiguration } from './watcha-pay';
import { redeemWatchaPoints, getWatchaPointBalance, reserveWatchaPoint } from './watcha-wallet';
const db = jest.mocked(getDbClient), access = jest.mocked(getWatchaPayAccess), consume = jest.mocked(consumeWatchaPayTransfer);
let query: Record<string, jest.Mock>; let rpc: jest.Mock;
beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(watchaPayConfiguration).mockReturnValue({ environment: 'sandbox', key: 'wpay_test_synthetic', entitlementId: 'ent_test' });
  query = { select: jest.fn(), eq: jest.fn(), maybeSingle: jest.fn().mockResolvedValue({data:null,error:null}) };
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
  rpc = jest.fn().mockResolvedValue({data:0,error:null}); db.mockResolvedValue({from:jest.fn().mockReturnValue(query),rpc} as never);
  access.mockResolvedValue({configured:true, environment:'sandbox', channel:'alipay', result:{access:'granted', entitlement:{type:'quota',remaining:10},purchase:{url:'https://pay.watcha.cn/test'}}});
});
it('persists the exact transfer before provider consumption and credits after confirmation', async () => {
  rpc.mockResolvedValueOnce({data:[{id:'transfer-1',amount:10}],error:null}).mockResolvedValueOnce({data:10,error:null});
  consume.mockImplementation(async () => { expect(rpc).toHaveBeenCalledTimes(1); return {consumed:10,remaining:0}; });
  expect(await redeemWatchaPoints('buyer')).toEqual({balance:10,redeemed:10});
  expect(consume).toHaveBeenCalledWith('buyer','chat','transfer-1',10);
  expect(rpc).toHaveBeenLastCalledWith('credit_watcha_transfer',{p_id:'transfer-1',p_user_id:'buyer',p_environment:'sandbox'});
});
it('reconciles an ambiguous prior debit using its persisted amount even after remote balance is zero', async () => {
  query.maybeSingle.mockResolvedValue({data:{id:'old-transfer',amount:10},error:null});
  rpc.mockResolvedValue({data:10,error:null});
  await redeemWatchaPoints('buyer');
  expect(access).not.toHaveBeenCalled();
  expect(consume).toHaveBeenCalledWith('buyer','chat','old-transfer',10);
  expect(rpc).toHaveBeenCalledTimes(1);
});
it('never credits on ambiguous provider failure', async () => {
  query.maybeSingle.mockResolvedValue({data:{id:'old-transfer',amount:10},error:null});
  consume.mockRejectedValue(new Error('timeout'));
  await expect(redeemWatchaPoints('buyer')).rejects.toThrow('timeout');
  expect(rpc).not.toHaveBeenCalled();
});
it('does not issue a new debit if credit persistence failed', async () => {
  query.maybeSingle.mockResolvedValue({data:{id:'old-transfer',amount:10},error:null});
  rpc.mockResolvedValueOnce({data:null,error:{message:'offline'}}).mockResolvedValueOnce({data:10,error:null});
  await expect(redeemWatchaPoints('buyer')).rejects.toThrow('exchange_pending');
  await redeemWatchaPoints('buyer');
  expect(consume.mock.calls.map(call=>call[2])).toEqual(['old-transfer','old-transfer']);
});
it('fails closed with no database', async () => {
  db.mockResolvedValue(null);
  await expect(redeemWatchaPoints('buyer')).rejects.toThrow('database_unavailable');
  expect(consume).not.toHaveBeenCalled();
});
it('filters balance by both identity and environment', async () => {
  query.maybeSingle.mockResolvedValue({data:{balance:7},error:null});
  expect(await getWatchaPointBalance('buyer')).toBe(7);
  expect(query.eq).toHaveBeenCalledWith('user_id','buyer');
  expect(query.eq).toHaveBeenCalledWith('environment','sandbox');
});
it('uses an atomic service RPC and returns a typed paid reservation', async () => {
  rpc.mockResolvedValue({data:[{reservation_id:'r1',remaining:6}],error:null});
  expect(await reserveWatchaPoint('buyer','chat:req')).toEqual({id:'watcha:r1',source:'watcha',remaining:6});
});
