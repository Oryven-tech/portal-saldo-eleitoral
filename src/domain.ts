import { z } from 'zod';

export type Role = 'director' | 'staff';
export type ReviewStatus = 'draft' | 'pending' | 'approved' | 'changes_requested';
export type BookingStatus = 'reserved' | 'used' | 'cancelled';
export interface Staff {
  id: string;
  name: string;
  email: string;
  registration: string;
  active: boolean;
}
export interface Credit {
  id: string;
  staffId: string;
  days: number;
  reason: string;
  createdAt: string;
  actor: string;
  sourceId: string | null;
}
export interface Booking {
  id: string;
  staffId: string;
  dates: string[];
  status: BookingStatus;
  reason: string;
  createdAt: string;
  actor: string;
}
export interface Submission {
  id: string;
  staffId: string;
  activity: string;
  declaredDays: number;
  status: ReviewStatus;
  note: string;
  createdAt: string;
}
export interface Document {
  id: string;
  staffId: string;
  submissionId: string;
  name: string;
  path: string;
  size: number;
  hash: string;
  createdAt: string;
}
export interface Access {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
}
export interface Audit {
  id: string;
  action: string;
  actor: string;
  createdAt: string;
  detail: string;
}
export interface PortalData {
  schoolName: string;
  user: { name: string; email: string; role: Role; staffId: string | null };
  staff: Staff[];
  credits: Credit[];
  bookings: Booking[];
  submissions: Submission[];
  documents: Document[];
  access: Access[];
  audit: Audit[];
}
export interface EvidenceInput {
  id: string;
  name: string;
  registration: string;
  activity: string;
  days: number;
  files: File[];
}
export interface BookingInput {
  id: string;
  staffId: string;
  dates: string[];
  reason: string;
}

export function balance(data: Pick<PortalData, 'credits' | 'bookings'>, staffId?: string) {
  const matches = (item: { staffId: string }) => !staffId || item.staffId === staffId;
  const credits = data.credits.filter(matches).reduce((n, item) => n + item.days, 0);
  const used = data.bookings
    .filter(matches)
    .filter((b) => b.status === 'used')
    .reduce((n, b) => n + b.dates.length, 0);
  const reserved = data.bookings
    .filter(matches)
    .filter((b) => b.status === 'reserved')
    .reduce((n, b) => n + b.dates.length, 0);
  return {
    credits,
    used,
    reserved,
    remaining: credits - used,
    available: credits - used - reserved,
  };
}

