export interface GameRow {
  game_name: string;
  server: string;
  icon_name: string | null;
  daily_reset: string;
  timezone: string;
  completed: boolean;
}

export interface DigestRow {
  user_id: number;
  email: string;
  username: string;
  timezone: string;
  email_digest_hour: number;
  games: GameRow[];
}

export function buildDigestEmail(user: DigestRow): string {
  const incompleteGames = user.games.filter(g => !g.completed);
  const completedGames  = user.games.filter(g => g.completed);

  const gameRow = (game: GameRow) => `
    <tr>
      <td style="padding: 8px 0; border-bottom: 1px solid #27272a;">
        <span style="color: #ffffff; font-size: 14px;">${escapeHtml(game.game_name)}</span>
        <span style="color: #71717a; font-size: 12px; margin-left: 8px;">${escapeHtml(game.server)}</span>
      </td>
      <td style="padding: 8px 0; border-bottom: 1px solid #27272a; text-align: right;">
        <span style="color: #a1a1aa; font-size: 12px;">
          Resets at ${formatResetTime(game.daily_reset, game.timezone)}
        </span>
      </td>
    </tr>
  `;

  const frontendUrl = process.env.FRONTEND_URL ?? 'https://gachadailytracker.com';

  return `
    <!DOCTYPE html>
    <html>
    <body style="margin:0; padding:0; background:#09090b; font-family: sans-serif;">
      <div style="max-width:520px; margin:0 auto; padding:32px 16px;">

        <!-- Header -->
        <div style="margin-bottom:24px;">
          <h1 style="color:#c9a84c; font-size:20px; margin:0 0 4px;">GachaDailyTracker</h1>
          <p style="color:#71717a; font-size:13px; margin:0;">
            Daily reset summary for ${escapeHtml(user.username)}
          </p>
        </div>

        ${incompleteGames.length > 0 ? `
        <!-- Pending games -->
        <div style="background:#18181b; border:1px solid #27272a; border-radius:8px; padding:16px; margin-bottom:16px;">
          <p style="color:#c9a84c; font-size:12px; font-weight:600; text-transform:uppercase;
                     letter-spacing:0.05em; margin:0 0 12px;">
            Not yet completed (${incompleteGames.length})
          </p>
          <table style="width:100%; border-collapse:collapse;">
            ${incompleteGames.map(gameRow).join('')}
          </table>
        </div>
        ` : `
        <!-- All done state -->
        <div style="background:#18181b; border:1px solid #27272a; border-radius:8px;
                     padding:24px; margin-bottom:16px; text-align:center;">
          <p style="color:#c9a84c; font-size:16px; margin:0 0 4px;">All done!</p>
          <p style="color:#71717a; font-size:13px; margin:0;">
            You've completed all your games today.
          </p>
        </div>
        `}

        ${completedGames.length > 0 ? `
        <!-- Completed games -->
        <div style="background:#18181b; border:1px solid #27272a; border-radius:8px; padding:16px; margin-bottom:16px;">
          <p style="color:#52525b; font-size:12px; font-weight:600; text-transform:uppercase;
                     letter-spacing:0.05em; margin:0 0 12px;">
            &#10003; Completed (${completedGames.length})
          </p>
          <table style="width:100%; border-collapse:collapse;">
            ${completedGames.map(g => `
              <tr>
                <td style="padding:6px 0; border-bottom:1px solid #1f1f23;">
                  <span style="color:#52525b; font-size:13px; text-decoration:line-through;">
                    ${escapeHtml(g.game_name)}
                  </span>
                  <span style="color:#3f3f46; font-size:11px; margin-left:8px;">${escapeHtml(g.server)}</span>
                </td>
              </tr>
            `).join('')}
          </table>
        </div>
        ` : ''}

        <!-- CTA -->
        <div style="text-align:center; margin-bottom:24px;">
          <a href="${frontendUrl}/dashboard"
             style="display:inline-block; background:#c9a84c; color:#09090b;
                    padding:10px 24px; border-radius:6px; font-size:14px;
                    font-weight:600; text-decoration:none;">
            Open Dashboard
          </a>
        </div>

        <!-- Footer -->
        <div style="border-top:1px solid #27272a; padding-top:16px;">
          <p style="color:#3f3f46; font-size:11px; text-align:center; margin:0;">
            GachaDailyTracker &middot;
            <a href="${frontendUrl}/profile"
               style="color:#52525b; text-decoration:underline;">
              Manage email preferences
            </a>
          </p>
        </div>

      </div>
    </body>
    </html>
  `;
}

