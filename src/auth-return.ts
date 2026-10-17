/** Interpret OAuth failures without displaying provider-controlled text. */
export function oauthFailure(href: string): { message: string; cleanUrl: string } | null {
  const url = new URL(href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  const code = url.searchParams.get('error') || fragment.get('error');
  if (!code) return null;
  for (const key of ['error', 'error_code', 'error_description']) {
    url.searchParams.delete(key);
    fragment.delete(key);
  }
  url.hash = fragment.toString();
  return {
    message:
      code === 'access_denied'
        ? 'Acesso não autorizado. Procure a direção.'
        : 'Não foi possível concluir o acesso Google. Tente entrar novamente.',
    cleanUrl: url.href,
  };
}