export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T12:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, 'Data inválida.');
export const bookingSchema = z.object({
  id: z.uuid(),
  staffId: z.uuid(),
  dates: z
    .array(dateSchema)
    .min(1, 'Escolha uma data.')
    .max(60)
    .refine((d) => new Set(d).size === d.length, 'Há datas repetidas.'),
  reason: z.string().trim().min(3, 'Informe uma observação com pelo menos 3 caracteres.').max(500),
});
export const accessSchema = z.object({
  name: z.string().trim().min(3).max(120),
  email: z
    .email()
    .max(254)
    .transform((s) => s.trim().toLowerCase()),
  role: z.enum(['director', 'staff']),
});
export const evidenceSchema = z.object({
  name: z.string().trim().min(3).max(120),
  registration: z.string().trim().max(60),
  activity: z.string().trim().min(3).max(120),
  days: z.number().int().min(1).max(366),
});
export function validateBooking(data: PortalData, input: BookingInput) {
  bookingSchema.parse(input);
  const staff = data.staff.find((s) => s.id === input.staffId && s.active);
  if (!staff) throw new Error('Servidor não encontrado ou acesso desativado.');
  if (input.dates.length > balance(data, input.staffId).available)
    throw new Error('O saldo disponível não cobre estas datas.');
  if (
    data.bookings.some(
      (b) =>
        b.staffId === input.staffId &&
        b.status !== 'cancelled' &&
        b.dates.some((d) => input.dates.includes(d)),
    )
  )
    throw new Error('Já existe uma folga registrada para uma das datas.');
}
export const MAX_EVIDENCE_BYTES = 10_000_000;
export async function validateFiles(files: File[]) {
  if (!files.length || files.length > 3) throw new Error('Anexe de 1 a 3 PDFs.');
  if (files.reduce((n, f) => n + f.size, 0) > MAX_EVIDENCE_BYTES)
    throw new Error(
      'Os PDFs devem somar no máximo 10 MB. Procure a direção se precisar de uma exceção.',
    );
  for (const file of files) {
    if (!file.name.toLowerCase().endsWith('.pdf') || !file.size)
      throw new Error('Selecione arquivos PDF válidos.');
    const header = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer());
    const tail = new TextDecoder().decode(
      await file.slice(Math.max(0, file.size - 2048)).arrayBuffer(),
    );
    if (header !== '%PDF-' || !tail.includes('%%EOF'))
      throw new Error(`O arquivo “${file.name}” não parece ser um PDF completo.`);
  }
}
export function formatDate(value: string, options?: Intl.DateTimeFormatOptions) {
  // Calendar dates keep their day; timestamps follow the school's time zone.
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00Z` : value);
  return new Intl.DateTimeFormat('pt-BR', {
    ...(options ?? { day: '2-digit', month: 'short' }),
    timeZone: 'America/Sao_Paulo',
  }).format(date);
}
export function today() {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((value) => value.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .filter((_, i, a) => i === 0 || i === a.length - 1)
    .join('')
    .toUpperCase();
}
export function formatBytes(bytes: number) {
  if (bytes < 1_000) return `${bytes} B`;
  const divisor = bytes < 1_000_000 ? 1_000 : 1_000_000;
  return `${(bytes / divisor).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${divisor === 1_000 ? 'KB' : 'MB'}`;
}
export function errorMessage(error: unknown) {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? 'Confira os campos.';
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error && 'message' in error) return String(error.message);
  return 'Não foi possível concluir. Tente novamente.';
}
export function csv(data: PortalData) {
  const safe = (s: unknown) => {
    const value = String(s ?? '');
    return `"${(/^[\s]*[=+\-@]/.test(value) ? "'" : '') + value.replaceAll('"', '""')}"`;
  };
  return (
    '\uFEFF' +
    [
      ['Servidor', 'Matrícula', 'Créditos', 'Usufruídos', 'Reservados', 'Disponíveis'],
      ...data.staff.map((s) => {
        const b = balance(data, s.id);
        return [s.name, s.registration, b.credits, b.used, b.reserved, b.available];
      }),
    ]
      .map((row) => row.map(safe).join(';'))
      .join('\r\n')
  );
}

const timestamp = z.iso.datetime({ offset: true });
export const backupDataSchema: z.ZodType<PortalData> = z
  .object({
    schoolName: z.string().min(3).max(200),
    user: z.object({
      name: z.string().max(120),
      email: z.email(),
      role: z.enum(['director', 'staff']),
      staffId: z.uuid().nullable(),
    }),
    staff: z
      .array(
        z.object({
          id: z.uuid(),
          name: z.string().min(3).max(120),
          email: z.email(),
          registration: z.string().max(60),
          active: z.boolean(),
        }),
      )
      .max(200),
    credits: z
      .array(
        z.object({
          id: z.uuid(),
          staffId: z.uuid(),
          days: z
            .number()
            .int()
            .min(-366)
            .max(366)
            .refine((n) => n !== 0),
          reason: z.string().min(3).max(500),
          createdAt: timestamp,
          actor: z.string().max(120),
          sourceId: z.uuid().nullable(),
        }),
      )
      .max(20000),
    bookings: z
      .array(
        z.object({
          id: z.uuid(),
          staffId: z.uuid(),
          dates: z
            .array(dateSchema)
            .min(1)
            .max(60)
            .refine((d) => new Set(d).size === d.length),
          status: z.enum(['reserved', 'used', 'cancelled']),
          reason: z.string().min(3).max(500),
          createdAt: timestamp,
          actor: z.string().max(120),
        }),
      )
      .max(20000),
    submissions: z
      .array(
        z.object({
          id: z.uuid(),
          staffId: z.uuid(),
          activity: z.string().min(3).max(120),
          declaredDays: z.number().int().min(1).max(366),
          status: z.enum(['draft', 'pending', 'approved', 'changes_requested']),
          note: z.string().max(500),
          createdAt: timestamp,
        }),
      )
      .max(3000),
    documents: z
      .array(
        z.object({
          id: z.uuid(),
          staffId: z.uuid(),
          submissionId: z.uuid(),
          name: z.string().min(1).max(255),
          path: z.string().min(1).max(300),
          size: z.number().int().min(1).max(10000000),
          hash: z.string().regex(/^[a-f0-9]{64}$/),
          createdAt: timestamp,
        }),
      )
      .max(3000),
    access: z
      .array(
        z.object({
          id: z.uuid(),
          name: z.string().min(3).max(120),
          email: z.email(),
          role: z.enum(['director', 'staff']),
          active: z.boolean(),
        }),
      )
      .max(200),
    audit: z
      .array(
        z.object({
          id: z.uuid(),
          action: z.string().max(200),
          actor: z.string().max(120),
          createdAt: timestamp,
          detail: z.string().max(2000),
        }),
      )
      .max(30000),
  })
  .superRefine((data, context) => {
    const tables = [
      data.staff,
      data.credits,
      data.bookings,
      data.submissions,
      data.documents,
      data.access,
      data.audit,
    ];
    if (tables.some((rows) => new Set(rows.map((r) => r.id)).size !== rows.length))
      context.addIssue({ code: 'custom', message: 'Há identificadores repetidos.' });
    const staff = new Set(data.staff.map((s) => s.id));
    const submissions = new Map(data.submissions.map((s) => [s.id, s.staffId]));
    if (
      [...data.credits, ...data.bookings, ...data.submissions, ...data.documents].some(
        (row) => !staff.has(row.staffId),
      )
    )
      context.addIssue({ code: 'custom', message: 'Vínculo de servidor ausente.' });
    if (data.documents.some((d) => submissions.get(d.submissionId) !== d.staffId))
      context.addIssue({ code: 'custom', message: 'Documento sem vínculo consistente.' });
    if (data.credits.some((c) => c.sourceId && submissions.get(c.sourceId) !== c.staffId))
      context.addIssue({ code: 'custom', message: 'Crédito sem origem consistente.' });
  });
