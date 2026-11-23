import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';

export type RestartAnswer = 'yes' | 'no' | 'unavailable';

const QUESTION =
  'TradingView is already running. Close it and relaunch with TVMod?';

export async function askRestart(): Promise<RestartAnswer> {
  if (process.stdin.isTTY) {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    try {
      const answer = await rl.question(`${QUESTION} [y/N] `);
      return /^y/i.test(answer.trim()) ? 'yes' : 'no';
    } finally {
      rl.close();
    }
  }

  const zenity = spawnSync(
    'zenity',
    ['--question', '--title=TVMod', `--text=${QUESTION}`],
    { stdio: 'ignore' }
  );
  if (!zenity.error && zenity.status === 0) return 'yes';
  if (!zenity.error && zenity.status === 1) return 'no';

  const kdialog = spawnSync(
    'kdialog',
    ['--title', 'TVMod', '--yesno', QUESTION],
    { stdio: 'ignore' }
  );
  if (!kdialog.error && kdialog.status === 0) return 'yes';
  if (!kdialog.error && kdialog.status === 1) return 'no';

  return 'unavailable';
}
