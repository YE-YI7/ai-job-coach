import origin from './f6-origin.json';
import type {NativeTool} from '@/lib/llm-tools';

/** Same five capabilities. The product adapter adds one explicitly named
 * audience file; the accepted experiment's tools remain byte-identical. */
export const F6_MENTOR_TOOLS: NativeTool[] = structuredClone(origin.tools) as NativeTool[];
const write = F6_MENTOR_TOOLS.find(tool => tool.function.name === 'write_output')!;
write.function.description += ' resume-new.md is the complete authorized draft; notes.md and changes.md are internal selection/change/review notes.'
  + ' mentor.md is an optional direct message to the user about one real evidence gap, with recall/help and a useful factual question when needed.'
  + ' HR defense, change lists and specification self-checks do not belong in mentor.md. No new user-facing message is required when there is no useful gap.';
const files = (write.function.parameters.properties as {
  files: {maxItems: number; items: {properties: {name: {enum: string[]}}}};
}).files;
files.maxItems = 6;
files.items.properties.name.enum.push('mentor.md');
