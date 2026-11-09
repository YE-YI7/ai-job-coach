import type {GroundingSource} from './citation-verifier';
import type {ContextBundle} from './types';
import {projectF6Document} from './resume-f6-projection';
import {validateArtifactDraft} from './consistency';

/** Server-owned, separately authorized parity fixture; never accepted from a
 * normal user's request JSON. Full résumé is context, excerpt is edit scope. */
export type F6ReproSection = {
  resume: string;
  jd: string;
  facts: string;
  task: string;
  excerpt: string;
  claimIds: string[];
};

export function f6ReproSources(section: F6ReproSection | undefined, sources: GroundingSource[]) {
  if (!section) return [];
  const ids = new Set(section.claimIds);
  const selected = sources.filter(source => ids.has(source.id));
  if (selected.length !== ids.size || selected.some(source => !section.facts.includes(source.text))) {
    throw Error('F6_REPRO_FACT_SOURCE_MISSING');
  }
  return selected;
}

export function f6ReproScopeIssues(body: string): string[] {
  const lines = body.trim().split(/\r?\n/);
  const heading = /^(#{1,6})\s+益职\s*AI\b/.exec(lines[0]);
  return !heading || !lines.slice(1).some(line => line.trim())
    || lines.slice(1).some(line => new RegExp('^#{1,' + heading[1].length + '}\\s+').test(line))
    ? ['本次只交付益职 AI 项目段，完整简历只作上下文；不能改写其他经历。'] : [];
}

/** The source paragraph remains evidence; newly imported project notes add to
 * it rather than replacing it. Use the same provenance at tool and save gates. */
export function f6ReproChangeSourceIds(before: string, section: F6ReproSection,
  facts: GroundingSource[]) {
  return [...new Set([...section.claimIds,...facts.filter(fact=>before.includes(fact.text)
    || fact.text.includes(before)).map(fact=>fact.id)])];
}

export function f6ReproArtifactIssues(source: string,candidate: string,section: F6ReproSection,
  facts: GroundingSource[],context: ContextBundle) {
  return projectF6Document(source,candidate).flatMap(({before,after})=>
    validateArtifactDraft({artifactType:'target_resume',visibility:'recruiter_safe',sections:[{
      path:'f6.repro.after',content:after,claimIds:f6ReproChangeSourceIds(before,section,facts),
    }]},context).issues.filter(issue=>issue.severity==='error').map(issue=>issue.message));
}
