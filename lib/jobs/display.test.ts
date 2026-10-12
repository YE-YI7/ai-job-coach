import {jobLocationLabel} from "./display";
test("compact cities preserve locations without duplicated provinces",()=>{
  expect(jobLocationLabel("北京市-北京市、四川省-成都市、广东省-深圳市、上海市-上海市、北京市-北京市")).toBe("北京 · 成都 · 深圳 · 上海");
  expect(jobLocationLabel("")).toBe("地点待核实");
  expect(jobLocationLabel("远程")).toBe("远程");
});
