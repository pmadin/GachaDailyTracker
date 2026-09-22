/**
 * Masks the local part of an email address for admin-facing responses, keeping the
 * domain visible (useful for spotting patterns like disposable-mail domains).
 *
 * Applied server-side, not just in the UI — the point is that a compromised admin
 * token used directly against the API never gets a raw, bulk-scrapable email list.
 * The owner still has full DB access for legitimate lookups.
 *
 * "begino4315@gzeos.com" -> "b********5@gzeos.com"
 */
export function maskEmail(email: string): string {
    const at = email.lastIndexOf('@');
    if (at <= 0) return '***'; // malformed input — never echo it back unmasked

    const local = email.slice(0, at);
    const domain = email.slice(at); // includes the leading '@'

    if (local.length === 1) return `*${domain}`;
    if (local.length === 2) return `${local[0]}*${domain}`;
    return `${local[0]}${'*'.repeat(local.length - 2)}${local[local.length - 1]}${domain}`;
}
