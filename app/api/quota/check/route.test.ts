import {GET} from "./route";
import {getCurrentUserId} from "@/lib/auth";
import {getDbClient} from "@/lib/db";
import {checkQuota,getOrCreateQuota} from "@/lib/quota";
jest.mock("@/lib/auth");jest.mock("@/lib/db");jest.mock("@/lib/quota");
const session="11111111-1111-4111-8111-111111111111";
function chain(data:unknown){const q:any={};for(const method of ["select","eq"])q[method]=jest.fn(()=>q);q.maybeSingle=jest.fn(async()=>({data,error:null}));q.limit=jest.fn(async()=>({data,error:null}));return q;}
beforeEach(()=>{jest.resetAllMocks();(getCurrentUserId as jest.Mock).mockResolvedValue("owner");(getOrCreateQuota as jest.Mock).mockResolvedValue({free_chat_daily:0});(checkQuota as jest.Mock).mockResolvedValue({allowed:false,source:"free",remaining:0});});
function fixture(grant:unknown=null,turns:unknown=[],owned=true){const sessions=chain(owned?{id:session}:null);(getDbClient as jest.Mock).mockResolvedValue({from:(table:string)=>({coach_learning_sessions:sessions,coach_first_guidance:chain(grant),coach_agent_turns:chain(turns)}[table])});return sessions;}
const req=()=>new Request(`https://example.com/api/quota/check?sessionId=${session}`);
test("first bounded lesson remains available after ordinary quota exhaustion",async()=>{const sessions=fixture();const body=await (await GET(req())).json();expect(body.checks.chat).toMatchObject({allowed:true,remaining:2});expect(sessions.eq).toHaveBeenCalledWith("user_id","owner");});
test("first-lesson feedback allowance stays in its original session",async()=>{fixture({session_id:session,status:"committed",completed_replies:1},[{session_id:session}]);expect((await (await GET(req())).json()).checks.chat.remaining).toBe(1);});
test.each([{session_id:"other",status:"committed",completed_replies:1},{session_id:session,status:"reserved",completed_replies:0},{session_id:session,status:"committed",completed_replies:2}])("cannot grant a second allowance or reuse reserved/finished lesson",async grant=>{fixture(grant,[{session_id:session}]);expect((await (await GET(req())).json()).checks.chat.allowed).toBe(false);});
test("foreign session is not eligible for guidance",async()=>{fixture(null,[],false);expect((await (await GET(req())).json()).checks.chat.allowed).toBe(false);});
