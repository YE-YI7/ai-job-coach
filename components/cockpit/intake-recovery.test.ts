// Wiring contracts; behavioral stream/cache/server tests live in intake-flow and route suites.
import { readFileSync } from 'node:fs';
import path from 'node:path';
const source = readFileSync(path.join(process.cwd(), 'components/cockpit/CockpitApp.tsx'), 'utf8');
test('replacing a file resets the free-save-retry price label', () => {
  const form = source.slice(source.indexOf('function NewOpportunityForm('));
  const chooser = form.slice(form.indexOf('const chooseFile'), form.indexOf('if (receipt)'));
  expect(chooser).toMatch(/setFile\(candidate\);[\s\S]*setSaveFailed\(false\)/);
});
test('form submission is locked synchronously, not only after React rendering', () => {
  const form = source.slice(source.indexOf('function NewOpportunityForm('), source.indexOf('function ContextMaterialAction('));
  expect(form).toContain('if (!canSubmit || submittingRef.current) return;');
  expect(form).toContain('submittingRef.current = true;');
  expect(form).toContain('submittingRef.current = false;');
});
test('failed cloud save cannot be silently announced as browser-saved or auto-retrying', () => {
  const creation = source.slice(source.indexOf('const createOpportunity ='), source.indexOf('const supplementOpportunity ='));
  expect(creation).toContain('throw new IntakeSaveError(');
  expect(creation).not.toContain('云同步稍后重试');
  expect(creation).not.toContain('setLocalIds(');
});
