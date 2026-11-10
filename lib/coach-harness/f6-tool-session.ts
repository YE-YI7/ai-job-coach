import origin from './f6-origin.json';
import {F6PublicTools, type F6PublicBudget} from './f6-public-tools';
import type {NativeTool} from '@/lib/llm-tools';

export const F6_OUTPUT_FILES = ['portrait.md', 'battle.md', 'resume-new.md', 'changes.md', 'notes.md'];
export const F6_ORIGIN_TOOLS = origin.tools as NativeTool[];
export type F6ResourceId = 'resume.md' | 'jd.txt' | 'facts.md' | keyof typeof origin.resources;
export type F6ToolServices = {
  search: (topic: unknown) => Promise<unknown>;
  fetch: (urls: unknown) => Promise<unknown>;
  render: (text: string) => Promise<{bytes: Uint8Array; receipt: Record<string, unknown>}>;
  publicBudget?: () => F6PublicBudget;
};
export type F6Deliverables = {
  files: Record<string, string>; resumeRevision: number; renderedRevision: number;
  pdf?: {revision: number; receipt: Record<string, unknown>; base64: string; current: boolean};
  mentorGuidance?: import('./f6-mentor-guidance').F6MentorGuidance;
};
export class F6ToolSession {
  readonly outputs = new Map<string, string>();
  private revision = 0;
  private renderedRevision = -1;
  private pdf?: {revision: number; receipt: Record<string, unknown>; base64: string};
  readonly resources: Record<string, string>;
  private services: F6ToolServices;
  private publicExhausted = false;
  private mentorGuidanceRevision?: number;
  constructor(input: {resume: string; jd: string; facts: unknown; company?: string; domain?: string},
    private verify: (body: string) => string[], services?: F6ToolServices,
    publicCheckpoint?: Array<{name: string; output: Record<string, unknown>}>,
    fixtureSpec?: string, private mentorCoaching = false) {
    this.resources = {...origin.resources, 'resume.md': input.resume, 'jd.txt': input.jd,
      'facts.md': typeof input.facts === 'string' ? input.facts : JSON.stringify(input.facts),
      ...(fixtureSpec===undefined?{}:{'spec.md':fixtureSpec})};
    const company = input.company || '';
    // Preserve the experiment's explicitly identified public research target.
    // Unknown companies are not silently treated as Manus or called official.
    const domain = input.domain || (company.toLowerCase() === origin.researchTarget.company.toLowerCase()
      ? origin.researchTarget.domain : '');
    const research = new F6PublicTools(company, domain);
    if (publicCheckpoint) research.restoreCompletedCalls(publicCheckpoint);
    this.services = services || {
      search: topic => research.search(topic), fetch: urls => research.read(urls),
      render: async text => (await import('./f6-render-pdf')).renderF6Pdf(text),
      publicBudget: () => research.budget(),
    };
  }

