import { expect, it } from 'vitest';
import { isPublishableKey } from '../src/config';
it('não aceita chave secreta nem JWT service_role no frontend', () => {
  const jwt = (role: string) => `header.${btoa(JSON.stringify({ role }))}.signature`;
  expect(isPublishableKey(jwt('anon'))).toBe(true);
  expect(isPublishableKey(jwt('service_role'))).toBe(false);
  expect(isPublishableKey('sb_secret_01234567890123456789')).toBe(false);
  expect(isPublishableKey('sb_publishable_01234567890123456789')).toBe(true);
  expect(isPublishableKey('texto qualquer')).toBe(false);
});
