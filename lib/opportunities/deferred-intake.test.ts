import {deferredIntake} from "./deferred-intake";
const base={materialKindHint:"",sourceLabel:"粘贴内容",company:"",role:"",location:"",jdText:"原始文字",resumeText:""};
test("explicit resume survives model failure without invented analysis or job",()=>{
 expect(deferredIntake({...base,materialKindHint:"resume"})).toMatchObject({workspaceType:"preparation",resumeText:"原始文字",jdText:""});
});
test("resume filename identifies material, arbitrary PDF does not",()=>{
 expect(deferredIntake({...base,sourceLabel:"文件导入 · 简历.pdf"})?.resumeText).toBe("原始文字");
 expect(deferredIntake({...base,sourceLabel:"文件导入 · 文档.pdf"})).toBeNull();
 expect(deferredIntake(base)).toBeNull();
});
test("known job preserves original JD only with explicit kind and fields",()=>{
 expect(deferredIntake({...base,materialKindHint:"job",company:"测试公司",role:"产品经理"})).toMatchObject({workspaceType:"job",jdText:"原始文字"});
 expect(deferredIntake({...base,materialKindHint:"job"})).toBeNull();
});
