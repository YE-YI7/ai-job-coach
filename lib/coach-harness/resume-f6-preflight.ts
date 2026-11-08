import {projectF6Document} from './resume-f6-projection';
import {resumeSourceProtection} from './resume-source-protection';
import {resumeEditValueIssues} from './resume-edit-value';
import {f6MetricDirectionIssues} from './resume-f6-writer';
import {citationGroundingDecision} from './guard-slots/verification.guards';
import type {GroundingSource} from './citation-verifier';
import {resumeResultCaveatIssues} from './resume-result-caveats';

/** Verification feedback is data for the SAME author, not a new reviewer,
 * candidate evidence, an automatic approval or permission to change facts. */
export function f6DocumentPreflight(source:string,candidate:string,options:{
  resume?:string; supplements?:Array<{sourceExcerpt:string;source:GroundingSource}>;
}={}){
  return projectF6Document(source,candidate).flatMap(({before,after})=>{
    const sources=[{id:'base-resume',text:before},...(options.supplements||[])
      .filter(item=>before.includes(item.sourceExcerpt)||item.sourceExcerpt.includes(before)).map(item=>item.source)];
    const citation=after?citationGroundingDecision({citation:{candidateText:after,sources}}):null;
    return [
      ...resumeSourceProtection(before,after,'整稿选材与重构',options.resume||source,true),
      ...resumeEditValueIssues(before,after),
      ...f6MetricDirectionIssues(before,after),
      ...resumeResultCaveatIssues(before,after),
      ...(citation?.outcome==='block'?[citation.reason.message]:[]),
    ];
  });
}
