/** Preserve explicitly identified material on model failure; never guess mixed content. */
export function deferredIntake(input:{materialKindHint:string;sourceLabel:string;company:string;role:string;location:string;jdText:string;resumeText:string}) {
 const resume=input.materialKindHint==="resume"||(!input.materialKindHint&&/^文件导入.*(?:简历|履历|resume\b)/i.test(input.sourceLabel));
 if(resume){
  const text=input.resumeText||input.jdText;
  if(!text.trim())return null;
  return {workspaceType:"preparation",company:"求职准备",role:input.role||"目标待确认",location:input.location,jdText:"",resumeText:text,profileText:text,sourceLabel:input.sourceLabel};
 }
 if(input.materialKindHint==="job"&&input.company&&input.role&&input.jdText.trim())return {...input,workspaceType:"job",profileText:""};
 return null;
}
