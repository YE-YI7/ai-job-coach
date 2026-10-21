import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const read=(path:string)=>readFileSync(resolve(process.cwd(),path),"utf8");
test("mentor welcome retains the shared sans face, actual messages keep shared Markdown",()=>{
 const css=read("components/cockpit/AgentConversation.module.css");
 expect(css).toContain(".welcome h3{font-family:inherit;font-weight:600}");
 const chat=read("components/cockpit/ResumeAgentConversation.tsx");
 expect(chat).toContain("TutorMarkdown");
 expect(chat).toContain("onReply");
});
test("homepage honors reduced-motion specificity and adoption never animates the entire document",()=>{
 const css=read("app/Home.module.css");
 expect(css).toContain(".slip .after,.slip[data-ink=after] .after,.shareCard{animation:none;transition:none");
 expect(css).not.toContain("animation:paper-settle");
 const home=read("app/HomeClient.tsx");
 expect(home).toContain("简历修改 · 虚构示例");
 expect(home).toContain("模拟面试 · 互动演示");
 expect(home).toContain("finally { setSharing(false); }");
 expect(home).toContain("图片生成受限时仍可复制文字");
});
