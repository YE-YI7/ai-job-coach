import { callSearchTool, openSearchQueries, parseOpenPosting, parseSearchHits, publicJobUrl, searchOpenJobs } from "./open-search";

const url = "https://career.example.edu.cn/job/79545.html";
const hit = { title:"机械工程师-上海联眺科技有限公司", url, text:"搜索摘要" };
const page = `# ${hit.title}\nURL: ${url}\n【上海联眺科技有限公司】 发布时间：2026-08-26\n工作地域：上海市\n职位描述：负责设备机械结构设计，完成样机调试。任职资格：本科，机械专业，熟悉SolidWorks。\n联系地址：天津市`;
const packet = (text:string,isError=false) => new Response(`event: message\ndata: ${JSON.stringify({jsonrpc:"2.0",id:1,result:{content:[{type:"text",text}],isError}})}\n\n`);
afterEach(()=>jest.restoreAllMocks());

test("arbitrary non-internet role searched without company catalog; no free location text sent",()=>{
 const queries=openSearchQueries(["机械工程师","solidworks"],"上海 张小明 13800138000");
 expect(queries).toHaveLength(2);
 expect(queries.join()).toContain("机械工程师");
 expect(queries.join()).toContain("solidworks");
 expect(queries.join()).not.toMatch(/张小明|13800138000|腾讯|网易/);
});
test.each(["http://example.com/job", "https://127.0.0.1/job","https://2130706433/job","https://[::1]/job","https://user:pwd@example.com/job","https://example.local/job","https://example.com/job?token=secret"])("unsafe URL blocked: %s",raw=>expect(publicJobUrl(raw)).toBeNull());
test("source URL and metadata attributed to its own page, footer city not used",()=>{
 expect(parseOpenPosting(hit,page,"2026-10-01")).toMatchObject({company:"上海联眺科技有限公司",title:"机械工程师",location:"上海",postedAt:"2026-08-26T00:00:00.000Z"});
 expect(parseOpenPosting(hit,page.replace(url,"https://wrong.example/job"),"2026-10-01")).toBeNull();
});
test("liepin employer, city and role extracted, headhunter identity not guessed",()=>{
 const h={title:"【上海 机械工程师招聘】-仙工智能上海招聘信息-猎聘",url:"https://www.liepin.com/job/123.shtml",text:""};
 const p=`# ${h.title}\nURL: ${h.url}\n机械工程师 上海 招聘 仙工智能\n岗位职责：机械设计。任职要求：本科。`;
 expect(parseOpenPosting(h,p,"2026-10-01")).toMatchObject({company:"仙工智能",title:"机械工程师",location:"上海",postedAt:null});
 expect(parseOpenPosting({...h,title:h.title.replace("仙工智能","猎头顾问")},p.replace("仙工智能","猎头顾问"),"2026-10-01")).toBeNull();
});
test("list, article, closed job, missing requirements and missing identity never become jobs",()=>{
 expect(parseOpenPosting({...hit,title:"机械工程师招聘简章"},page,"2026-10-01")).toBeNull();
 expect(parseOpenPosting(hit,page+"职位已关闭","2026-10-01")).toBeNull();
 expect(parseOpenPosting(hit,page.replace("任职资格","未知字段"),"2026-10-01")).toBeNull();
 expect(parseOpenPosting({...hit,title:"机械工程师"},page,"2026-10-01")).toBeNull();
});
test("actual project work location overrides header city; unrelated company footer ignored",()=>{
 const h={title:"【杭州 主办会计招聘】-交通科技集团杭州招聘信息-猎聘",url:"https://www.liepin.com/job/123.shtml",text:""};
 const p=`# ${h.title}\nURL: ${h.url}\n交通科技集团 主办会计\n职位介绍 项目工作地点：福建武夷山\n工作内容：全盘账务。职位要求：本科。`;
 expect(parseOpenPosting(h,p,"2026-10-01")).toBeNull();
});
test("SSE and JSON packets supported; tool error does not become zero matches",async()=>{
 const f=jest.spyOn(globalThis,"fetch").mockResolvedValueOnce(packet("done")).mockResolvedValueOnce(new Response(JSON.stringify({result:{content:[{type:"text",text:"json"}]}}))).mockResolvedValueOnce(packet("rate limited",true));
 expect(await callSearchTool("web_search_exa",{query:"机械工程师"})).toBe("done");
 expect(await callSearchTool("web_search_exa",{query:"会计"})).toBe("json");
 await expect(callSearchTool("web_search_exa",{query:"护士"})).rejects.toThrow("额度受限");
 expect(f.mock.calls[0][1]).toMatchObject({redirect:"error",cache:"no-store"});
});
test("real query -> discovered URL -> batch detail read, max three calls, no fixed companies",async()=>{
 const f=jest.spyOn(globalThis,"fetch").mockImplementation(async (_input,init)=>{
  const params=JSON.parse(String(init?.body)).params;
  return packet(params.name==="web_search_exa"?`Title: ${hit.title}\nURL: ${url}\nHighlights:\n摘要`:page);
 });
 const result=await searchOpenJobs(["机械工程师"],"上海");
 expect(result.calls).toBe(3);expect(result.failures).toEqual([]);expect(result.postings).toHaveLength(1);
 expect(result.postings[0].company).toBe("上海联眺科技有限公司");
 expect(f.mock.calls.map(c=>JSON.parse(String(c[1]?.body)).params.name)).toEqual(["web_search_exa","web_search_exa","web_fetch_exa"]);
});
test("detail read failure retained, no search snippet substituted for verified JD",async()=>{
 jest.spyOn(globalThis,"fetch").mockImplementation(async (_input,init)=>{
  const params=JSON.parse(String(init?.body)).params;
  return params.name==="web_search_exa"?packet(`Title: ${hit.title}\nURL: ${url}\nHighlights:\n摘要`):packet("failed",true);
 });
 const result=await searchOpenJobs(["机械工程师"],"上海");
 expect(result.postings).toEqual([]);expect(result.failures).toEqual([{source:"web-search",keyword:"岗位详情读取"}]);
});
test("search headers parse multiple results but reject unsafe URLs",()=>{
 expect(parseSearchHits(`Title: ${hit.title}\nURL: ${url}\nHighlights: body\n---\nTitle: unsafe\nURL: https://127.0.0.1/x`)).toHaveLength(1);
});
