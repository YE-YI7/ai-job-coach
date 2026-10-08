import { parseJobBoard, matchJobs, fetchJobBoard } from "./discovery";
const source = {board:"meshy",company:"Meshy"};
const raw = {title:"Product Manager",location:"Shanghai",descriptionPlain:"Use SQL and Python",jobUrl:"https://jobs.ashbyhq.com/meshy/123",isListed:true};
const parse = (jobs: unknown[]) => parseJobBoard({jobs},source,"2026-09-27T00:00:00Z");
test("negative sales preference does not let sales titles through screening", () => {
  const jobs = parse([{...raw,title:"产品运营"},{...raw,title:"销售经理",jobUrl:"https://jobs.ashbyhq.com/meshy/sales"}]);
  expect(matchJobs(jobs,{role:"用户运营或产品运营，不考虑销售",location:"上海",resume:""}).map(j=>j.title)).toEqual(["产品运营"]);
});
test("only listed postings, trustworthy source links, and unique URLs",()=>{
  expect(parse([raw,raw,{...raw,isListed:false},{...raw,jobUrl:"https://evil.test/meshy/123"},{...raw,jobUrl:"https://jobs.ashbyhq.com/other/123"}])).toHaveLength(1);
});
test("invalid upstream shape is an error, not zero jobs",()=>expect(()=>parseJobBoard({},source,"")).toThrow());
test("Chinese role and city find corresponding English listing",()=>{
  const result=matchJobs(parse([raw]),{role:"AI 产品经理",location:"上海",resume:"使用 SQL"});
  expect(result).toHaveLength(1);expect(result[0].reasons.join()).toContain("sql");expect(result[0]).not.toHaveProperty("score");
});
test("foreign and unknown locations do not silently pass location filter",()=>{
  expect(matchJobs(parse([{...raw,location:"US Remote"}]),{role:"产品经理",location:"上海",resume:""})).toHaveLength(0);
});
test("description mentions of product manager do not make engineering jobs matches",()=>{
  expect(matchJobs(parse([{...raw,title:"Engineer",descriptionPlain:"Work with a product manager"}]),{role:"产品经理",location:"",resume:""})).toHaveLength(0);
});
test("secondary city is searchable",()=>{
  expect(matchJobs(parse([{...raw,location:"Beijing",secondaryLocations:[{location:"Shanghai"}]}]),{role:"产品经理",location:"上海",resume:""})).toHaveLength(1);
});
test("malformed records and unsafe schemes are excluded",()=>{
  expect(parse([null,3,{...raw,jobUrl:"http://jobs.ashbyhq.com/meshy/123"},{...raw,descriptionPlain:""}])).toHaveLength(0);
});
test("上网搜一轮捞回几百条时，界面按条数收口而不是铺满屏",()=>{
  const many=parse(Array.from({length:40},(_,i)=>({...raw,jobUrl:`https://jobs.ashbyhq.com/meshy/${i}`})));
  expect(many).toHaveLength(40);
  expect(matchJobs(many,{role:"产品经理",location:"上海",resume:""})).toHaveLength(12);
  expect(matchJobs(many,{role:"产品经理",location:"上海",resume:""},3)).toHaveLength(3);
});
test("never fetch arbitrary board URLs",async()=>{
  await expect(fetchJobBoard({board:"../../private",company:"Other"})).rejects.toThrow("不支持");
});
test("manufacturing engineering direction cannot become software engineering",()=>{
 const jobs=parse([{...raw,title:"机械设计工程师"},{...raw,title:"软件工程师",jobUrl:"https://jobs.ashbyhq.com/meshy/456"}]);
 expect(matchJobs(jobs,{role:"机械工程师",location:"上海",resume:"负责机械设计"}).map(j=>j.title)).toEqual(["机械设计工程师"]);
});
