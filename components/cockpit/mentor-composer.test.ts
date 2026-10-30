import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (name: string) => readFileSync(join(process.cwd(), "components/cockpit", name), "utf8");

const conversation = () => read("AgentConversation.tsx");
const conversationCss = () => read("AgentConversation.module.css");
const resume = () => read("ResumeAgentConversation.tsx");
const resumeCss = () => read("ResumeAgentConversation.module.css");

test("输入框只有一个框，框下只剩一行免责声明", () => {
  const css = conversationCss();
  // textarea 自己不再浮阴影，聚焦环归外层 form.composer
  expect(css).toContain(".panel.panel textarea:focus-visible{outline:none;box-shadow:none;background:transparent}");
  expect(conversation()).toContain('className={styles.composer}');
  expect(conversation()).toMatch(/<footer><ModelPicker[^>]*\/>\s*<VoiceControls[^>]*\/>\s*<button aria-label="发送消息"/);
  expect(conversation()).toContain('className={styles.disclaimer}>AI 也会出错');
});

test("历史对话弹层展开后点外面或按 Esc 一定能收起来", () => {
  const source = conversation();
  expect(source).toContain('ref={historyBox}');
  expect(source).toContain('document.addEventListener("pointerdown",dismiss,true)');
  // 弹层是异步出现的，节点必须在事件回调里现取，不能挂载时抓一次
  expect(source).toContain('const box=historyBox.current;if(box?.open&&!box.contains(event.target as Node))');
  expect(source).toContain('!event.defaultPrevented&&box?.open');
  expect(source).toContain('box.querySelector("summary")?.focus()');
  expect(source).toContain('window.addEventListener("keydown",onKey)');
});

test("模型保留在输入区左下角，模式与用量设置仍可达",()=>{
  const source=conversation();
  expect(source).toContain('aria-label="辅导设置"');
  expect(source).toContain('aria-label="导师模式"');
  expect(source).toContain('<ModelPicker value={modelMode} onChange={setModelMode}');
  expect(source).toContain('popover="auto"');
  expect(source).toContain('settingsTrigger.current?.focus()');
  expect(source).toContain('window.innerWidth-width-12');
  expect(conversationCss()).toContain('.settingsPanel{position:fixed;inset:auto');
  expect(source).toContain('发送会调用 AI，失败释放额度');
  expect(source).toContain('useState<ChatMode>("auto")');
  expect(source).toContain('setModelModeState(isChatMode(saved)?saved:"auto")');
  const footer=source.slice(source.indexOf('<footer><ModelPicker'),source.indexOf('</footer>'));
  expect(footer.indexOf('<ModelPicker')).toBeLessThan(footer.indexOf('<VoiceControls'));
  expect(source.match(/<ModelPicker /g)).toHaveLength(1);
  expect(read('ModelPicker.module.css')).toContain('max-width:240px;margin-right:auto');
  expect(read('ModelPicker.module.css')).toContain('.wrap .trigger.trigger{min-height:44px}');
});

test("改稿消息独立滚动，输入留在底部，发送按钮仍在输入框里面", () => {
  expect(conversationCss()).toContain(".guidedWorkflow>:last-child{flex:1;min-height:0;width:100%}");
  expect(resumeCss()).toContain('.messages{flex:1;min-height:0;overflow-y:auto');
  expect(resumeCss()).toContain('.conversation .form{flex:none;display:flex');
  expect(resume()).toMatch(/<div className=\{styles\.composer\}>\s*<ResumeReferenceDraft\s*\/>\s*<textarea/);
  expect(resume()).toMatch(/<textarea[\s\S]*<div className=\{styles\.actions\}/);
  expect(resumeCss()).toContain('.composer:focus-within{box-shadow:var(--field-active-shadow,');
  expect(resumeCss()).toContain('width:44px;height:44px;min-width:44px;min-height:44px');
  expect(resumeCss()).toContain('.conversation .form .composer textarea');
});
