import {readFileSync} from 'node:fs';
const view=readFileSync('components/cockpit/ResumeAgentConversation.tsx','utf8');
const app=readFileSync('components/cockpit/CockpitApp.tsx','utf8');
test('the résumé composer sends a message, never assumes that it is an answer or revision',()=>{
 expect(view).toContain('await sendMessage(answer,requestId)');
 expect(view).toContain('await onMessage(text,requestId,reply=>');
 expect(view).not.toContain('question?onAnswer');expect(view).not.toContain('onRequest(answer)');
 expect(app).toContain('runResumeAgent("message",message,active,requestId,onReply,undefined,onReceipt)');
 expect(app).toContain("if(action!=='message')await saveOpportunity.current");
 expect(app).toContain('resumeRequestBusy.current&&(!resumeMessageBusy||generatingResume)');
 expect(app).toContain('generatingResume, resumeMessageBusy, supplementingMaterial');
});
test('draft and stable receipt survive a network failure and server discussion survives refresh',()=>{
 expect(view).toContain('localStorage.setItem(`${key}:request`');
 expect(view.indexOf("if(wasDraft){answerRef.current='';setAnswer('')")).toBeLessThan(view.indexOf('await onMessage'));
 expect(view).toContain('task.conversation||[]');expect(view).toContain('aria-label="简历讨论"');
 expect(view).toContain("useState('')");expect(view).toContain("draft=localStorage.getItem(key)||localStorage.getItem(legacyKey)||''");
 expect(view).toContain('const key=`yizhi:resume-question:${task.id}:request`');
 expect(app).toContain('key={resumeAgentTasks[active.id]!.id}');
 expect(view).toContain('wasDraft&&!answerRef.current');
});
test('sending a discussion has thinking state instead of falsely starting editor state',()=>{
 expect(app).toContain("if(action==='message')setResumeMessageBusy(true);else setGeneratingResume(true)");
 expect(view).toContain('导师正在思考…');
 expect(view).toContain("latest.status==='completed'&&latest.decision==='revise'");
});
test('failed receipts retry directly with the original ID and cannot clear another draft',()=>{
 expect(view).toContain('sendMessage(turn.message,turn.id)');
 expect(view).toContain('answerRef.current.trim()===text.trim()');
 expect(view).toContain('const requestId=failed?.id||');
 expect(view).toContain('turn.failure?.message');
 expect(view).toContain('resumeMessageExpired(turn,now)');
 expect(app.indexOf('if(result.task){onReceipt?.(result.task);receiveResumeTask(id,result.task);}')).toBeLessThan(app.indexOf("if(!response.ok||!result.ok)throw Error(result.error||'暂未完成"));
 expect(view).toContain('if(!received&&wasDraft&&!answerRef.current)');
 expect(view).toContain('receivedTurn||taskRef.current.conversation');
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
 expect(view.indexOf('visibleTurns.map')).toBeLessThan(view.indexOf('{running?'));
 expect(view).toContain('},[incomingId])');
 expect(view).not.toMatch(/<textarea[^>]*disabled=/);
 expect(view).toContain('等待较久，重试这次修改');expect(view).toContain('先用已有内容修改');
});
test('all new and restored mentor replies use shared safe Markdown, not raw paragraph strings',()=>{
 expect(view).toContain("import TutorMarkdown from './TutorMarkdown'");
 expect(view).not.toContain('<p>{turn.reply}</p>');
 expect(view).toContain('<TutorMarkdown className={styles.reply} streaming=');
 const markdown=readFileSync('components/cockpit/TutorMarkdown.tsx','utf8');
 expect(markdown).toContain('skipHtml');expect(markdown).toContain('img:()=>null');expect(markdown).toContain('stableTutorMarkdownPrefix');
 expect(app).toContain("'Accept':'application/x-ndjson'");expect(app).toContain('readChatResponse<');
 expect(view).not.toContain('[lastReply');
 expect(view).toContain('},[readingTurnId])');
 expect(readFileSync('components/cockpit/TutorMarkdown.module.css','utf8')).toContain('list-style-type:disc');
 const css=readFileSync('components/cockpit/ResumeAgentConversation.module.css','utf8');
 expect(css).toContain('.message .reply strong{font-weight:600;color:inherit}');
 expect(css).toContain('overflow-anchor:none');
});
