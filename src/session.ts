import type { Repository } from './repository';

export interface PortalConnection {
  identity: string;
  repo: Repository;
}
type IdentitySession = { user: { id: string } } | null;

/** One repository per identity; a stale initial session cannot undo a newer event. */
export function createSessionBinding(
  create: () => Repository,
  publish: (connection: PortalConnection | null) => void,
) {
  let live = true;
  let revision = 0;
  let identity: string | null | undefined;
  const apply = (session: IdentitySession) => {
    if (!live) return false;
    revision++;
    const next = session?.user.id ?? null;
    if (next !== identity) {
      identity = next;
      publish(next ? { identity: next, repo: create() } : null);
    }
    return true;
  };
  return {
    apply,
    initial() {
      const initialRevision = revision;
      const current = () => live && revision === initialRevision;
      return { current, apply: (session: IdentitySession) => current() && apply(session) };
    },
    close() {
      live = false;
      revision++;
    },
  };
}

/** Shared by initial loads, manual reloads, actions and focus revalidation. */
export function createRequestGate() {
  let live = false;
  let revision = 0;
  return {
    open() {
      live = true;
      revision++;
    },
    close() {
      live = false;
      revision++;
    },
    invalidate() {
      revision++;
    },
    begin() {
      const request = ++revision;
      return () => live && request === revision;
    },
  };
}
export function isAccessDenied(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    (('code' in error &&
      ['42501', 'PGRST301', 'PGRST302', 'PGRST303'].includes(String(error.code))) ||
      ('status' in error && [401, 403].includes(Number(error.status))))
  );
}
