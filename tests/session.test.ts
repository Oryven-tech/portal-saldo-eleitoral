import { expect, it, vi } from 'vitest';
import { createSessionBinding, createRequestGate, isAccessDenied } from '../src/session';
import type { PortalConnection } from '../src/session';
import type { Repository } from '../src/repository';

it('sessão inicial atrasada não desfaz entrada, troca de conta ou saída mais recente', () => {
  const publish = vi.fn();
  const binding = createSessionBinding(() => ({ mode: 'supabase' }) as Repository, publish);
  const initial = binding.initial();
  binding.apply({ user: { id: 'conta-a' } });
  expect(initial.apply({ user: { id: 'conta-antiga' } })).toBe(false);
  binding.apply(null);
  expect(initial.apply({ user: { id: 'conta-a' } })).toBe(false);
  expect(publish.mock.lastCall?.[0]).toBeNull();
});
it('renovação da mesma conta mantém repositório; outra conta recebe identidade e estado próprios', () => {
  const states: (PortalConnection | null)[] = [];
  const create = vi.fn(() => ({ mode: 'supabase' }) as Repository);
  const binding = createSessionBinding(create, (state) => states.push(state));
  binding.apply({ user: { id: 'conta-a' } });
  for (let i = 0; i < 5; i++) binding.apply({ user: { id: 'conta-a' } });
  expect(create).toHaveBeenCalledTimes(1);
  expect(states).toHaveLength(1);
  binding.apply({ user: { id: 'conta-b' } });
  expect(states[1]?.identity).toBe('conta-b');
  expect(states[1]?.repo).not.toBe(states[0]?.repo);
  binding.close();
  expect(binding.apply(null)).toBe(false);
  expect(states).toHaveLength(2);
});
it('resposta antiga de carregamento não reaparece depois da recusa de acesso mais recente', async () => {
  const gate = createRequestGate();
  gate.open();
  let screen: string | null = null;
  let finishOld!: (value: string) => void;
  const old = gate.begin();
  const pending = new Promise<string>((resolve) => {
    finishOld = resolve;
  }).then((value) => {
    if (old()) screen = value;
  });
  const revalidation = gate.begin();
  if (revalidation()) screen = null;
  finishOld('dados anteriores');
  await pending;
  expect(screen).toBeNull();
});
it('desmontagem e reabertura invalidam requisições antigas, inclusive no StrictMode', () => {
  const gate = createRequestGate();
  gate.open();
  const first = gate.begin();
  gate.close();
  gate.open();
  expect(first()).toBe(false);
  const next = gate.begin();
  expect(next()).toBe(true);
  gate.invalidate();
  expect(next()).toBe(false);
});
it('falha de rede ou validação não é confundida com revogação', () => {
  for (const error of [{ code: '42501' }, { code: 'PGRST303' }, { status: 401 }, { status: 403 }])
    expect(isAccessDenied(error)).toBe(true);
  for (const error of [null, new Error('conexão'), { code: 'P0001' }, { status: 500 }])
    expect(isAccessDenied(error)).toBe(false);
});
