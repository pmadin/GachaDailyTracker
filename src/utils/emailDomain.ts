import { Resolver } from 'dns/promises';

export type DomainVerdict = 'ok' | 'no_mail' | 'unknown';

// DNS answers that mean "this domain can't receive mail" (it doesn't exist, has no MX,
// or its mail DNS is broken, like a parked domain). Anything else, such as a timeout or
// our own resolver refusing, is our problem, not the user's, so it's treated as unknown.
const NO_MAIL_CODES = new Set(['ENOTFOUND', 'ENODATA', 'ESERVFAIL']);

/**
 * Pure decision on an MX lookup result, split out so it can be unit tested without DNS.
 * A "null MX" (RFC 7505: a single record pointing at ".") explicitly says the domain
 * accepts no mail; Node reports its exchange as an empty string.
 */
export function classifyMxResult(
    result: { exchanges: string[] } | { errorCode: string }
): DomainVerdict {
    if ('errorCode' in result) {
        return NO_MAIL_CODES.has(result.errorCode) ? 'no_mail' : 'unknown';
    }
    const real = result.exchanges.filter(e => e.trim() !== '' && e.trim() !== '.');
    return real.length > 0 ? 'ok' : 'no_mail';
}

/**
 * Checks that an email's domain has a mail server. Used at registration and email change
 * to stop addresses like name@made-up-word.com before an account exists. It can't catch
 * disposable inboxes (they run real mail servers); email verification handles those.
 *
 * Fails open: if DNS itself is unreachable we allow the address rather than block a real
 * signup. Set SKIP_EMAIL_DOMAIN_CHECK=true to disable (CI uses example.com addresses,
 * which deliberately have a null MX).
 */
export async function emailDomainCanReceiveMail(email: string): Promise<boolean> {
    if (process.env.SKIP_EMAIL_DOMAIN_CHECK === 'true') return true;

    const domain = email.split('@').pop()?.trim().toLowerCase();
    if (!domain) return false;

    const resolver = new Resolver({ timeout: 3000, tries: 2 });
    let verdict: DomainVerdict;
    try {
        const records = await resolver.resolveMx(domain);
        verdict = classifyMxResult({ exchanges: records.map(r => r.exchange) });
    } catch (err: unknown) {
        const code = (err as { code?: string }).code ?? 'UNKNOWN';
        verdict = classifyMxResult({ errorCode: code });
        if (verdict === 'unknown') {
            console.warn(`Email domain check inconclusive (${code}), allowing signup`);
        }
    }
    return verdict !== 'no_mail';
}
