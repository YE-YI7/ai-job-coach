import {currentJourneyStage,resumeGate} from "./timeline";
import type {Opportunity} from "./types";
const opportunity=(extra:Partial<Opportunity>={})=>({stage:"captured",resumeChanges:[],requirements:[],...extra}) as Opportunity;
test("current stage follows real job status, not visited screens",()=>{
 expect(currentJourneyStage(opportunity())).toBe("overview");
 expect(currentJourneyStage(opportunity({resumeText:"真实简历"}))).toBe("resume");
 expect(currentJourneyStage(opportunity({stage:"applied"}))).toBe("interview");
 expect(currentJourneyStage(opportunity({stage:"interviewing"}))).toBe("interview");
 expect(currentJourneyStage(opportunity({stage:"negotiating"}))).toBe("salary");
});
test("no frozen version is invented from progress alone",()=>{
 expect(resumeGate(opportunity({stage:"applied"})).frozen).toBeUndefined();
 expect(resumeGate(opportunity()).ready).toBeFalsy();
});
test("pending edits block freezing even after quality passed",()=>{
 const o=opportunity({applicationQuality:{artifactId:"a",version:1,status:"ready",reviews:[]},resumeChanges:[{status:"pending"} as Opportunity["resumeChanges"][number]]});
 expect(resumeGate(o).ready).toBe(false);
});
