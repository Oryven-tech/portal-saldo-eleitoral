import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PortalData, BookingInput, EvidenceInput, Document, Role } from './domain';
import { validateFiles } from './domain';
import { isPublishableKey } from './config';

export interface Snapshot {
  id: string;
  createdAt: string;
  data: PortalData;
}
export interface Repository {
  mode: 'demo' | 'supabase';
  load(): Promise<PortalData>;
  book(input: BookingInput): Promise<void>;
  reschedule(input: BookingInput): Promise<void>;
  adjust(id: string, staffId: string, days: number, reason: string): Promise<void>;
  changeBooking(id: string, status: 'used' | 'cancelled'): Promise<void>;
  review(id: string, days: number, note: string, approved: boolean): Promise<void>;
  addAccess(input: { name: string; email: string; role: Role }): Promise<void>;
  toggleAccess(id: string, active: boolean): Promise<void>;
  submit(input: EvidenceInput): Promise<void>;
  download(doc: Document): Promise<Blob>;
  snapshot(): Promise<Snapshot>;
}
const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
export const demoEnabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO === 'true';
export const supabase: SupabaseClient | null =
  url && key && isPublishableKey(key) && /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)
    ? createClient(url, key, {
        auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true },
      })
    : null;
export function createSupabaseRepository(client: SupabaseClient): Repository {
  const rpc = async <T>(name: string, args?: Record<string, unknown>): Promise<T> => {
    const { data, error } = await client.rpc(name, args);
    if (error) throw error;
    return data as T;
  };
  return {
    mode: 'supabase',
    load: () => rpc<PortalData>('portal_snapshot'),
    book: (input) =>
      rpc('book_leave', {
        p_id: input.id,
        p_staff_id: input.staffId,
        p_dates: input.dates,
        p_reason: input.reason,
      }),
    reschedule: (input) =>
      rpc('reschedule_booking', { p_id: input.id, p_dates: input.dates, p_reason: input.reason }),
    adjust: (id, staffId, days, reason) =>
      rpc('adjust_credit', { p_id: id, p_staff_id: staffId, p_days: days, p_reason: reason }),
    changeBooking: (id, status) => rpc('change_booking', { p_id: id, p_status: status }),
    review: (id, days, note, approved) =>
      rpc('review_submission', { p_id: id, p_days: days, p_note: note, p_approved: approved }),
    addAccess: (input) =>
      rpc('add_access', { p_name: input.name, p_email: input.email, p_role: input.role }),
    toggleAccess: (id, active) => rpc('toggle_access', { p_id: id, p_active: active }),
    async submit(input) {
      await validateFiles(input.files);
      const body = new FormData();
      body.set('id', input.id);
      body.set('name', input.name);
      body.set('registration', input.registration);
      body.set('activity', input.activity);
      body.set('days', String(input.days));
      input.files.forEach((file) => body.append('files', file));
      const { data, error } = await client.functions.invoke('submit-evidence', { body });
      if (error || !data?.ok)
        throw new Error(
          'O envio não foi confirmado. Verifique a conexão e tente novamente; se persistir, procure a direção.',
        );
    },
    async download(doc) {
      const { data, error } = await client.storage.from('evidence').download(doc.path);
      if (error || !data) throw error ?? new Error('Arquivo não encontrado.');
      return data;
    },
    snapshot: () => rpc<Snapshot>('create_backup_snapshot'),
  };
}
