import {getCurrentUserFromRequest} from './auth';
import {cookies} from 'next/headers';
import {getDbClient} from './db';
import {verifySessionToken} from './session';
jest.mock('next/headers',()=>({cookies:jest.fn()}));
jest.mock('./db',()=>({getDbClient:jest.fn()}));
jest.mock('./session',()=>({verifySessionToken:jest.fn()}));
beforeEach(()=>{jest.resetAllMocks();(cookies as jest.Mock).mockResolvedValue({get:(name:string)=>name==='sb-access-token'?{value:'signed-proof'}:undefined});});
test.each([null,{id:'empty-phone',provider:'phone',phone:null}])('retired or missing phone identity cannot reuse an old session: %p',async(data)=>{
  (verifySessionToken as jest.Mock).mockResolvedValue({userId:'empty-phone'});
  const query={select:jest.fn().mockReturnThis(),eq:jest.fn().mockReturnThis(),single:jest.fn().mockResolvedValue({data,error:null})};
  (getDbClient as jest.Mock).mockResolvedValue({from:()=>query});
  expect(await getCurrentUserFromRequest()).toBeNull();
});
test('an active phone identity retains its own user id',async()=>{
  (verifySessionToken as jest.Mock).mockResolvedValue({userId:'phone'});
  const query={select:jest.fn().mockReturnThis(),eq:jest.fn().mockReturnThis(),single:jest.fn().mockResolvedValue({data:{id:'phone',provider:'phone',phone:'synthetic'},error:null})};
  (getDbClient as jest.Mock).mockResolvedValue({from:()=>query});
  expect(await getCurrentUserFromRequest()).toEqual({id:'phone',email:undefined});
});
test('existing email/watcha signed sessions keep their path and id',async()=>{
  (verifySessionToken as jest.Mock).mockResolvedValue({userId:'original',email:'test@example.invalid'});
  expect(await getCurrentUserFromRequest()).toEqual({id:'original',email:'test@example.invalid'});
  expect(getDbClient).not.toHaveBeenCalled();
});
