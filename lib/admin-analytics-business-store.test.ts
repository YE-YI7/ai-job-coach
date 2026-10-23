import { readBusinessDataset, readBusinessSessions, readBusinessMaterial, analyticsSafeText } from "./admin-analytics-business-store";
import { analyticsDb, analyticsSeed, fixtureIds as ids } from "../test/analytics-business-fixture";
import { writeFileSync } from "node:fs";
jest.mock("@/lib/db",()=>({getDbClient:jest.fn(()=>{throw Error("Real DB forbidden in fixtures");})}));
const from="2026-10-22",to=from,asOf="2026-10-22T10:00:00.000Z";
const previous=process.env.ANALYTICS_INTERNAL_USER_IDS;
beforeEach(()=>{process.env.ANALYTICS_INTERNAL_USER_IDS=ids.owner;});
afterAll(()=>{if(previous===undefined)delete process.env.ANALYTICS_INTERNAL_USER_IDS;else process.env.ANALYTICS_INTERNAL_USER_IDS=previous;});
test("full filtered users page, exact feature cohort, and date selection use the same population",async()=>{
 const f=analyticsDb(analyticsSeed());
 const first=await readBusinessDataset(f.db,from,to,undefined,0,{asOf});
 expect(first.users.total).toBe(25);expect(first.users.rows).toHaveLength(20);expect(first.users.nextOffset).toBe(20);
 const next=await readBusinessDataset(f.db,from,to,undefined,20,{asOf});expect(next.users.rows).toHaveLength(5);expect(next.users.nextOffset).toBeNull();expect(next.window.asOf).toBe(first.window.asOf);
 const feature=await readBusinessDataset(f.db,from,to,"resume",0,{asOf});expect(feature.users.rows.map(u=>u.id)).toEqual([ids.user]);expect(feature.rows[0].activeUsers).toBe(1);
 const prior=await readBusinessDataset(f.db,"2026-10-21","2026-10-21",undefined,0,{asOf});expect(prior.rows[0].registered).toBe(24);expect(prior.rows[0].activeUsers).toBe(0);
 expect(first.users.rows.some(u=>u.id===ids.owner)).toBe(false);
});
test("all scope can find an inactive account; filters compose before pagination",async()=>{
 const f=analyticsDb(analyticsSeed());
 const quiet="11111111-1111-4111-8111-000000000025";
 const found=await readBusinessDataset(f.db,from,to,undefined,0,{asOf,scope:"all",userId:quiet,cohort:"new",maxRounds:0});expect(found.users.total).toBe(1);expect(found.users.rows[0].active).toBe(false);
 const active=await readBusinessDataset(f.db,from,to,undefined,0,{asOf,scope:"active",userId:quiet});expect(active.users.total).toBe(0);
 const stage=await readBusinessDataset(f.db,from,to,"resume",0,{asOf,stage:"preparing_application",minRounds:200});expect(stage.users.total).toBe(1);
});
test("201 saved turns are paginated, question precedes reply, resume discussion and exact Trace survive",async()=>{
 const f=analyticsDb(analyticsSeed());
 const detail=await readBusinessSessions(f.db,ids.user,from,to,{asOf,session:ids.session});
 expect(detail!.selectedSession!.turns.total).toBe(402);expect(detail!.selectedSession!.turns.nextOffset).toBe(20);
 expect(detail!.selectedSession!.turns.rows.slice(0,2).map(t=>t.role)).toEqual(["user","mentor"]);
 const next=await readBusinessSessions(f.db,ids.user,from,to,{asOf,session:ids.session,offset:400});expect(next!.selectedSession!.turns.rows).toHaveLength(2);
 const resume=await readBusinessSessions(f.db,ids.user,from,to,{asOf,session:`resume:${ids.task}`});expect(resume!.selectedSession!.turns.rows[0].text).not.toContain("fixture-not-a-real-token");
 expect(detail!.traces[0]).toMatchObject({traceId:ids.trace,runId:ids.run,taskId:ids.task,changeIds:["fixture-change-1"],href:`/admin/evals?run=${ids.run}`});
});
test("direct excluded IDs stop before private reads; cross-user session and material cannot resolve",async()=>{
 const f=analyticsDb(analyticsSeed());expect(await readBusinessSessions(f.db,ids.owner.toUpperCase(),from,to,{asOf})).toBeNull();expect(f.reads).toHaveLength(0);
 expect(await readBusinessSessions(f.db,ids.other,from,to,{asOf,session:ids.session})).toBeNull();
 expect(await readBusinessMaterial(f.db,ids.other,ids.job)).toBeNull();
});
test("real current material is distinct from historical conversation; no file URLs or invented scores",async()=>{
 const f=analyticsDb(analyticsSeed()),m=await readBusinessMaterial(f.db,ids.user,ids.job);
 expect(m!.note).toContain("不是所选日期");expect(JSON.stringify(m)).toContain("虚构 JD");expect(JSON.stringify(m)).toContain("fixture-change-1");expect(JSON.stringify(m)).toContain("虚构真实面试记录");expect(JSON.stringify(m)).not.toContain("80");
 expect(analyticsSafeText("Bearer fictional-credential-marker sk-fictional1234567890123 a@example.invalid 13800000000")).not.toMatch(/fictional-credential-marker|sk-fictional|a@example|13800000000/);
});
test("errors fail closed rather than returning zeros",async()=>{
 const f=analyticsDb(analyticsSeed(),"coach_agent_turns");await expect(readBusinessDataset(f.db,from,to,undefined,0,{asOf})).rejects.toBeTruthy();
});
test("a task updated after the frozen cutoff does not hide its earlier saved messages",async()=>{
 const seed=analyticsSeed();seed.coach_resume_tasks[0].updated_at="2026-10-22T10:30:00.000Z";
 const f=analyticsDb(seed),detail=await readBusinessSessions(f.db,ids.user,from,to,{asOf,session:`resume:${ids.task}`});expect(detail!.selectedSession!.turns.total).toBe(2);
});
test("cross-day full conversation is explicit and retains historical messages",async()=>{
 const seed=analyticsSeed();seed.coach_agent_turns.push({...seed.coach_agent_turns[0],id:"old-turn",request_id:"old-request",created_at:"2026-10-21T02:00:00.000Z"});const f=analyticsDb(seed);
 expect((await readBusinessSessions(f.db,ids.user,from,to,{asOf,session:ids.session}))!.selectedSession!.turns.total).toBe(402);
 expect((await readBusinessSessions(f.db,ids.user,from,to,{asOf,session:ids.session,full:true}))!.selectedSession!.turns.total).toBe(404);
});
test("production exclusions missing fail before every private query",async()=>{
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV="production";delete process.env.ANALYTICS_INTERNAL_USER_IDS;const f=analyticsDb(analyticsSeed());
 try{await expect(readBusinessDataset(f.db,from,to)).rejects.toThrow("analytics_exclusions_missing");await expect(readBusinessSessions(f.db,ids.user,from,to)).rejects.toThrow("analytics_exclusions_missing");expect(f.reads).toHaveLength(0);}finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;process.env.ANALYTICS_INTERNAL_USER_IDS=ids.owner;}
});
test("optional fictional browser payload generation uses the actual store",async()=>{
 if(!process.env.ANALYTICS_FIXTURE_OUTPUT)return;
 const f=analyticsDb(analyticsSeed()),common={asOf};
 const results={ids,asOf,first:await readBusinessDataset(f.db,from,to,undefined,0,common),second:await readBusinessDataset(f.db,from,to,undefined,20,common),feature:await readBusinessDataset(f.db,from,to,"resume",0,common),prior:await readBusinessDataset(f.db,"2026-10-21","2026-10-21",undefined,0,common),detail:await readBusinessSessions(f.db,ids.user,from,to,common),selected:await readBusinessSessions(f.db,ids.user,from,to,{...common,session:ids.session}),messageNext:await readBusinessSessions(f.db,ids.user,from,to,{...common,session:ids.session,offset:20}),full:await readBusinessSessions(f.db,ids.user,from,to,{...common,session:ids.session,full:true}),material:await readBusinessMaterial(f.db,ids.user,ids.job)};
 writeFileSync(process.env.ANALYTICS_FIXTURE_OUTPUT,JSON.stringify(results));
});
