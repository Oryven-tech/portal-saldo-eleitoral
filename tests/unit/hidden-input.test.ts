import { PassThrough } from 'node:stream';
import type { ReadStream } from 'node:tty';
import { expect, it } from 'vitest';
import { hidden } from '../../scripts/recovery/hidden-input';

function terminal() {
  const input = new PassThrough() as unknown as ReadStream;
  const modes: boolean[] = [];
  Object.assign(input, {
    isTTY: true,
    isRaw: false,
    setRawMode(mode: boolean) {
      modes.push(mode);
      return input;
    },
  });
  let printed = '';
  const output = {
    write(text: string | Uint8Array) {
      printed += text.toString();
      return true;
    },
  };
  return { input, output, modes, printed: () => printed };
}

it('recebe texto UTF-8 colado sem ecoar o segredo e restaura o terminal', async () => {
  const tty = terminal();
  const pending = hidden('Frase: ', tty.input, tty.output);
  tty.input.write('Teste sintético de recuperação 2026\r');
  await expect(pending).resolves.toBe('Teste sintético de recuperação 2026');
  expect(tty.printed()).not.toContain('sintético');
  expect(tty.printed()).toContain('*'.repeat(34));
  expect(tty.modes).toEqual([true, false]);
  expect(tty.input.listenerCount('keypress')).toBe(0);
});

it('não envia vazio nem Ctrl+V sem texto; permite colar depois e corrigir com Backspace', async () => {
  const tty = terminal();
  const pending = hidden('Chave: ', tty.input, tty.output);
  tty.input.write('\u0016\r');
  expect(tty.printed()).toContain('Nenhum valor informado.');
  expect(tty.modes).toEqual([true]);
  tty.input.write('fake-chavX\u007fe\r');
  await expect(pending).resolves.toBe('fake-chave');
  expect(tty.printed()).not.toContain('fake-chave');
});

it('preserva espaços intencionais e normalização Unicode do valor informado', async () => {
  const tty = terminal();
  const pending = hidden('Frase: ', tty.input, tty.output);
  tty.input.write('  cafe\u0301  \r');
  await expect(pending).resolves.toBe('  cafe\u0301  ');
});

it('Ctrl+C cancela sem revelar entrada e restaura o modo anterior', async () => {
  const tty = terminal();
  Object.assign(tty.input, { isRaw: true });
  const pending = hidden('Chave: ', tty.input, tty.output);
  const rejection = expect(pending).rejects.toThrow('Operação cancelada.');
  tty.input.write('fake-secret\u0003');
  await rejection;
  expect(tty.printed()).not.toContain('fake-secret');
  expect(tty.modes).toEqual([true, true]);
  expect(tty.input.listenerCount('keypress')).toBe(0);
});

it('recusa entrada sem terminal interativo', async () => {
  const tty = terminal();
  Object.assign(tty.input, { isTTY: false });
  await expect(hidden('Chave: ', tty.input, tty.output)).rejects.toThrow('terminal interativo');
  expect(tty.printed()).toBe('');
});
