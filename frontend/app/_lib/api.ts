const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface Game {
  id: number;
  name: string;
  server: string;
  timezone: string;
  daily_reset: string;
  icon_name: string;
  last_verified: string;
}

export interface TrackedGame {
  user_game_id: number;
  game_id: number;
  name: string;
  server: string;
  timezone: string;
  daily_reset: string;
  icon_name: string;
  completed_today: boolean;
  added_at: string;
  display_order: number;
  custom_reminder_offset: number;
}

export interface NotificationPreferences {
  enabled: boolean;
  default_offset: number;
}

export interface GamesResponse {
  games: Game[];
  total: number;
  limit: number;
  offset: number;
}

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  timezone: string | null;
  role: number;
}

export interface GamesParams {
  search?: string;
  server?: string;
  limit?: number;
  offset?: number;
  sort_by?: string;
  order?: 'asc' | 'desc';
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error(body.error ?? res.statusText), { status: res.status, body });
  }
  return res.json();
}

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export async function fetchGames(params: GamesParams = {}): Promise<GamesResponse> {
  const q = new URLSearchParams();
  if (params.search) q.set('search', params.search);
  if (params.server) q.set('server', params.server);
  if (params.limit != null) q.set('limit', String(params.limit));
  if (params.offset != null) q.set('offset', String(params.offset));
  if (params.sort_by) q.set('sort_by', params.sort_by);
  if (params.order) q.set('order', params.order);
  return apiFetch<GamesResponse>(`/gdt/games?${q}`);
}

export async function fetchServers(): Promise<{ servers: { server: string; game_count: string }[] }> {
  return apiFetch('/gdt/games/servers/list');
}

export async function login(identifier: string, password: string): Promise<{ token: string; user: AuthUser }> {
  return apiFetch('/gdt/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier, password }),
  });
}

export async function register(
  username: string,
  email: string,
  password: string,
  confirmPassword: string,
): Promise<{ token: string; user: AuthUser }> {
  return apiFetch('/gdt/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, email, password, confirmPassword }),
  });
}

export async function fetchTrackerGames(token: string): Promise<{ games: TrackedGame[]; total: number; streak: number }> {
  return apiFetch('/gdt/tracker/games', { headers: authHeader(token) });
}

export async function checkStreak(token: string): Promise<{ streak: number; allComplete?: boolean; completed?: number; total?: number; message?: string }> {
  return apiFetch('/gdt/tracker/streak', { method: 'POST', headers: authHeader(token) });
}

export async function addTrackerGame(token: string, gameId: number): Promise<void> {
  await apiFetch(`/gdt/tracker/games/${gameId}`, { method: 'POST', headers: authHeader(token) });
}

export async function removeTrackerGame(token: string, gameId: number): Promise<void> {
  await apiFetch(`/gdt/tracker/games/${gameId}`, { method: 'DELETE', headers: authHeader(token) });
}

export async function markComplete(token: string, gameId: number): Promise<void> {
  await apiFetch(`/gdt/tracker/games/${gameId}/complete`, { method: 'POST', headers: authHeader(token) });
}

export async function unmarkComplete(token: string, gameId: number): Promise<void> {
  await apiFetch(`/gdt/tracker/games/${gameId}/complete`, { method: 'DELETE', headers: authHeader(token) });
}

export interface PopularGame {
  id: number;
  name: string;
  server: string;
  icon_name: string;
  add_count: number;
}

export async function fetchPopularGames(limit = 10): Promise<{ games: PopularGame[] }> {
  return apiFetch(`/gdt/games/popular?limit=${limit}`);
}

export async function updatePassword(
  token: string,
  identifier: string,
  currentPassword: string,
  newPassword: string,
  confirmNewPassword: string,
): Promise<void> {
  await apiFetch('/gdt/auth/update-password', {
    method: 'PATCH',
    headers: authHeader(token),
    body: JSON.stringify({ identifier, currentPassword, newPassword, confirmNewPassword }),
  });
}

export async function updateTimezone(
  token: string,
  timezone: string,
): Promise<{ message: string; user: AuthUser }> {
  return apiFetch('/gdt/auth/profile', {
    method: 'PUT',
    headers: authHeader(token),
    body: JSON.stringify({ timezone }),
  });
}

export async function updateEmail(
  token: string,
  newEmail: string,
  password: string,
): Promise<{ user: { id: number; username: string; email: string } }> {
  return apiFetch('/gdt/auth/update-email', {
    method: 'PATCH',
    headers: authHeader(token),
    body: JSON.stringify({ newEmail, password }),
  });
}

export async function deleteAccount(token: string, identifier: string, password: string): Promise<void> {
  await apiFetch('/gdt/auth/account', {
    method: 'DELETE',
    headers: authHeader(token),
    body: JSON.stringify({ identifier, password }),
  });
}

