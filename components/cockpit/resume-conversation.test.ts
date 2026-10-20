import {readFileSync} from 'node:fs';
const view=readFileSync('components/cockpit/ResumeAgentConversation.tsx','utf8');
const app=readFileSync('components/cockpit/CockpitApp.tsx','utf8');
test('the résumé composer sends a message, never assumes that it is an answer or revision',()=>{
 expect(view).toContain('await onMessage(answer,requestId)');
 expect(view).not.toContain('question?onAnswer');expect(view).not.toContain('onRequest(answer)');
 expect(app).toContain('runResumeAgent("message",message,active,requestId)');
 expect(app).toContain("if(action!=='message')await saveOpportunity.current");
 expect(app).toContain('resumeRequestBusy.current&&(!resumeMessageBusy||generatingResume)');
 expect(app).toContain('generatingResume, resumeMessageBusy, supplementingMaterial');
});
test('draft and stable receipt survive a network failure and server discussion survives refresh',()=>{
 expect(view).toContain('localStorage.setItem(`${key}:request`');
 expect(view.indexOf('await onMessage')).toBeLessThan(view.indexOf("setAnswer('');try{localStorage.removeItem(key)"));
 expect(view).toContain('task.conversation||[]');expect(view).toContain('aria-label="简历讨论"');
 expect(view).toContain("useState('')");expect(view).toContain('setAnswer(localStorage.getItem(key)');
});
test('sending a discussion has thinking state instead of falsely starting editor state',()=>{
 expect(app).toContain("if(action==='message')setResumeMessageBusy(true);else setGeneratingResume(true)");
 expect(view).toContain('导师正在思考…');
 expect(view).toContain("conversation.at(-1)?.decision!=='discuss'");
});
test('resume discussion uses two bubble roles and one unobtrusive composer, not competing headings',()=>{
 expect(view).toContain('styles.userMessage');expect(view).toContain('styles.mentorMessage');
 expect(view).toContain('className={styles.srOnly}');expect(view).toContain('给简历导师发消息');
 expect(view).not.toContain('想聊聊这份简历？');expect(view).not.toContain('failureText(');
 expect(view).toContain('className={styles.failureDetails}');expect(view).toContain('查看详情');
 expect(view).toContain('task.state===\'failed\'&&showOutcome');
 expect(view).not.toContain('scrollIntoView');
});
test('running and saved discussion retain their transcript and recovery controls',()=>{
 expect(view.indexOf('conversation.map')).toBeLessThan(view.indexOf('{running?'));
 expect(view).toContain('task.question?.id,task.state,busy');
 expect(view).toContain('disabled={busy||running}');
 expect(view).toContain('等待较久，重试这次修改');expect(view).toContain('先用已有内容修改');
});
