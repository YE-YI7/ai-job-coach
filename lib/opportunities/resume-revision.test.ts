import {assertResumeRevision,ResumeRevisionConflict} from "./resume-revision";
test("late autosave cannot restore a replaced resume",()=>{
  expect(()=>assertResumeRevision({resumeRevision:"new"},{resumeRevision:"old"})).toThrow(ResumeRevisionConflict);
  expect(()=>assertResumeRevision({resumeRevision:"new"},{})).toThrow(ResumeRevisionConflict);
});
test("replacement requires the source revision it actually overwrites",()=>{
  expect(()=>assertResumeRevision({resumeRevision:"old"},{resumeRevision:"new"},{expectedResumeRevision:"old"})).not.toThrow();
  expect(()=>assertResumeRevision({resumeRevision:"newer"},{resumeRevision:"new"},{expectedResumeRevision:"old"})).toThrow();
});
test("legacy document upgrade and unchanged autosave remain usable",()=>{
  expect(()=>assertResumeRevision({},{})).not.toThrow();
  expect(()=>assertResumeRevision({},{resumeRevision:"first"},{expectedResumeRevision:null})).not.toThrow();
  expect(()=>assertResumeRevision({resumeRevision:"same"},{resumeRevision:"same"})).not.toThrow();
  expect(()=>assertResumeRevision({resumeText:""},{resumeRevision:"inherited"})).not.toThrow();
  expect(()=>assertResumeRevision({resumeText:"legacy original"},{resumeRevision:"unconfirmed"})).toThrow();
});
