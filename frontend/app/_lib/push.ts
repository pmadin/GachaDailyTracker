// The backend can still report push as enabled after this browser dropped its subscription
// (or when the user is on a different device), so confirm the browser actually holds one.
export async function hasBrowserPushSubscription(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    return !!sub;
  } catch {
    return false;
  }
}
