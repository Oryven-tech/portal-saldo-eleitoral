export function isPublishableKey(key: string) {
  if (/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(key)) return true;
  try {
    const parts = key.split('.');
    if (parts.length !== 3) return false;
    const payload = JSON.parse(atob(parts[1].replaceAll('-', '+').replaceAll('_', '/')));
    return payload.role === 'anon';
  } catch {
    return false;
  }
}