export async function bulkAddGames(
  token: string,
  gameIds: number[],
): Promise<{ added: number; already_tracked: number; invalid_ids: number[] }> {
  return apiFetch('/gdt/tracker/games/bulk', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ gameIds }),
  });
}

export async function saveGameOrder(
  token: string,
  orders: { game_id: number; order_index: number }[],
): Promise<void> {
  await apiFetch('/gdt/tracker/order', {
    method: 'PUT',
    headers: authHeader(token),
    body: JSON.stringify({ orders }),
  });
}

export async function updateGameReminderOffset(token: string, gameId: number, offset: number): Promise<void> {
  await apiFetch(`/gdt/tracker/games/${gameId}/reminder`, {
    method: 'PATCH',
    headers: authHeader(token),
    body: JSON.stringify({ offset }),
  });
}

export async function fetchVapidKey(): Promise<{ publicKey: string }> {
  return apiFetch('/gdt/notifications/vapid-key');
}

export async function subscribePush(token: string, subscription: PushSubscriptionJSON): Promise<void> {
  await apiFetch('/gdt/notifications/subscribe', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify(subscription),
  });
}

export async function unsubscribePush(token: string, endpoint: string): Promise<void> {
  await apiFetch('/gdt/notifications/unsubscribe', {
    method: 'DELETE',
    headers: authHeader(token),
    body: JSON.stringify({ endpoint }),
  });
}

export async function fetchNotificationPrefs(token: string): Promise<NotificationPreferences> {
  return apiFetch('/gdt/notifications/preferences', { headers: authHeader(token) });
}

export async function updateNotificationPrefs(token: string, default_offset: number): Promise<void> {
  await apiFetch('/gdt/notifications/preferences', {
    method: 'PATCH',
    headers: authHeader(token),
    body: JSON.stringify({ default_offset }),
  });
}

export async function applyDefaultReminder(token: string): Promise<{ offset: number; updated: number }> {
  return apiFetch('/gdt/notifications/apply-default', {
    method: 'POST',
    headers: authHeader(token),
  });
}

// ─── Admin ────────────────────────────────────────────────────────────────────

export interface AdminGame {
  id: number;
  name: string;
  server: string;
  timezone: string;
  daily_reset: string;
  icon_name: string | null;
  is_active: boolean;
  source: string;
  last_verified: string;
  tracked_by: number;
}

export interface GamePayload {
  name: string;
  server: string;
  timezone: string;
  daily_reset: string;
  icon_name?: string;
}

export async function fetchAdminGames(
  token: string,
  params: { search?: string; active?: boolean; limit?: number; offset?: number } = {},
): Promise<{ games: AdminGame[]; total: number; activeCount: number; last_synced_at: string | null }> {
  const q = new URLSearchParams();
  if (params.search) q.set('search', params.search);
  if (params.active !== undefined) q.set('active', String(params.active));
  if (params.limit != null) q.set('limit', String(params.limit));
  if (params.offset != null) q.set('offset', String(params.offset));
  return apiFetch(`/gdt/admin/games?${q}`, { headers: authHeader(token) });
}

export async function createAdminGame(token: string, data: GamePayload): Promise<{ game: AdminGame }> {
  return apiFetch('/gdt/admin/games', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify(data),
  });
}

export async function updateAdminGame(token: string, id: number, data: Partial<GamePayload>): Promise<{ game: AdminGame }> {
  return apiFetch(`/gdt/admin/games/${id}`, {
    method: 'PATCH',
    headers: authHeader(token),
    body: JSON.stringify(data),
  });
}

export async function softDeleteGame(token: string, id: number): Promise<void> {
  await apiFetch(`/gdt/admin/games/${id}`, { method: 'DELETE', headers: authHeader(token) });
}

export async function restoreGame(token: string, id: number): Promise<void> {
  await apiFetch(`/gdt/admin/games/${id}/restore`, { method: 'POST', headers: authHeader(token) });
}

export async function hardDeleteGame(token: string, id: number): Promise<void> {
  await apiFetch(`/gdt/admin/games/${id}/hard`, { method: 'DELETE', headers: authHeader(token) });
}

export async function importGames(
  token: string,
): Promise<{ message: string; total: number; added: number; updated: number; source: string; last_synced_at: string }> {
  return apiFetch('/gdt/admin/import/games', {
    method: 'POST',
    headers: authHeader(token),
  });
}

export async function patchIcons(
  token: string,
): Promise<{ message: string; missing_icon_name_count: number; missing_games: { id: number; name: string }[] }> {
  return apiFetch('/gdt/admin/import/icons/patch', {
    method: 'POST',
    headers: authHeader(token),
  });
}

