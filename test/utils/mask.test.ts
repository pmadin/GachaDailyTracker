/**
 * Unit tests for the admin-facing email mask (src/utils/mask.ts). Pure logic — no
 * database. Run with: npm run test:mask
 */
import { maskEmail } from '../../src/utils/mask';

let failures = 0;
function check(name: string, ok: boolean, extra = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
  if (!ok) failures++;
}

check('the exact example from the report', maskEmail('begino4315@gzeos.com') === 'b********5@gzeos.com', maskEmail('begino4315@gzeos.com'));
check('domain is never touched', maskEmail('abcdef@example.co.uk') === 'a****f@example.co.uk', maskEmail('abcdef@example.co.uk'));
check('3-char local part masks the middle char only', maskEmail('abc@x.com') === 'a*c@x.com', maskEmail('abc@x.com'));
check('2-char local part: first char + one star', maskEmail('ab@x.com') === 'a*@x.com', maskEmail('ab@x.com'));
check('1-char local part: fully masked, domain kept', maskEmail('a@x.com') === '*@x.com', maskEmail('a@x.com'));
check('malformed input (no @) never echoes back the raw string', maskEmail('not-an-email') === '***');
check('malformed input (@ as first char) never echoes back the raw string', maskEmail('@x.com') === '***');
check('a long random local part only reveals first/last char', maskEmail('ovnztiqkiwhebcxigc@vtmpj.net') === 'o****************c@vtmpj.net', maskEmail('ovnztiqkiwhebcxigc@vtmpj.net'));
check('output length is stable (no accidental truncation)', maskEmail('begino4315@gzeos.com').length === 'begino4315@gzeos.com'.length);

if (failures > 0) {
  console.error(`\n${failures} FAILURE(S)`);
  process.exit(1);
}
console.log('\nALL EMAIL MASK CHECKS PASSED');
