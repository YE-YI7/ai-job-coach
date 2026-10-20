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
  expect(conversation()).toMatch(/<footer><label className=\{styles\.modelChoice\}[\s\S]*<VoiceControls[^>]*\/><button aria-label="发送消息"/);
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
  expect(source).toContain('aria-label="导师模型"');
  expect(source).toContain('popover="auto"');
  expect(source).toContain('settingsTrigger.current?.focus()');
  expect(source).toContain('window.innerWidth-width-12');
  expect(conversationCss()).toContain('.settingsPanel{position:fixed;inset:auto');
  expect(source).toContain('发送会调用 AI，失败释放额度');
  expect(source).toContain('useState<ChatMode>("auto")');
  expect(source).toContain('setModelModeState(isChatMode(saved)?saved:"auto")');
  expect(source).not.toContain('<ModelPicker');
  const footer=source.slice(source.indexOf('<footer><label className={styles.modelChoice}'),source.indexOf('</footer>'));
  expect(footer).toContain('aria-label="导师模型"');
  expect(footer.indexOf('aria-label="导师模型"')).toBeLessThan(footer.indexOf('<VoiceControls'));
  expect(source.match(/aria-label="导师模型"/g)).toHaveLength(1);
  expect(conversationCss()).toContain('max-width:240px;min-height:36px;margin-right:auto');
  expect(conversationCss()).toContain('.modelChoice{min-height:44px}');
});

test("改稿问答贴面板底部，发送按钮在输入框里面", () => {
  expect(conversationCss()).toContain(".guidedWorkflow>:last-child{margin-top:auto}");
  expect(resume()).toMatch(/<div className=\{styles\.composer\}>\s*<textarea/);
  expect(resume()).toMatch(/<textarea[\s\S]*<div className=\{styles\.actions\}/);
  expect(resumeCss()).toContain(".conversation .composer:focus-within{box-shadow:var(--field-active-shadow)}");
  expect(resumeCss()).toContain('.actions button[type=submit],.send{width:44px;height:44px}');
});
