import { spawn } from 'node:child_process';
import { pace, printLabHeader } from '../src/cli/talk.js';

const STEPS = ['map', 'bootstrap', 'settle:10', 'proof'] as const;

async function run(script: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('pnpm', ['run', script], {
      stdio: 'inherit',
      env: process.env,
    });
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`pnpm ${script} exited ${code ?? '?'}`));
    });
  });
}

async function main() {
  await printLabHeader();

  for (const [index, script] of STEPS.entries()) {
    if (index > 0) {
      await pace(3500);
      console.log('');
    }
    await run(script);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