export interface AdminUser {
  id: number;
  username: string;
  email: string;
  role: number;
  roleName: string;
  timezone: string;
  streak_count: number;
  created_at: string;
  updated_at: string;
}

export async function fetchAdminUsers(
  token: string,
  params: { limit?: number; offset?: number; role?: number } = {},
): Promise<{ users: AdminUser[]; total: number }> {
  const q = new URLSearchParams();
  if (params.limit != null) q.set('limit', String(params.limit));
  if (params.offset != null) q.set('offset', String(params.offset));
  if (params.role != null) q.set('role', String(params.role));
  return apiFetch(`/gdt/admin/users?${q}`, { headers: authHeader(token) });
}

export async function searchAdminUsers(
  token: string,
  query: string,
): Promise<{ users: AdminUser[]; total: number }> {
  return apiFetch(
    `/gdt/admin/users/search?q=${encodeURIComponent(query)}`,
    { headers: authHeader(token) },
  );
}

export async function updateUserRole(
  token: string,
  username: string,
  newRole: number,
  reason: string,
): Promise<void> {
  await apiFetch(`/gdt/admin/users/role/${encodeURIComponent(username)}`, {
    method: 'PATCH',
    headers: authHeader(token),
    body: JSON.stringify({ newRole, reason }),
  });
}

export async function uploadGameIcon(token: string, gameId: number, file: File): Promise<{ icon_name: string }> {
  const form = new FormData();
  form.append('icon', file);
  const res = await fetch(`${API}/gdt/admin/games/${gameId}/icon`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error(body.error ?? res.statusText), { status: res.status });
  }
  return res.json();
}

// ─── Submissions ──────────────────────────────────────────────────────────────

export interface TimezoneEntry {
  timezone: string;
  offset: string;
  label: string;
}

export async function fetchTimezones(): Promise<Record<string, TimezoneEntry[]>> {
  const res = await apiFetch<{ timezones: Record<string, TimezoneEntry[]> }>('/gdt/timezones');
  return res.timezones;
}

export interface GameSubmission {
  id: number;
  name: string;
  server: string;
  timezone: string;
  daily_reset: string;
  notes: string | null;
  status: 'pending' | 'approved' | 'rejected';
  submitter_role: number;
  submitter_role_name: string;
  reviewed_by_role: number | null;
  reviewed_by_role_name: string | null;
  review_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export async function submitGame(
  token: string,
  data: { name: string; server: string; timezone: string; daily_reset: string; notes?: string },
): Promise<{ message: string; submission: { id: number; name: string; server: string; status: string } }> {
  return apiFetch('/gdt/submissions', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify(data),
  });
}

