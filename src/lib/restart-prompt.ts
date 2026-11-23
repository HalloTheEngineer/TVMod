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

  if (process.platform === 'darwin') {
    const script = `button returned of (display dialog ${JSON.stringify(
      QUESTION
    )} buttons {"Cancel","Restart"} default button "Restart" with title "TVMod")`;
    const result = spawnSync('osascript', ['-e', script], {
      encoding: 'utf8',
    });
    if (!result.error) {
      if (result.status === 0 && /Restart/i.test(result.stdout)) return 'yes';
      if (result.status === 0 || result.status === 1) return 'no';
    }
    return 'unavailable';
  }

  if (process.platform === 'win32') {
    const script = [
      'Add-Type -AssemblyName PresentationFramework',
      `$r = [System.Windows.MessageBox]::Show(${JSON.stringify(
        QUESTION
      )}, 'TVMod', 'YesNo', 'Question')`,
      "if ($r -eq 'Yes') { exit 0 } else { exit 1 }",
    ].join('; ');
    const result = spawnSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { stdio: 'ignore', windowsHide: true }
    );
    if (!result.error) {
      if (result.status === 0) return 'yes';
      if (result.status === 1) return 'no';
    }
    return 'unavailable';
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
