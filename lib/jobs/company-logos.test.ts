import fs from "node:fs";
import path from "node:path";
import { COMPANY_LOGOS, companyLogo } from "./company-logos";
test("已核实公司使用本地 PNG；未知公司不猜域名、不伪造品牌",()=>{
 for(const [name,asset] of Object.entries(COMPANY_LOGOS)){
  expect(companyLogo(name)).toBe(asset.path);expect(new URL(asset.source).protocol).toBe("https:");
  const bytes=fs.readFileSync(path.join(process.cwd(),"public",asset.path));expect(bytes.subarray(0,8).toString("hex")).toBe("89504e470d0a1a0a");
 }
 expect(companyLogo("未知公司")).toBeNull();expect(companyLogo("__proto__")).toBeNull();
});
