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
  // Stable functional identity; older v1 backups omitted this association.
  staffId?: string | null;
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
export interface UsedCorrectionInput {
  id: string;
  bookingId: string;
  dates: string[];
  reason: string;
}
export interface EmailChangeInput {
  id: string;
  accessId: string;
  expectedEmail: string;
  email: string;
  reason: string;
}
export const STAFF_EMAIL_DOMAIN = 'educacao.mg.gov.br';
export const staffEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email().max(254))
  .refine(
    (email) => email.endsWith(`@${STAFF_EMAIL_DOMAIN}`),
    'Use o e-mail individual @educacao.mg.gov.br.',
  );

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
    if (value < '0001-01-01') return false;
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
  email: staffEmailSchema,
  role: z.enum(['director', 'staff']),
});
export const emailChangeSchema = z.object({
  id: z.uuid(),
  accessId: z.uuid(),
  expectedEmail: z.email(),
  email: staffEmailSchema,
  reason: z.string().trim().min(10).max(500),
});
export const usedCorrectionSchema = z.object({
  id: z.uuid(),
  bookingId: z.uuid(),
  dates: z
    .array(dateSchema)
    .max(60)
    .refine((d) => new Set(d).size === d.length, 'Há datas repetidas.')
    .refine((d) => d.every((date) => date <= today()), 'Não registre uso de uma folga futura.'),
  reason: z.string().trim().min(10, 'Explique a correção com pelo menos 10 caracteres.').max(500),
});
export function validateUsedCorrection(data: PortalData, input: UsedCorrectionInput) {
  usedCorrectionSchema.parse(input);
  const original = data.bookings.find((b) => b.id === input.bookingId && b.status === 'used');
  if (!original) throw new Error('A folga mudou. Atualize a lista.');
  if (balance(data, original.staffId).available + original.dates.length < input.dates.length)
    throw new Error('Saldo disponível insuficiente.');
  if (
    data.bookings.some(
      (b) =>
        b.id !== original.id &&
        b.staffId === original.staffId &&
        b.status !== 'cancelled' &&
        b.dates.some((d) => input.dates.includes(d)),
    )
  )
    throw new Error('Já existe folga em uma dessas datas.');
}
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
// PostgreSQL UUID identifiers are opaque 128-bit values, not restricted to RFC
// version/variant bits. Keep every canonical database ID recoverable.
export const recordIdSchema = z.guid();
// PostgreSQL length(text) counts Unicode code points; JS string.length counts
// UTF-16 units. Backup limits must accept the same text the database accepts.
const databaseText = (max: number, min = 0) =>
  z.string().refine((value) => {
    if (value.length > max * 2) return false;
    const length = [...value].length;
    return length >= min && length <= max;
  }, `Texto deve ter entre ${min} e ${max} caracteres.`);
export const backupDataSchema: z.ZodType<PortalData> = z
  .object({
    schoolName: databaseText(200, 3),
    user: z.object({
      name: databaseText(120),
      email: z.email(),
      role: z.enum(['director', 'staff']),
      staffId: recordIdSchema.nullable(),
    }),
    staff: z
      .array(
        z.object({
          id: recordIdSchema,
          name: databaseText(120, 3),
          email: z.email(),
          registration: databaseText(60),
          active: z.boolean(),
        }),
      )
      .max(200),
    credits: z
      .array(
        z.object({
          id: recordIdSchema,
          staffId: recordIdSchema,
          days: z
            .number()
            .int()
            .min(-366)
            .max(366)
            .refine((n) => n !== 0),
          reason: databaseText(500, 3),
          createdAt: timestamp,
          actor: databaseText(120),
          sourceId: recordIdSchema.nullable(),
        }),
      )
      .max(20000),
    bookings: z
      .array(
        z.object({
          id: recordIdSchema,
          staffId: recordIdSchema,
          dates: z
            .array(dateSchema)
            .min(1)
            .max(60)
            .refine((d) => new Set(d).size === d.length),
          status: z.enum(['reserved', 'used', 'cancelled']),
          reason: databaseText(500, 3),
          createdAt: timestamp,
          actor: databaseText(120),
        }),
      )
      .max(20000),
    submissions: z
      .array(
        z.object({
          id: recordIdSchema,
          staffId: recordIdSchema,
          activity: databaseText(120, 3),
          declaredDays: z.number().int().min(1).max(366),
          status: z.enum(['draft', 'pending', 'approved', 'changes_requested']),
          note: databaseText(500),
          createdAt: timestamp,
        }),
      )
      .max(3000),
    documents: z
      .array(
        z.object({
          id: recordIdSchema,
          staffId: recordIdSchema,
          submissionId: recordIdSchema,
          name: databaseText(255, 1),
          path: databaseText(300, 1),
          size: z.number().int().min(1).max(10000000),
          hash: z.string().regex(/^[a-f0-9]{64}$/),
          createdAt: timestamp,
        }),
      )
      .max(3000),
    access: z
      .array(
        z.object({
          id: recordIdSchema,
          name: databaseText(120, 3),
          email: z.email(),
          role: z.enum(['director', 'staff']),
          active: z.boolean(),
        }),
      )
      .max(200),
    audit: z
      .array(
        z.object({
          id: recordIdSchema,
          staffId: recordIdSchema.nullable().optional(),
          action: databaseText(200),
          actor: databaseText(120),
          createdAt: timestamp,
          detail: databaseText(2000),
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
    if (data.audit.some((event) => event.staffId != null && !staff.has(event.staffId)))
      context.addIssue({ code: 'custom', message: 'Auditoria sem vínculo consistente.' });
  });
