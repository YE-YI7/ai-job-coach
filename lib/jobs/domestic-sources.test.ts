import { DOMESTIC_SOURCE_IDS, searchLiveJobs } from "./live-sources";
const row={PostId:"123456",RecruitPostName:"AI产品经理",CountryName:"中国",LocationName:"深圳",IsValid:true,Responsibility:"负责Agent平台产品规划",RequireWorkYearsName:"3年以上工作经验",LastUpdateTime:"2026年09月30日"};
afterEach(()=>jest.restoreAllMocks());
test("国内默认源不调用海外远程板；只发送关键词，不含简历",async()=>{
 const fetcher=jest.spyOn(globalThis,"fetch").mockResolvedValue(new Response(JSON.stringify({Code:200,Data:{Posts:[row]}})));
 expect(DOMESTIC_SOURCE_IDS).toEqual(["tencent","netease"]);
 const result=await searchLiveJobs(["AI产品经理"],{sourceIds:["tencent"]});
 expect(fetcher).toHaveBeenCalledTimes(1);
 const url=String(fetcher.mock.calls[0][0]);expect(new URL(url).hostname).toBe("careers.tencent.com");expect(new URL(url).searchParams.get("keyword")).toBe("AI产品经理");
 expect(result.postings[0]).toMatchObject({company:"腾讯",location:"深圳",postedAt:null,url:"https://careers.tencent.com/jobdesc.html?postId=123456"});
 expect(result.postings[0].rawPageText).toContain("3年以上");
});
test("国内源排除海外/失效/地区未明，不把官网更新时间当发布日期",async()=>{
 jest.spyOn(globalThis,"fetch").mockResolvedValue(new Response(JSON.stringify({Code:200,Data:{Posts:[row,{...row,PostId:"2",CountryName:"美国"},{...row,PostId:"3",IsValid:false},{...row,PostId:"4",LocationName:""}]}})));
 const result=await searchLiveJobs(["产品经理"],{sourceIds:["tencent"]});expect(result.postings).toHaveLength(1);expect(result.postings[0].postedAt).toBeNull();
});
test("业务错误不伪装成功无岗位",async()=>{
 jest.spyOn(globalThis,"fetch").mockResolvedValue(new Response(JSON.stringify({Code:500,Data:{Posts:[]}})));
 const result=await searchLiveJobs(["产品经理"],{sourceIds:["tencent"]});expect(result.failures).toEqual([{source:"tencent",keyword:"产品经理"}]);
});
test("网易公开查询仅传关键词，保留职责要求、多个国内地点和原页 ID",async()=>{
 const valid={id:77500,name:"中台产品经理",workPlaceNameList:["北京市","广州市","新加坡"],description:"负责Agent平台",requirement:"本科及以上，3年经验",updateTime:1789437989000};
 const fetcher=jest.spyOn(globalThis,"fetch").mockResolvedValue(new Response(JSON.stringify({code:200,data:{list:[valid,{...valid,id:2,workPlaceNameList:["新加坡"]},{...valid,id:"bad"},{...valid,id:3,workPlaceNameList:[]}]}})));
 const result=await searchLiveJobs(["产品经理"],{sourceIds:["netease"]});
 expect(fetcher.mock.calls[0][1]).toMatchObject({method:"POST",body:JSON.stringify({currentPage:1,pageSize:40,keyword:"产品经理"})});
 expect(result.postings).toHaveLength(1);expect(result.postings[0]).toMatchObject({company:"网易",location:"北京市、广州市",postedAt:null,url:"https://hr.163.com/job-detail.html?id=77500&lang=zh"});expect(result.postings[0].rawPageText).toContain("本科及以上");
});
test("一个国内源失败不阻断另一个源，也不隐藏失败",async()=>{
 jest.spyOn(globalThis,"fetch").mockImplementation(async url=>new Response(JSON.stringify(String(url).includes("hr.163.com")?{code:500}:{Code:200,Data:{Posts:[row]}})));
 const result=await searchLiveJobs(["产品经理"],{sourceIds:DOMESTIC_SOURCE_IDS});expect(result.postings).toHaveLength(1);expect(result.failures).toEqual([{source:"netease",keyword:"产品经理"}]);
});
