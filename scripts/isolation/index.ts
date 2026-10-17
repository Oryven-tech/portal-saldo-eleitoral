// Opt-in test artifact. Never included in the normal production build.
import { createClient } from '@supabase/supabase-js';
import { supabase } from '../../src/repository';
import type { PortalData } from '../../src/domain';
import './styles.css';

type Target = { id: string; name: string; document: PortalData['documents'][number] };
const key = 'pse-synthetic-isolation-v1';
const result = document.querySelector<HTMLPreElement>('#result')!;
const buttons = [...document.querySelectorAll<HTMLButtonElement>('button')];
const lines: string[] = [];
function assert(ok: unknown, label: string): asserts ok {
  if (!ok) throw new Error(`FALHOU: ${label}`);
  lines.push(`PASSOU: ${label}`);
  result.textContent = lines.join('\n');
}
async function run(task: () => Promise<void>) {
  buttons.forEach((button) => (button.disabled = true));
  lines.length = 0;
  result.textContent = 'Executando chamadas HTTPS ao Supabase…';
  try {
    if (!supabase) throw new Error('Projeto não configurado.');
    await task();
    lines.push(`Concluído: ${new Date().toISOString()}`);
  } catch (error) {
    // Do not print service responses, sessions, tokens or returned record contents.
    lines.push(error instanceof Error ? error.message : 'Ensaio interrompido.');
  } finally {
    result.textContent = lines.join('\n');
    buttons.forEach((button) => (button.disabled = false));
  }
}
async function snapshot(): Promise<PortalData> {
  const { data, error } = await supabase!.rpc('portal_snapshot');
  assert(!error && data, 'sessão atual aceita pela API');
  return data as PortalData;
}
async function hash(blob: Blob) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('');
}
document.querySelector('#prepare')!.addEventListener(
  'click',
  () =>
    void run(async () => {
      const data = await snapshot();
      assert(data.user.role === 'director', 'preparação restrita à direção');
      const expected = [
        ['TESTE-001', 'Servidor de teste'],
        ['TESTE-002', 'Servidor de teste 2'],
      ];
      assert(data.staff.length === 2, 'base contém somente os dois servidores do ensaio');
      const targets: Target[] = expected.map(([registration, name]) => {
        const staff = data.staff.find(
          (item) => item.registration === registration && item.name === name,
        );
        assert(staff, `cadastro fictício ${registration} localizado`);
        const doc = data.documents.find((item) => item.staffId === staff.id);
        assert(
          doc && doc.size <= 2000 && doc.name.startsWith('comprovante-sintetico-'),
          `PDF sintético de ${name}`,
        );
        return { id: staff.id, name, document: doc };
      });
      // Only synthetic IDs and document metadata; no session or credentials are copied.
      sessionStorage.setItem(key, JSON.stringify(targets));
      lines.push(
        'Referências preparadas nesta aba. Troque para cada servidor no portal e volte a esta página.',
      );
    }),
);
document.querySelector('#verify')!.addEventListener(
  'click',
  () =>
    void run(async () => {
      const data = await snapshot();
      const targets = JSON.parse(sessionStorage.getItem(key) ?? 'null') as Target[] | null;
      assert(targets?.length === 2, 'referências sintéticas preparadas pela direção');
      assert(data.user.role === 'staff', 'sessão é de servidor');
      const own = targets.find((item) => item.id === data.user.staffId);
      const other = targets.find((item) => item.id !== data.user.staffId);
      assert(own && other, 'identidade corresponde a um dos dois servidores fictícios');
      lines.push(`Conta verificada: ${own.name}`);
      assert(
        data.staff.length === 1 && data.staff[0].id === own.id,
        'snapshot contém somente o próprio servidor',
      );
      for (const field of ['credits', 'bookings', 'submissions', 'documents'] as const) {
        assert(
          data[field].every((item) => item.staffId === own.id),
          `snapshot sem ${field} do outro servidor`,
        );
      }
      assert(
        data.documents.some((item) => item.id === own.document.id),
        'documento próprio presente no snapshot',
      );
      assert(
        data.access.length === 0 && data.audit.length === 0,
        'snapshot não entrega lista de acessos ou auditoria administrativa',
      );
      for (const table of [
        'staff_members',
        'documents',
        'credit_entries',
        'submissions',
        'leave_bookings',
      ]) {
        const column = table === 'staff_members' ? 'id' : 'staff_id';
        const { data: rows, error } = await supabase!.from(table).select('id').eq(column, other.id);
        assert(
          !error && rows?.length === 0,
          `SELECT direto de ${table} do outro servidor retorna zero linhas`,
        );
      }
      const { data: file, error: ownError } = await supabase!.storage
        .from('evidence')
        .download(own.document.path);
      assert(
        !ownError && file && file.size === own.document.size,
        'download privado próprio funciona',
      );
      assert((await hash(file)) === own.document.hash, 'SHA-256 do PDF próprio confere');
      const foreign = await supabase!.storage.from('evidence').download(other.document.path);
      assert(
        !foreign.data && foreign.error && [400, 403, 404].includes(Number(foreign.error.status)),
        'download do PDF conhecido do outro servidor é recusado',
      );
      const administrative = await supabase!.rpc('adjust_credit', {
        p_id: crypto.randomUUID(),
        p_staff_id: own.id,
        p_days: 0,
        p_reason: 'ENSAIO SINTÉTICO: zero dias, chamada deve ser recusada antes da validação.',
      });
      assert(
        administrative.error?.code === '42501' &&
          administrative.error.message === 'Ação restrita à direção.',
        'RPC administrativa recusa o servidor por permissão',
      );

      const anonymous = createClient(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        },
      );
      const anonSnapshot = await anonymous.rpc('portal_snapshot');
      assert(anonSnapshot.error?.code === '42501', 'snapshot anônimo recusado por permissão');
      const anonRows = await anonymous.from('staff_members').select('id');
      assert(
        !anonRows.data?.length && anonRows.error?.code === '42501',
        'SELECT anônimo de servidores recusado',
      );
      const anonFile = await anonymous.storage.from('evidence').download(own.document.path);
      assert(
        !anonFile.data && anonFile.error && [400, 403, 404].includes(Number(anonFile.error.status)),
        'download sem sessão do PDF conhecido é recusado',
      );
    }),
);
document.querySelector('#clear')!.addEventListener('click', () => {
  sessionStorage.removeItem(key);
  result.textContent = 'Referências locais removidas. A sessão de login não foi alterada.';
});
