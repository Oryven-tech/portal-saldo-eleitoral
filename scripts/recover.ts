// Node 24 strips TypeScript types. No extra runtime or stored credentials.
import { readdir, readFile, stat, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { createInterface } from 'node:readline/promises';
import { emitKeypressEvents } from 'node:readline';
import { createClient } from '@supabase/supabase-js';
import { readBackup } from '../src/backup.ts';
import { performRecovery, planRecovery } from '../src/recovery.ts';

async function hidden(prompt: string): Promise<string> {
  if (!process.stdin.isTTY)
    throw new Error('Use um terminal interativo para informar a frase/chave sem exibi-la.');
  process.stdout.write(prompt);
  emitKeypressEvents(process.stdin);
  const raw = !!process.stdin.isRaw;
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((accept, reject) => {
    let value = '';
    const finish = (error?: Error) => {
      process.stdin.off('keypress', keypress);
      process.stdin.setRawMode(raw);
      process.stdin.pause();
      process.stdout.write('\n');
      if (error) reject(error);
      else accept(value);
      value = '';
    };
    const keypress = (text: string | undefined, key: { name?: string; ctrl?: boolean }) => {
      if (key.ctrl && key.name === 'c') return finish(new Error('Operação cancelada.'));
      if (key.name === 'return' || key.name === 'enter') return finish();
      if (key.name === 'backspace') value = [...value].slice(0, -1).join('');
      else if (text && !key.ctrl && !/[\x00-\x1f\x7f]/.test(text)) value += text;
      if (value.length > 4096) finish(new Error('Entrada acima do limite.'));
    };
    process.stdin.on('keypress', keypress);
  });
}

async function main() {
  const [mode, folder, target] = process.argv.slice(2);
  if (
    !['inspect', 'apply'].includes(mode) ||
    !folder ||
    (mode === 'apply' && !/^[a-z0-9]{20}$/.test(target ?? ''))
  ) {
    throw new Error(
      'Uso: npm run recovery -- inspect <pasta> | apply <pasta> <referencia-do-novo-projeto>',
    );
  }
  const root = resolve(folder);
  const names = (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.psebackup'))
    .map((entry) => entry.name)
    .sort();
  if (!names.length || names.length > 100)
    throw new Error('A pasta deve conter de 1 a 100 partes do mesmo backup.');
  const files = await Promise.all(
    names.map(async (name) => {
      const path = join(root, name);
      return {
        size: (await stat(path)).size,
        arrayBuffer: async () => {
          const bytes = await readFile(path);
          return bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ) as ArrayBuffer;
        },
      };
    }),
  );
  const staging = await mkdtemp(join(tmpdir(), 'pse-recovery-'));
  try {
    let password = await hidden('Frase de recuperação (não será exibida): ');
    const { summary, snapshot } = await readBackup(files, password, async (id, bytes) => {
      await writeFile(join(staging, `${id}.pdf`), bytes, { flag: 'wx', mode: 0o600 });
    });
    password = '';
    const plan = planRecovery(snapshot);
    process.stdout.write(
      JSON.stringify(
        {
          ...summary,
          ...plan.counts,
          bytes: plan.totalBytes,
          interruptedSubmissions: plan.interruptedSubmissions.length,
          historicalAccesses: plan.accessForReview.length,
        },
        null,
        2,
      ) + '\n',
    );
    process.stdout.write(
      'Servidores terão acessos inativos para revisão. Papéis antigos não serão aplicados. Rascunhos incompletos exigirão reenvio.\n',
    );
    if (mode === 'inspect') return;
    const input = createInterface({ input: process.stdin, output: process.stdout });
    const confirmation = await input.question(
      `Destino vazio https://${target}.supabase.co. Digite RESTAURAR ${target}: `,
    );
    input.close();
    if (confirmation !== `RESTAURAR ${target}`) throw new Error('Destino não confirmado.');
    let key = await hidden('Chave secreta/service_role do NOVO projeto (não será exibida): ');
    if (!key.startsWith('sb_secret_')) {
      let role = '';
      try {
        role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role;
      } catch {
        /* rejected below */
      }
      if (role !== 'service_role')
        throw new Error(
          'Informe uma chave administrativa do projeto vazio, nunca a chave publicável.',
        );
    }
    const client = createClient(`https://${target}.supabase.co`, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    key = '';
    const result = await performRecovery(
      snapshot,
      {
        async restore(data, checkOnly) {
          const { data: response, error } = await client.rpc('restore_backup', {
            p_snapshot: data,
            p_check_only: checkOnly,
          });
          if (error) throw new Error(`Destino recusou a recuperação: ${error.message}`);
          return response;
        },
        async upload(path, bytes) {
          const { error } = await client.storage
            .from('evidence')
            .upload(path, bytes, { contentType: 'application/pdf', upsert: false });
          if (error) throw new Error('Upload não confirmado.');
        },
        async download(path) {
          const { data, error } = await client.storage.from('evidence').download(path);
          if (error || !data) throw new Error('Não foi possível conferir o documento no destino.');
          return new Uint8Array(await data.arrayBuffer());
        },
      },
      async (id) => new Uint8Array(await readFile(join(staging, `${id}.pdf`))),
      (message) => process.stdout.write(message + '\n'),
    );
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.stdout.write(
      result.status === 'already_restored'
        ? 'Esta cópia já foi aplicada. Nenhum dado foi reaplicado. Confira o estado atual no portal.\n'
        : 'Recuperação confirmada. Confira saldos/PDFs e revise cada acesso inativo antes de abrir o novo portal.\n',
    );
  } finally {
    // Windows: verify the resolved temporary target before recursive removal.
    if (!resolve(staging).startsWith(resolve(tmpdir()) + sep + 'pse-recovery-'))
      throw new Error('Pasta temporária inesperada.');
    await rm(staging, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  process.stderr.write((error instanceof Error ? error.message : 'Falha na recuperação.') + '\n');
  process.exitCode = 1;
});