  /** Availability is execution state, not an authored workflow. Keep every
   * usable origin tool unchanged; never advertise a tool that cannot run. */
  availableTools(): NativeTool[] {
    return this.publicUnavailable()
      ? F6_ORIGIN_TOOLS.filter(tool => !['search', 'fetch'].includes(tool.function.name))
      : F6_ORIGIN_TOOLS;
  }
  private publicUnavailable() {
    return this.publicExhausted || this.services.publicBudget?.().remaining === 0;
  }
  private publicState() {
    const budget = this.services.publicBudget?.();
    return {
      ...(budget ? {budget} : {}),
      status: this.publicUnavailable() ? 'exhausted' : 'available',
      ...(this.publicUnavailable() ? {
        retryable: false,
        unavailableTools: ['search', 'fetch'],
        availableTools: this.availableTools().map(tool => tool.function.name),
        instruction: '本任务的公开检索额度已耗尽，search 和 fetch 均不可再调用，换主题或网址也不会恢复。'
          + '已返回的材料仍有效；你可自行选用其余工具或直接回复。信息缺口保留为不确定，不把未查到的内容当事实。',
      } : {}),
    };
  }
  errorReceipt(error: unknown): Record<string, unknown> {
    const message = error instanceof Error ? error.message : 'TOOL_FAILED';
    if (message === 'PUBLIC_REQUEST_BUDGET') this.publicExhausted = true;
    return {error: message, ...(this.publicUnavailable() ? {publicResearch: this.publicState()} : {})};
  }
  async invoke(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (name === 'read_file') {
      if (typeof args.file !== 'string' || !Object.hasOwn(this.resources, args.file)) throw Error('READ_OUTSIDE_SCOPE');
      return {file: args.file, text: this.resources[args.file]};
    }
    if (name === 'search' || name === 'fetch') {
      if (this.publicUnavailable()) throw Error('PUBLIC_REQUEST_BUDGET');
      const output = await (name === 'search'
        ? this.services.search(args.topic) : this.services.fetch(args.urls)) as Record<string, unknown>;
      // The final successful request must announce exhaustion too. Waiting for
      // the next error would already waste an author call. Preserve its data.
      return {...output, ...(this.services.publicBudget ? {publicResearch: this.publicState()} : {})};
    }
    if (name === 'write_output') {
      if (!Array.isArray(args.files) || !args.files.length || args.files.length > 5) throw Error('OUTPUT_FILE_LIST_INVALID');
      const files = args.files as Array<{name: string; text: string}>;
      const names = new Set();
      for (const file of files) {
        if (!file || !F6_OUTPUT_FILES.includes(file.name) || names.has(file.name)
          || typeof file.text !== 'string' || !file.text.trim() || Buffer.byteLength(file.text) >= 20_000) {
          throw Error('OUTPUT_SCOPE_OR_SIZE_INVALID');
        }
        names.add(file.name);
      }
      const candidate = files.find(file => file.name === 'resume-new.md');
      const issues = candidate ? this.verify(candidate.text) : [];
      if (issues.length) return {saved: [], applied: false, issues,
        instruction: '程序未接收这版。对照原稿核实并修正，交回完整新稿；诊断不提供新的经历事实。'};
      for (const file of files) {
        const text = file.text;
        if (file.name === 'resume-new.md' && this.outputs.get(file.name) !== text) this.revision++;
        this.outputs.set(file.name, text);
      }
      if (this.mentorCoaching && names.has('changes.md')) this.mentorGuidanceRevision = this.revision;
      return {saved: files.map(file => file.name), resumeRevision: this.revision};
    }
    if (name === 'render_pdf') {
      const text = this.outputs.get('resume-new.md');
      if (!text) throw Error('NO_SAVED_RESUME_TO_RENDER');
      const result = await this.services.render(text);
      this.pdf = {revision: this.revision, receipt: result.receipt, base64: Buffer.from(result.bytes).toString('base64')};
      this.renderedRevision = this.revision;
      // Keep the original author-facing receipt. Rich PDF/storage metadata is
      // retained in deliverables, not added to the author's decision context.
      return {
        pages: result.receipt.pages,
        lastPageFillEstimate: result.receipt.lastPageFill,
        font: result.receipt.font,
        margin: result.receipt.margin,
        revision: this.renderedRevision,
      };
    }
    throw Error('F6_UNKNOWN_TOOL');
  }
  captureVisibleBody(text: string) {
    if (this.outputs.get('resume-new.md') !== text) this.revision++;
    this.outputs.set('resume-new.md', text);
  }
  deliverables(): F6Deliverables {
    const guidance = this.outputs.get('changes.md');
    return {files: Object.fromEntries(this.outputs), resumeRevision: this.revision,
      renderedRevision: this.renderedRevision,
      ...(this.mentorCoaching && guidance && this.mentorGuidanceRevision !== undefined ? {
        mentorGuidance: {version: 1 as const, text: guidance, resumeRevision: this.mentorGuidanceRevision,
          current: this.mentorGuidanceRevision === this.revision},
      } : {}),
      ...(this.pdf ? {pdf: {...this.pdf, current: this.pdf.revision === this.revision}} : {})};
  }
}