export function buildPasswordResetEmail(username: string, resetUrl: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <body style="margin:0; padding:0; background:#09090b; font-family: sans-serif;">
      <div style="max-width:520px; margin:0 auto; padding:32px 16px;">

        <!-- Header -->
        <div style="margin-bottom:24px;">
          <h1 style="color:#c9a84c; font-size:20px; margin:0 0 4px;">GachaDailyTracker</h1>
          <p style="color:#71717a; font-size:13px; margin:0;">Password reset request</p>
        </div>

        <!-- Body -->
        <div style="background:#18181b; border:1px solid #27272a; border-radius:8px; padding:24px; margin-bottom:16px;">
          <p style="color:#f0ede8; font-size:14px; margin:0 0 12px;">
            Hi ${escapeHtml(username)},
          </p>
          <p style="color:#a1a1aa; font-size:14px; margin:0 0 20px;">
            We received a request to reset your password. Click the button below to choose a new one.
            This link expires in 30 minutes.
          </p>
          <div style="text-align:center;">
            <a href="${resetUrl}"
               style="display:inline-block; background:#c9a84c; color:#09090b;
                      padding:10px 24px; border-radius:6px; font-size:14px;
                      font-weight:600; text-decoration:none;">
              Reset Password
            </a>
          </div>
          <p style="color:#52525b; font-size:12px; margin:20px 0 0; text-align:center;">
            If you didn't request this, you can safely ignore this email.
          </p>
        </div>

        <!-- Footer -->
        <div style="border-top:1px solid #27272a; padding-top:16px;">
          <p style="color:#3f3f46; font-size:11px; text-align:center; margin:0;">
            GachaDailyTracker &middot; This link expires in 30 minutes
          </p>
        </div>

      </div>
    </body>
    </html>
  `;
}

export function buildVerificationCodeEmail(username: string, code: string, expiresInMinutes: number): string {
  return `
    <!DOCTYPE html>
    <html>
    <body style="margin:0; padding:0; background:#09090b; font-family: sans-serif;">
      <div style="max-width:520px; margin:0 auto; padding:32px 16px;">

        <!-- Header -->
        <div style="margin-bottom:24px;">
          <h1 style="color:#c9a84c; font-size:20px; margin:0 0 4px;">GachaDailyTracker</h1>
          <p style="color:#71717a; font-size:13px; margin:0;">Verify your email</p>
        </div>

        <!-- Body -->
        <div style="background:#18181b; border:1px solid #27272a; border-radius:8px; padding:24px; margin-bottom:16px;">
          <p style="color:#f0ede8; font-size:14px; margin:0 0 12px;">
            Hi ${escapeHtml(username)},
          </p>
          <p style="color:#a1a1aa; font-size:14px; margin:0 0 20px;">
            Enter this code on GachaDailyTracker to confirm this is your email address.
          </p>
          <div style="text-align:center;">
            <span style="display:inline-block; background:#09090b; border:1px solid #c9a84c; color:#e8c86a;
                         padding:12px 24px; border-radius:6px; font-size:28px; font-weight:700;
                         letter-spacing:8px; font-family:monospace;">
              ${escapeHtml(code)}
            </span>
          </div>
          <p style="color:#52525b; font-size:12px; margin:20px 0 0; text-align:center;">
            If you didn't create an account, you can safely ignore this email.
          </p>
        </div>

        <!-- Footer -->
        <div style="border-top:1px solid #27272a; padding-top:16px;">
          <p style="color:#3f3f46; font-size:11px; text-align:center; margin:0;">
            GachaDailyTracker &middot; This code expires in ${expiresInMinutes} minutes
          </p>
        </div>

      </div>
    </body>
    </html>
  `;
}

function formatResetTime(dailyReset: string, timezone: string): string {
  const [hours, minutes] = dailyReset.split(':').map(Number);
  const date = new Date();
  date.setUTCHours(hours, minutes, 0, 0);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
    hour12: true,
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
