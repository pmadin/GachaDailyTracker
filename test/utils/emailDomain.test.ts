/**
 * Unit tests for the email-domain MX classifier (src/utils/emailDomain.ts). Pure logic,
 * no DNS or database. Run with: npm run test:email-domain
 */
import { classifyMxResult } from '../../src/utils/emailDomain';

let failures = 0;
function check(name: string, ok: boolean, extra = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
  if (!ok) failures++;
}

check('a domain with MX records is ok', classifyMxResult({ exchanges: ['alt1.gmail-smtp-in.l.google.com'] }) === 'ok');
check('one real exchange among blanks is still ok', classifyMxResult({ exchanges: ['', 'mx.example.org'] }) === 'ok');
check('null MX (empty exchange, RFC 7505) means no mail', classifyMxResult({ exchanges: [''] }) === 'no_mail');
check('null MX written as "." means no mail', classifyMxResult({ exchanges: ['.'] }) === 'no_mail');
check('no MX records at all means no mail', classifyMxResult({ exchanges: [] }) === 'no_mail');
check('made-up domain (ENOTFOUND) means no mail', classifyMxResult({ errorCode: 'ENOTFOUND' }) === 'no_mail');
check('domain without MX (ENODATA) means no mail', classifyMxResult({ errorCode: 'ENODATA' }) === 'no_mail');
check('broken mail DNS on a parked domain (ESERVFAIL) means no mail', classifyMxResult({ errorCode: 'ESERVFAIL' }) === 'no_mail');
check('our DNS timing out is inconclusive, not a rejection', classifyMxResult({ errorCode: 'ETIMEOUT' }) === 'unknown');
check('our resolver refusing is inconclusive', classifyMxResult({ errorCode: 'ECONNREFUSED' }) === 'unknown');

if (failures > 0) {
  console.error(`\n${failures} FAILURE(S)`);
  process.exit(1);
}
console.log('\nALL EMAIL DOMAIN CHECKS PASSED');
