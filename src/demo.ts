import type { PortalData, Role, BookingInput, EvidenceInput } from './domain';
import {
  accessSchema,
  evidenceSchema,
  validateBooking,
  validateFiles,
  balance,
  today,
  validateUsedCorrection,
  emailChangeSchema,
} from './domain';
import type { Repository } from './repository';
import { SCHOOL_NAME } from './school';
import { createDemoEvidence, DEMO_EVIDENCE_HASH, DEMO_EVIDENCE_SIZE } from './demo-evidence';

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const names = [
  'Ana Oliveira',
  'Carlos Mendes',
  'Beatriz Souza',
  'Marcos Lima',
  'Helena Costa',
  'Paulo Santos',
  'Luiza Ferreira',
  'Rafael Alves',
];
const stamp = '2026-10-16T12:00:00Z';
function seed(role: Role): PortalData {
  const staff = names.map((name, i) => ({
    id: id(i + 1),
    name,
    email: `servidor${i + 1}@example.com`,
    registration: `2026-${101 + i}`,
    active: true,
  }));
  const data: PortalData = {
    schoolName: SCHOOL_NAME,
    user: {
      name: role === 'director' ? 'Maria, direção' : names[0],
      email: role === 'director' ? 'direcao@example.com' : staff[0].email,
      role,
      staffId: role === 'staff' ? staff[0].id : null,
    },
    staff,
    credits: staff.map((s, i) => ({
      id: id(100 + i),
      staffId: s.id,
      days: [8, 6, 10, 6, 8, 6, 4, 8][i],
      reason: 'Crédito conferido · serviço eleitoral',
      createdAt: stamp,
      actor: 'Direção',
      sourceId: null,
    })),
    bookings: [
      {
        id: id(201),
        staffId: id(1),
        dates: ['2026-10-05', '2026-10-06'],
        status: 'used',
        reason: 'Folgas usufruídas',
        createdAt: stamp,
        actor: 'Direção',
      },
      {
        id: id(202),
        staffId: id(2),
        dates: ['2026-10-19'],
        status: 'reserved',
        reason: 'Agendamento confirmado',
        createdAt: stamp,
        actor: 'Direção',
      },
      {
        id: id(203),
        staffId: id(5),
        dates: ['2026-10-20', '2026-10-21'],
        status: 'reserved',
        reason: 'Agendamento confirmado',
        createdAt: stamp,
        actor: 'Direção',
      },
      {
        id: id(204),
        staffId: id(1),
        dates: ['2026-10-23'],
        status: 'reserved',
        reason: 'Agendamento confirmado',
        createdAt: stamp,
        actor: 'Direção',
      },
    ],
    submissions: [1, 3, 6].map((n, i) => ({
      id: id(300 + i),
      staffId: id(n),
      activity: 'Treinamento e 1º turno · 2026',
      declaredDays: 2,
      status: 'pending',
      note: '',
      createdAt: stamp,
    })),
    documents: [1, 3, 6].map((n, i) => ({
      id: id(400 + i),
      staffId: id(n),
      submissionId: id(300 + i),
      name: 'EXEMPLO-FICTICIO-3-paginas.pdf',
      path: id(400 + i),
      size: DEMO_EVIDENCE_SIZE,
      hash: DEMO_EVIDENCE_HASH,
      createdAt: stamp,
    })),
    access: staff.map((s) => ({
      id: s.id,
      name: s.name,
      email: s.email,
      role: 'staff',
      active: true,
    })),
    audit: [
      {
        id: id(500),
        action: 'Folga agendada',
        actor: 'Direção',
        createdAt: stamp,
        detail: 'Ana Oliveira · 23 de outubro',
      },
      {
        id: id(501),
        action: 'Comprovantes recebidos',
        actor: 'Servidor',
        createdAt: stamp,
        detail: 'Aguardando conferência da direção',
      },
    ],
  };
  return data;
}
export function createDemoRepository(role: Role): Repository {
  const state = seed(role);
  const files = new Map<string, Blob>();
  const example = createDemoEvidence();
  for (const document of state.documents) files.set(document.id, example);
  const operations = new Map<string, string>();
  const admin = () => {
    if (role !== 'director') throw new Error('Ação restrita à direção.');
  };
  const audit = (action: string, detail: string) =>
    state.audit.unshift({
      id: crypto.randomUUID(),
      action,
      detail,
      actor: state.user.name,
      createdAt: new Date().toISOString(),
    });
  const load = async () => {
    const result = structuredClone(state);
    if (role === 'staff') {
      const own = (item: { staffId: string }) => item.staffId === result.user.staffId;
      result.staff = result.staff.filter((s) => s.id === result.user.staffId);
      result.credits = result.credits.filter(own);
      result.bookings = result.bookings.filter(own);
      result.submissions = result.submissions.filter(own);
      result.documents = result.documents.filter(own);
      result.access = [];
      result.audit = [];
    }
    return result;
  };
  return {
    mode: 'demo',
    load,
    async correctUsed(input) {
      admin();
      const signature = JSON.stringify(input);
      if (operations.has(input.id)) {
        if (operations.get(input.id) !== signature)
          throw new Error('Operação repetida com dados diferentes.');
        return;
      }
      validateUsedCorrection(state, input);
      const original = state.bookings.find((b) => b.id === input.bookingId)!;
      original.status = 'cancelled';
      if (input.dates.length)
        state.bookings.push({
          id: crypto.randomUUID(),
          staffId: original.staffId,
          dates: [...input.dates].sort(),
          status: 'used',
          reason: input.reason.trim(),
          actor: state.user.name,
          createdAt: new Date().toISOString(),
        });
      operations.set(input.id, signature);
      audit(
        'Uso de folga corrigido',
        `Original ${original.id} [${original.dates.join(',')}] estornado. Novas datas [${input.dates.join(',')}]. Motivo: ${input.reason.trim()}`,
      );
    },
    async changeEmail(input) {
      admin();
      const parsed = emailChangeSchema.parse(input);
      const signature = JSON.stringify(parsed);
      if (operations.has(input.id)) {
        if (operations.get(input.id) !== signature)
          throw new Error('Operação repetida com dados diferentes.');
        return;
      }
      const access = state.access.find((a) => a.id === input.accessId && a.role === 'staff');
      if (!access || access.email !== input.expectedEmail)
        throw new Error('O acesso mudou. Atualize a lista.');
      if (
        access.email === parsed.email ||
        state.access.some((a) => a.id !== access.id && a.email === parsed.email)
      )
        throw new Error('E-mail igual ao atual ou já cadastrado.');
      const staff = state.staff.find((s) => s.email === access.email)!;
      staff.email = parsed.email;
      access.email = parsed.email;
      operations.set(input.id, signature);
      audit(
        'E-mail do servidor alterado',
        `${input.expectedEmail} → ${parsed.email}. Motivo: ${parsed.reason}. Saldo e documentos preservados.`,
      );
    },
    async book(input: BookingInput) {
      admin();
      if (state.bookings.some((b) => b.id === input.id)) return;
      validateBooking(state, input);
      state.bookings.push({
        ...input,
        status: 'reserved',
        createdAt: new Date().toISOString(),
        actor: state.user.name,
      });
      audit('Folga agendada', `${input.dates.length} dia(s) reservado(s)`);
    },
    async reschedule(input) {
      admin();
      const item = state.bookings.find((b) => b.id === input.id);
      if (!item || item.status !== 'reserved')
        throw new Error('Somente agendamentos podem ser alterados.');
      validateBooking(
        { ...state, bookings: state.bookings.filter((b) => b.id !== item.id) },
        input,
      );
      item.dates = input.dates;
      item.reason = input.reason;
      audit('Agendamento alterado', input.reason);
    },
    async adjust(operationId, staffId, days, reason) {
      admin();
      if (state.credits.some((c) => c.id === operationId)) return;
      if (!Number.isInteger(days) || days === 0 || Math.abs(days) > 366 || reason.trim().length < 3)
        throw new Error('Informe dias e justificativa válidos.');
      if (balance(state, staffId).available + days < 0)
        throw new Error('O ajuste comprometeria dias já usados ou reservados.');
      state.credits.push({
        id: operationId,
        staffId,
        days,
        reason,
        sourceId: null,
        actor: state.user.name,
        createdAt: new Date().toISOString(),
      });
      audit('Ajuste de crédito', reason);
    },
    async changeBooking(bookingId, status) {
      admin();
      const item = state.bookings.find((b) => b.id === bookingId);
      if (!item) throw new Error('Registro não encontrado.');
      if (item.status === status) return;
      if (item.status !== 'reserved')
        throw new Error(
          'Este lançamento já foi concluído. Procure o responsável para uma correção auditada.',
        );
      if (status === 'used' && item.dates.some((d) => d > today()))
        throw new Error('Não confirme uso de uma folga futura.');
      item.status = status;
      audit(status === 'used' ? 'Folga usufruída' : 'Agendamento cancelado', item.reason);
    },
    async review(submissionId, days, note, approved) {
      admin();
      const item = state.submissions.find((s) => s.id === submissionId);
      if (!item || item.status !== 'pending') throw new Error('Este envio já foi analisado.');
      if (approved && (!Number.isInteger(days) || days < 1 || days > 366))
        throw new Error('Informe a quantidade de dias aprovada.');
      if (note.trim().length < 3) throw new Error('Registre o motivo da decisão.');
      item.status = approved ? 'approved' : 'changes_requested';
      item.note = note.trim();
      if (approved)
        state.credits.push({
          id: crypto.randomUUID(),
          staffId: item.staffId,
          days,
          reason: note,
          actor: state.user.name,
          sourceId: item.id,
          createdAt: new Date().toISOString(),
        });
      audit(approved ? 'Crédito aprovado' : 'Correção solicitada', note);
    },
    async addAccess(input) {
      admin();
      const entry = accessSchema.parse(input);
      if (entry.role !== 'staff')
        throw new Error('Novos gestores exigem configuração técnica explícita.');
      if (state.access.some((a) => a.email === entry.email))
        throw new Error('Este e-mail já está na lista.');
      const staffId = crypto.randomUUID();
      state.access.push({ ...entry, id: staffId, active: true });
      state.staff.push({
        id: staffId,
        name: entry.name,
        email: entry.email,
        registration: '',
        active: true,
      });
      audit('Acesso autorizado', entry.name);
    },
    async toggleAccess(accessId, active) {
      admin();
      const entry = state.access.find((a) => a.id === accessId);
      if (!entry) throw new Error('Acesso não encontrado.');
      if (entry.role !== 'staff') throw new Error('Este acesso exige configuração técnica.');
      if (entry.active === active) return;
      entry.active = active;
      const person = state.staff.find((s) => s.email === entry.email);
      if (person) person.active = active;
      audit(active ? 'Acesso reativado' : 'Acesso desativado', entry.name);
    },
    async submit(input: EvidenceInput) {
      if (role !== 'staff') throw new Error('Entre como servidor para enviar comprovantes.');
      evidenceSchema.parse(input);
      await validateFiles(input.files);
      if (state.submissions.some((s) => s.id === input.id)) return;
      const ownId = state.user.staffId!;
      const person = state.staff.find((s) => s.id === ownId)!;
      person.name = input.name;
      person.registration = input.registration;
      state.submissions.push({
        id: input.id,
        staffId: ownId,
        activity: input.activity,
        declaredDays: input.days,
        status: 'pending',
        note: '',
        createdAt: new Date().toISOString(),
      });
      for (const file of input.files) {
        const docId = crypto.randomUUID();
        const bytes = await file.arrayBuffer();
        const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        files.set(docId, file);
        state.documents.push({
          id: docId,
          staffId: ownId,
          submissionId: input.id,
          name: file.name,
          path: docId,
          size: file.size,
          hash,
          createdAt: new Date().toISOString(),
        });
      }
    },
    async download(doc) {
      if (
        !state.documents.some(
          (entry) =>
            entry.id === doc.id && (role === 'director' || entry.staffId === state.user.staffId),
        )
      )
        throw new Error('Documento não disponível para este acesso.');
      const blob = files.get(doc.id);
      if (!blob) throw new Error('Este exemplo não possui um PDF real anexado.');
      return blob;
    },
    async snapshot() {
      admin();
      return { id: crypto.randomUUID(), createdAt: new Date().toISOString(), data: await load() };
    },
  };
}
