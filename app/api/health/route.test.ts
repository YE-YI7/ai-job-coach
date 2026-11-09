import {GET} from './route';
import {getDbClient} from '@/lib/db';
import {f6RuntimeIdentity} from '@/lib/coach-harness/f6-runtime-contract';

jest.mock('@/lib/db');
test('health reports the writer contract and is not cached',async()=>{
  const limit=jest.fn().mockResolvedValue({error:null});
  (getDbClient as jest.Mock).mockResolvedValue({from:()=>({select:()=>({limit})})});
  const response=await GET();
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.json()).toEqual({ok:true,database:'ok',resumeRuntime:f6RuntimeIdentity()});
});
test('a release receipt never masks an unavailable database',async()=>{
  (getDbClient as jest.Mock).mockResolvedValue(null);
  const response=await GET();
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ok:false,database:'unconfigured'});
});
