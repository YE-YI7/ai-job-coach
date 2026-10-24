import {readFileSync} from 'node:fs';
test('whole resume editing is guarded, while detail navigation does not start a model',()=>{
  const toolbar=readFileSync('components/cockpit/ResumeToolbar.tsx','utf8');
  const confirm=readFileSync('components/cockpit/ResumeGenerateConfirm.tsx','utf8');
  expect(toolbar).toContain('needsDetail?onGenerate():setConfirmGenerate(true)');
  expect(toolbar).not.toContain('disabled={busy || !canGenerate} onClick={onGenerate}');
  expect(confirm).toContain('if(submitted.current)return');
  expect(confirm).toContain('autoFocus onClick={onClose}');
  expect(confirm).toContain('node?.showModal()');
});
test('login keeps the handoff flag, not the raw sentence or an arbitrary redirect',()=>{
  const page=readFileSync('app/cockpit/page.tsx','utf8');
  expect(page).toContain("initialEntry==='one_sentence'&&params.handoff==='1'");
  expect(page).toContain('encodeURIComponent(destination)');
});
test('new entry has its own goal, confirmed save clears only its handoff, old goals remain hidden not rewritten',()=>{
  const entry=readFileSync('components/cockpit/CompanionStart.tsx','utf8');
  const arrangement=readFileSync('components/cockpit/CurrentArrangement.tsx','utf8');
  expect(entry).toContain('claimLandingHandoff(sessionStorage,handoff.id,scope)');
  expect(entry).toContain('initialText={handoff?.text}');
  expect(arrangement).toContain('[newGoal, setNewGoal] = useState(Boolean(initialText))');
  expect(arrangement).toContain("if(action==='open')onOpened?.()");
  expect(arrangement).toContain('task && !newGoal');
});
