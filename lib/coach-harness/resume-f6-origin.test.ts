import {createHash} from 'node:crypto';
import accepted from './f6-accepted.json';
import origin from './f6-origin.json';

const sha=(text:string)=>createHash('sha256').update(text).digest('hex');
test('production F6 keeps the exact accepted map, full spec and teaching cases',()=>{
  // Cross-checked against the original F6 first-request and accepted artefact,
  // not regenerated from a new prompt or the current production response.
  expect(sha(accepted.system)).toBe('93be16d69b9ba62fc28de3cf63bbad2fabfbdc8a16be053a694e0be0099775c4');
  expect(sha(accepted.resources['spec.md'])).toBe('a85f246b793b4d38640b0e94c67ad618e4e8ba4fca436f86598e5a216cc2729b');
  expect(sha(accepted.resources.S006)).toBe('c16058c86524d1d8e68ff14b0f16c8fd9fb00fb162cfb5e17b9ff9b4e649acf6');
  expect(sha(accepted.resources.S007)).toBe('a048f0d725cfcbf95cac0f759cbb20d5e7a69baea304d2dde4c8c3bdc9795f74');
  expect(sha(JSON.stringify(origin.tools))).toBe('a893136a0e8485564aab9c5f62d85f3551df25ec2482a1ffbfcb89e4d401ca8d');
});
