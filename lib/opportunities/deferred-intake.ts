/** Preserve explicitly identified material on model failure; never guess mixed content. */
export function deferredIntake(input:{materialKindHint:string;sourceLabel:string;company:string;role:string;location:string;jdText:string;resumeText:string}) {
 // Supplementing a known job must never replace it with a preparation profile.
 if(input.company&&input.role&&input.jdText.trim()&&["job","resume","experience"].includes(input.materialKindHint))return {...input,workspaceType:"job",profileText:""};
 if(input.materialKindHint==="preparation" && (input.jdText.trim()||input.resumeText.trim()))return {workspaceType:"preparation",company:"求职准备",role:input.role||"目标待确认",location:input.location,jdText:"",resumeText:input.resumeText,profileText:input.jdText,sourceLabel:input.sourceLabel};
 const resume=input.materialKindHint==="resume"||(!input.materialKindHint&&/^文件导入.*(?:简历|履历|resume\b)/i.test(input.sourceLabel));
 if(resume){
  const text=input.resumeText||input.jdText;
  if(!text.trim())return null;
  return {workspaceType:"preparation",company:"求职准备",role:input.role||"目标待确认",location:input.location,jdText:"",resumeText:text,profileText:text,sourceLabel:input.sourceLabel};
 }
 if(input.materialKindHint==="job"&&input.company&&input.role&&input.jdText.trim())return {...input,workspaceType:"job",profileText:""};
 return null;
}

/** Unclassified material belongs in source notes, never in an invented JD/resume. */
export function preserveUnclassifiedIntake(input:Parameters<typeof deferredIntake>[0]) {
 const identified=deferredIntake(input);
 if(identified)return identified;
 if(!input.jdText.trim()&&!input.resumeText.trim())return null;
 return {workspaceType:"preparation",company:"求职准备",role:input.role||"方向待确认",location:input.location,jdText:"",resumeText:input.resumeText,profileText:input.jdText,sourceLabel:input.sourceLabel};
}
