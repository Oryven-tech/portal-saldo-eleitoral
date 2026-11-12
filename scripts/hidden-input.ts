import { emitKeypressEvents } from 'node:readline';
import type { ReadStream, WriteStream } from 'node:tty';

/** Terminal-only entry: display masks, never the submitted value. */
export async function hidden(
  prompt: string,
  input: ReadStream = process.stdin,
  output: Pick<WriteStream, 'write'> = process.stdout,
): Promise<string> {
  if (!input.isTTY)
    throw new Error('Use um terminal interativo para informar a frase/chave sem exibi-la.');
  output.write(prompt);
  emitKeypressEvents(input);
  const raw = !!input.isRaw;
  input.setRawMode(true);
  input.resume();
  return new Promise((accept, reject) => {
    let value = '';
    const finish = (error?: Error) => {
      input.off('keypress', keypress);
      input.setRawMode(raw);
      input.pause();
      output.write('\n');
      if (error) reject(error);
      else accept(value);
      value = '';
    };
    const keypress = (text: string | undefined, key: { name?: string; ctrl?: boolean }) => {
      if (key.ctrl && key.name === 'c') return finish(new Error('Operação cancelada.'));
      if (key.name === 'return' || key.name === 'enter') {
        if (!value.trim()) {
          output.write(
            '\nNenhum valor informado. Cole ou digite o valor e pressione Enter.\n' + prompt,
          );
          value = '';
          return;
        }
        return finish();
      }
      if (key.name === 'backspace') {
        if (value) {
          value = [...value].slice(0, -1).join('');
          output.write('\b \b');
        }
      } else if (text && !key.ctrl && !/[\x00-\x1f\x7f]/.test(text)) {
        value += text;
        output.write('*'.repeat([...text].length));
      }
      if (value.length > 4096) finish(new Error('Entrada acima do limite.'));
    };
    input.on('keypress', keypress);
  });
}
