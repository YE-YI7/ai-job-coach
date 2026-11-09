// Mechanical, private-input-free snapshot of the accepted F6 catalogue/runtime contract.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const lab = process.argv[2];
if (!lab) throw Error('Usage: node scripts/freeze-f6-origin.mjs <original-lab-directory>');
const root = process.cwd();
const original = JSON.parse(fs.readFileSync(path.join(lab, 'runs-codex/2026-11-06-F6/first-request.json'), 'utf8'));
const accepted = JSON.parse(fs.readFileSync(path.join(root, 'lib/coach-harness/f6-accepted.json'), 'utf8'));
const resources = {...accepted.resources};
for (const id of ['S002', 'S003', 'S004', 'S005']) {
  resources[id] = fs.readFileSync(path.join(lab, '../好样本库', id + '.md'), 'utf8');
}
const sha = value => createHash('sha256').update(value).digest('hex');
const manifest = {
  source: 'Accepted F6 first-request.json; no candidate inputs or accepted draft embedded',
  systemHash: sha(original.messages[0].content),
  model: original.model, temperature: original.temperature,
  maxTokens: original.max_tokens, thinking: original.thinking,
  maxAuthorCalls: 12, maxPublicRequests: 4,
  tools: original.tools,
  resources,
  resourceHashes: Object.fromEntries(Object.entries(resources).map(([id, text]) => [id, sha(text)])),
};
if (manifest.systemHash !== sha(accepted.system)) throw Error('ORIGINAL_SYSTEM_CHANGED');
fs.writeFileSync(path.join(root, 'lib/coach-harness/f6-origin.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({systemHash: manifest.systemHash, tools: manifest.tools.map(t => t.function.name), resources: Object.keys(resources)}));
