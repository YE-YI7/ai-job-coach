/* Offline release gate. All rows are fictional and the DB client is mocked.
 * The original nine red cases are now regression tests, including the stronger
 * rule that a response event alone proves zero saved conversational rounds.
 * This never reads .env or calls production/models/payments/SMS.
 */
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const result=spawnSync(process.execPath,[require.resolve('jest/bin/jest'),
  'lib/admin-analytics-business.test.ts','lib/admin-analytics-business-store.test.ts',
  'app/api/admin/analytics/route.test.ts','--runInBand'],{cwd:root,stdio:'inherit',env:{...process.env,NODE_ENV:'test'}});
process.exitCode=result.status===null?1:result.status;
