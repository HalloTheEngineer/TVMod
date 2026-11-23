import { TVMOD_VERSION } from './version.js';
import { parseArgs } from 'node:util';
import { doctorCommand } from './commands/doctor.js';
import { installCommand } from './commands/install.js';
import { launchCommand } from './commands/launch.js';
import { patchCommand, repairCommand, unpatchCommand } from './commands/patch.js';
import {
  pluginAddCommand,
  pluginListCommand,
  pluginPathCommand,
  pluginRefreshCommand,
  pluginRemoveCommand,
} from './commands/plugin.js';
import { uninstallCommand } from './commands/uninstall.js';
import { UserError } from './lib/errors.js';
import {
  fail,
  info,
  setVerbose,
} from './lib/logger.js';
import { errorMessage } from './lib/util.js';

const HELP = `tvmod ${TVMOD_VERSION} - local mods for TradingView Desktop

Usage:
  tvmod install [--app <path>] [--copy] [--patch] [--force]
  tvmod launch [options]
  tvmod doctor [--app <path>]
  tvmod uninstall [--purge]
  tvmod patch [--app <path>] [--restart] --yes
  tvmod repair [--app <path>] [--restart] --yes
  tvmod unpatch [--app <path>] [--restart] --yes
  tvmod plugin add <dir> [--force]
  tvmod plugin list
  tvmod plugin remove <id> --yes
  tvmod plugin refresh
  tvmod plugin path

Launch options:
  --app <path>            override the detected TradingView executable
  --restart               close a running TradingView instance first
  --user-data-dir <path>  use a separate profile (development only)
  --no-reload             do not reload a page that loaded before injection
  --no-prompt             never ask to close a running TradingView instance
  --keep-inspector        leave the main-process inspector open (development)
  --print-pid             print the spawned PID
  --timeout <seconds>     inspector/preload timeout (default: 30)
  --verbose               print debug details

Install options:
  --app <path>            override the detected TradingView executable
  --copy                  copy TradingView to ~/.local/opt/tradingview first
  --patch                 patch the installed/copied app.asar (requires --yes)
  --force                 replace an existing user-owned copy

Patch options:
  --app <path>            override the detected TradingView executable
  --restart               close TradingView before modifying app.asar
  --yes                   required confirmation for patch/repair/unpatch/plugin remove

Plugin options:
  --force                 replace an existing plugin with the same id

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
      'no-prompt': { type: 'boolean', default: false },
      'keep-inspector': { type: 'boolean', default: false },
      'print-pid': { type: 'boolean', default: false },
      timeout: { type: 'string' },
      verbose: { type: 'boolean', default: false },
      purge: { type: 'boolean', default: false },
      yes: { type: 'boolean', default: false },
      copy: { type: 'boolean', default: false },
      patch: { type: 'boolean', default: false },
      force: { type: 'boolean', default: false },
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
    info(TVMOD_VERSION);
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
      await installCommand({
        app,
        copy: Boolean(values.copy),
        patch: Boolean(values.patch),
        force: Boolean(values.force),
        yes: Boolean(values.yes),
      });
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
        noPrompt: Boolean(values['no-prompt']),
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

    case 'plugin': {
      const subcommand = positionals[1] ?? 'list';
      const arg = positionals[2];
      switch (subcommand) {
        case 'add':
          pluginAddCommand(arg, { force: Boolean(values.force) });
          return;
        case 'list':
          pluginListCommand();
          return;
        case 'remove':
          pluginRemoveCommand(arg, { yes: Boolean(values.yes) });
          return;
        case 'refresh':
          pluginRefreshCommand();
          return;
        case 'path':
          pluginPathCommand();
          return;
        default:
          throw new UserError(`unknown plugin subcommand: ${subcommand}`);
      }
    }

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
