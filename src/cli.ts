import { parseArgs } from 'node:util';
import { doctorCommand } from './commands/doctor.js';
import { installCommand } from './commands/install.js';
import { launchCommand } from './commands/launch.js';
import { patchCommand, repairCommand, unpatchCommand } from './commands/patch.js';
import { uninstallCommand } from './commands/uninstall.js';
import { UserError } from './lib/errors.js';
import {
  fail,
  info,
  setVerbose,
} from './lib/logger.js';
import { errorMessage } from './lib/util.js';

const HELP = `tvmod ${__TVMOD_VERSION__} - local mods for TradingView Desktop

Usage:
  tvmod install [--app <path>]
  tvmod launch [options]
  tvmod doctor [--app <path>]
  tvmod uninstall [--purge]
  tvmod patch [--app <path>] [--restart] --yes
  tvmod repair [--app <path>] [--restart] --yes
  tvmod unpatch [--app <path>] [--restart] --yes

Launch options:
  --app <path>            override the detected TradingView executable
  --restart               close a running TradingView instance first
  --user-data-dir <path>  use a separate profile (development only)
  --no-reload             do not reload a page that loaded before injection
  --keep-inspector        leave the main-process inspector open (development)
  --print-pid             print the spawned PID
  --timeout <seconds>     inspector/preload timeout (default: 30)
  --verbose               print debug details

Install options:
  --app <path>            override the detected TradingView executable

Patch options:
  --app <path>            override the detected TradingView executable
  --restart               close TradingView before modifying app.asar
  --yes                   required confirmation for patch/repair/unpatch

Other:
  -h, --help              show this help
  -v, --version           show the version
`;

function parseIntOption(value: string | boolean | undefined, fallback: number): number {
  if (typeof value !== 'string') return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function run(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      app: { type: 'string' },
      restart: { type: 'boolean', default: false },
      'user-data-dir': { type: 'string' },
      'no-reload': { type: 'boolean', default: false },
      'keep-inspector': { type: 'boolean', default: false },
      'print-pid': { type: 'boolean', default: false },
      timeout: { type: 'string' },
      verbose: { type: 'boolean', default: false },
      purge: { type: 'boolean', default: false },
      yes: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
      version: { type: 'boolean', short: 'v', default: false },
    },
  });

  setVerbose(Boolean(values.verbose));

  if (values.help) {
    info(HELP);
    return;
  }

  if (values.version) {
    info(__TVMOD_VERSION__);
    return;
  }

  const command = positionals[0] ?? 'help';
  const app = typeof values.app === 'string' ? values.app : undefined;
  const passthrough = positionals.slice(1);

  switch (command) {
    case 'help':
      info(HELP);
      return;

    case 'install':
      installCommand({ app });
      return;

    case 'launch':
      await launchCommand({
        app,
        restart: Boolean(values.restart),
        userDataDir:
          typeof values['user-data-dir'] === 'string'
            ? values['user-data-dir']
            : undefined,
        noReload: Boolean(values['no-reload']),
        keepInspector: Boolean(values['keep-inspector']),
        printPid: Boolean(values['print-pid']),
        timeoutSeconds: parseIntOption(values.timeout, 30),
        verbose: Boolean(values.verbose),
        extraArgs: passthrough,
      });
      return;

    case 'doctor':
      doctorCommand({ app });
      return;

    case 'uninstall':
      uninstallCommand({ purge: Boolean(values.purge) });
      return;

    case 'patch':
      await patchCommand({
        app,
        restart: Boolean(values.restart),
        yes: Boolean(values.yes),
      });
      return;

    case 'repair':
      await repairCommand({
        app,
        restart: Boolean(values.restart),
        yes: Boolean(values.yes),
      });
      return;

    case 'unpatch':
      await unpatchCommand({
        app,
        restart: Boolean(values.restart),
        yes: Boolean(values.yes),
      });
      return;

    default:
      fail(`unknown command: ${command}`);
      info('');
      info(HELP);
      process.exitCode = 1;
  }
}

run().catch((error: unknown) => {
  if (error instanceof UserError) {
    fail(error.message);
  } else {
    fail(errorMessage(error));
    if (process.env.TVMOD_DEBUG === '1' && error instanceof Error && error.stack) {
      info('');
      info(error.stack);
    }
  }
  process.exitCode = 1;
});
