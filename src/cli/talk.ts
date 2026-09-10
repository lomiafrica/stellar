export const CIRCLE_FAUCET_URL = 'https://faucet.circle.com';
export const SETTLE_USDC = 10;

const BOX_WIDTH = 44;

const colorOn =
  process.stdout.isTTY === true &&
  process.env.NO_COLOR === undefined &&
  process.env.STELLAR_LAB_COLOR !== '0' &&
  (typeof process.stdout.hasColors !== 'function' || process.stdout.hasColors());

function paint(code: number, text: string): string {
  if (!colorOn) return text;
  return `\u001b[${code}m${text}\u001b[0m`;
}

export const ink = {
  dim: (text: string) => paint(2, text),
  bold: (text: string) => paint(1, text),
  cyan: (text: string) => paint(36, text),
  green: (text: string) => paint(32, text),
  yellow: (text: string) => paint(33, text),
};

const ESC = String.fromCharCode(27);

export function visibleWidth(text: string): number {
  let width = 0;
  let i = 0;
  while (i < text.length) {
    if (text[i] === ESC && text[i + 1] === '[') {
      const end = text.indexOf('m', i + 2);
      i = end === -1 ? text.length : end + 1;
      continue;
    }
    width += 1;
    i += 1;
  }
  return width;
}

function padVisible(text: string, width: number): string {
  const extra = width - visibleWidth(text);
  return extra > 0 ? `${text}${' '.repeat(extra)}` : text;
}

function boxLine(inner: string): string {
  return `${ink.dim('│')} ${padVisible(inner, BOX_WIDTH - 4)} ${ink.dim('│')}`;
}

export async function pace(ms = 900): Promise<void> {
  if (process.env.STELLAR_LAB_PACE === '0') return;
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function printLabHeader(current?: 1 | 2 | 3): Promise<void> {
  const title = ` ${ink.bold('lomi. testnet lab')} `;
  const rule = '─'.repeat(Math.max(1, BOX_WIDTH - 2 - visibleWidth(title)));
  console.log(ink.dim(`┌${title}${rule}┐`));
  console.log(boxLine('Circle USDC on Stellar Testnet'));
  if (current === 1) {
    console.log(boxLine(ink.cyan('bootstrap')));
  } else if (current === 2) {
    console.log(boxLine(ink.cyan('settle:10')));
  } else if (current === 3) {
    console.log(boxLine(ink.cyan('links')));
  }
  console.log(ink.dim(`└${'─'.repeat(BOX_WIDTH - 2)}┘`));
  console.log('');
  await pace();
}

export async function say(line: string): Promise<void> {
  console.log(line);
  await pace(400);
}

export async function sayOk(line: string): Promise<void> {
  console.log(ink.green(line));
  await pace(400);
}

export async function sayDim(line: string): Promise<void> {
  console.log(ink.dim(line));
  await pace(300);
}

export async function thenRun(command: string): Promise<void> {
  console.log('');
  console.log(ink.cyan(command));
  await pace();
}

export async function printFaucetHint(omnibusPublicKey: string): Promise<void> {
  console.log('');
  console.log(ink.yellow(`Need ${SETTLE_USDC} test USDC.`));
  console.log(CIRCLE_FAUCET_URL);
  console.log('Stellar Testnet');
  console.log(omnibusPublicKey);
  await pace();
}