export async function fetchAdminSubmissions(
  token: string,
  params: { status?: string; limit?: number; offset?: number } = {},
): Promise<{ submissions: GameSubmission[]; total: number; status_filter: string }> {
  const q = new URLSearchParams();
  if (params.status) q.set('status', params.status);
  if (params.limit != null) q.set('limit', String(params.limit));
  if (params.offset != null) q.set('offset', String(params.offset));
  return apiFetch(`/gdt/admin/submissions?${q}`, { headers: authHeader(token) });
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export type AnalyticsRangeDays = '7' | '30' | '90' | '365' | 'all';

export interface AnalyticsSummary {
  total_users: number;
  total_active_games: number;
  total_tracked_rows: number;
  total_completions: number;
  users_with_streak: number;
  avg_games_per_user: number;
}

export interface RoleCount {
  role: number;
  role_name: string;
  count: number;
}

export interface TopStreak {
  username: string;
  streak_count: number;
  games_tracked: number;
}

export interface TopGame {
  id: number;
  name: string;
  server: string;
  tracked_by: number;
}

export interface RegionPopularity {
  region: string;
  tracked_count: number;
  game_count: number;
}

export interface TimezoneCountry {
  country: string;
  count: number;
}

export interface TrendBucket {
  date: string;
  count: number;
  cumulative?: number;
}

export interface AnalyticsResponse {
  summary: AnalyticsSummary;
  role_distribution: RoleCount[];
  top_streaks: TopStreak[];
  top_games: TopGame[];
  region_popularity: RegionPopularity[];
  timezone_breakdown: TimezoneCountry[];
  signups_over_time: TrendBucket[];
  completions_over_time: TrendBucket[];
  range: { days: number | null; bucket: 'day' | 'week' | 'month' };
}

export async function fetchAdminAnalytics(
  token: string,
  days: AnalyticsRangeDays = '90',
): Promise<AnalyticsResponse> {
  return apiFetch(`/gdt/admin/analytics?days=${days}`, { headers: authHeader(token) });
}

// ─── Leaderboard ─────────────────────────────────────────────────────────────

export interface LeaderboardEntry {
  rank: number;
  username: string;
  streak: number;
  games_tracked: number;
  last_active: string;
}

export async function fetchLeaderboard(
  params: { limit?: number; offset?: number } = {},
): Promise<{ enabled: boolean; leaderboard: LeaderboardEntry[]; total: number }> {
  const q = new URLSearchParams();
  if (params.limit != null) q.set('limit', String(params.limit));
  if (params.offset != null) q.set('offset', String(params.offset));
  return apiFetch(`/gdt/leaderboard?${q}`);
}

export async function fetchLeaderboardStatus(): Promise<{ enabled: boolean }> {
  return apiFetch('/gdt/leaderboard/status');
}

export async function fetchLeaderboardVisibility(token: string): Promise<{ hidden: boolean }> {
  return apiFetch('/gdt/leaderboard/visibility', { headers: authHeader(token) });
}

export async function updateLeaderboardVisibility(
  token: string,
  hidden: boolean,
): Promise<{ message: string; hidden: boolean }> {
  return apiFetch('/gdt/leaderboard/visibility', {
    method: 'PATCH',
    headers: authHeader(token),
    body: JSON.stringify({ hidden }),
  });
}

// ─── Admin Settings ───────────────────────────────────────────────────────────

export async function fetchAdminSettings(
  token: string,
): Promise<{ settings: Record<string, string> }> {
  return apiFetch('/gdt/admin/settings', { headers: authHeader(token) });
}

export async function updateLeaderboardEnabled(
  token: string,
  enabled: boolean,
): Promise<{ message: string; leaderboard_enabled: boolean }> {
  return apiFetch('/gdt/admin/settings/leaderboard', {
    method: 'PATCH',
    headers: authHeader(token),
    body: JSON.stringify({ enabled }),
  });
}

// ─── Password Reset ───────────────────────────────────────────────────────────

export async function forgotPassword(email: string): Promise<{ message: string }> {
  return apiFetch('/gdt/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function validateResetToken(token: string): Promise<{ valid: boolean; error?: string }> {
  return apiFetch(`/gdt/auth/reset-password/${encodeURIComponent(token)}`);
}

export async function resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
  return apiFetch('/gdt/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, newPassword }),
  });
}

// ─── Email Preferences ────────────────────────────────────────────────────────

export interface EmailPreferences {
  email_digest_enabled: boolean;
  email_digest_hour: number;
}

export async function fetchEmailPreferences(token: string): Promise<EmailPreferences> {
  return apiFetch('/gdt/notifications/email-preferences', { headers: authHeader(token) });
}

export async function updateEmailPreferences(
  token: string,
  data: Partial<{ email_digest_enabled: boolean; email_digest_hour: number }>,
): Promise<{ message: string }> {
  return apiFetch('/gdt/notifications/email-preferences', {
    method: 'PATCH',
    headers: authHeader(token),
    body: JSON.stringify(data),
  });
}

// ─── Schedule ─────────────────────────────────────────────────────────────────

export interface Schedule {
  id: number;
  game_id: number;
  days_of_week: number[];
  window_start: string;
  window_end: string;
  hook_notifications: boolean;
  created_at: string;
  game_name: string;
  server: string;
  icon_name: string | null;
  game_timezone: string;
  daily_reset: string;
}

export async function fetchSchedules(token: string): Promise<{ schedules: Schedule[] }> {
  return apiFetch('/gdt/schedule', { headers: authHeader(token) });
}

export async function saveSchedule(
  token: string,
  data: {
    game_id: number;
    days_of_week: number[];
    window_start: string;
    window_end: string;
    hook_notifications: boolean;
  },
): Promise<{ message: string }> {
  return apiFetch('/gdt/schedule', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify(data),
  });
}

export async function deleteSchedule(token: string, gameId: number): Promise<{ message: string }> {
  return apiFetch(`/gdt/schedule/${gameId}`, {
    method: 'DELETE',
    headers: authHeader(token),
  });
}

export async function fetchTodaySchedule(
  token: string,
): Promise<{ schedules: Schedule[]; day_of_week: number }> {
  return apiFetch('/gdt/schedule/today', { headers: authHeader(token) });
}

export async function fetchWeekSchedule(
  token: string,
): Promise<{ week: Record<number, Schedule[]> }> {
  return apiFetch('/gdt/schedule/week', { headers: authHeader(token) });
}

export async function reviewSubmission(
  token: string,
  id: number,
  action: 'approve' | 'reject',
  review_notes?: string,
): Promise<{ message: string }> {
  return apiFetch(`/gdt/admin/submissions/${id}`, {
    method: 'PATCH',
    headers: authHeader(token),
    body: JSON.stringify({ action, review_notes }),
  });
}
