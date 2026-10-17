import { describe, expect, it } from 'vitest';
import {
  balance,
  bookingSchema,
  csv,
  dateSchema,
  validateBooking,
  validateFiles,
} from '../src/domain';
import { createDemoRepository } from '../src/demo';

describe('saldo e agendamento', () => {
  it('converte reserva em uso sem descontar duas vezes', async () => {
    const repo = createDemoRepository('director');
    const data = await repo.load();
    const person = data.staff[0];
    const before = balance(data, person.id);
    const id = crypto.randomUUID();
    await repo.book({
      id,
      staffId: person.id,
      dates: ['2026-01-12'],
      reason: 'Folga já combinada',
    });
    expect(balance(await repo.load(), person.id).available).toBe(before.available - 1);
    await repo.changeBooking(id, 'used');
    const after = balance(await repo.load(), person.id);
    expect(after.available).toBe(before.available - 1);
    expect(after.used).toBe(before.used + 1);
    expect(after.reserved).toBe(before.reserved);
  });
  it('idempotência impede reserva duplicada após repetição', async () => {
    const repo = createDemoRepository('director');
    const data = await repo.load();
    const input = {
      id: crypto.randomUUID(),
      staffId: data.staff[0].id,
      dates: ['2026-11-01'],
      reason: 'Folga combinada',
    };
    await repo.book(input);
    await repo.book(input);
    expect((await repo.load()).bookings.filter((b) => b.id === input.id)).toHaveLength(1);
  });
  it('rejeita saldo insuficiente, sobreposição e datas inválidas', async () => {
    const data = await createDemoRepository('director').load();
    const staffId = data.staff[0].id;
    expect(() =>
      validateBooking(data, {
        id: crypto.randomUUID(),
        staffId,
        dates: ['2026-10-23'],
        reason: 'Mesmo dia',
      }),
    ).toThrow('Já existe');
    expect(dateSchema.safeParse('2026-02-30').success).toBe(false);
    expect(
      bookingSchema.safeParse({
        id: crypto.randomUUID(),
        staffId,
        dates: ['2026-11-01', '2026-11-01'],
        reason: 'Datas repetidas',
      }).success,
    ).toBe(false);
    data.credits = [];
    expect(() =>
      validateBooking(data, {
        id: crypto.randomUUID(),
        staffId,
        dates: ['2026-11-01'],
        reason: 'Sem saldo',
      }),
    ).toThrow('saldo');
  });
  it('cancelar devolve a disponibilidade e preserva registro', async () => {
    const repo = createDemoRepository('director');
    const data = await repo.load();
    const booking = data.bookings.find((b) => b.status === 'reserved')!;
    const before = balance(data, booking.staffId);
    await repo.changeBooking(booking.id, 'cancelled');
    expect(balance(await repo.load(), booking.staffId).available).toBe(
      before.available + booking.dates.length,
    );
    expect((await repo.load()).bookings.find((b) => b.id === booking.id)?.status).toBe('cancelled');
  });
});
describe('arquivos e exportação', () => {
  it('não aceita extensão PDF com conteúdo arbitrário ou quantidade indevida', async () => {
    await expect(validateFiles([new File(['documento falso'], 'teste.pdf')])).rejects.toThrow(
      'PDF completo',
    );
    await expect(validateFiles([])).rejects.toThrow('1 a 3');
    await expect(
      validateFiles([new File(['%PDF-1.7\n%%EOF'], 'teste.pdf')]),
    ).resolves.toBeUndefined();
  });
  it('neutraliza fórmulas em CSV e escapa aspas e delimitadores', async () => {
    const data = await createDemoRepository('director').load();
    data.staff[0].name = '=HYPERLINK("url";"teste")';
    expect(csv(data)).toContain('"\'=HYPERLINK(""url"";""teste"")"');
  });
});
