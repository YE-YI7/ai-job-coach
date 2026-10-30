import {readFileSync} from 'node:fs';
test('resume composer receives the same catalog and preference as normal coaching',()=>{
 const agent=readFileSync('components/cockpit/AgentConversation.tsx','utf8');
 const resume=readFileSync('components/cockpit/ResumeAgentConversation.tsx','utf8');
 const cockpit=readFileSync('components/cockpit/CockpitApp.tsx','utf8');
 expect(agent).toContain('ResumeComposerModel.Provider value={{mode:modelMode,control:<ModelPicker');
 expect(resume).toContain('modelControl.control');
 expect(resume).toContain('disabled={busy||running||awaitingReply}');
 expect(resume).toContain('modelControl?.mode');
 expect(cockpit).toContain('onReceipt,modelMode,reference)');
 expect(cockpit).toContain('requestId,modelMode,resumeReference,questionId');
});
