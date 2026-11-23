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
import {
  pluginBrowseCommand,
  pluginInstallCommand,
  pluginKeygenCommand,
  pluginPackCommand,
  registryAddCommand,
  registryListCommand,
  registryRemoveCommand,
  registrySignCommand,
} from './commands/plugin-dist.js';
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
  tvmod patch [--app <path>] [--restart] [--system] --yes
  tvmod repair [--app <path>] [--restart] [--system] --yes
  tvmod unpatch [--app <path>] [--restart] [--system] --yes
  tvmod plugin add <dir> [--force]
  tvmod plugin list
  tvmod plugin remove <id> --yes
  tvmod plugin refresh
  tvmod plugin path
  tvmod plugin keygen [dir] [--force]
  tvmod plugin pack <dir> --key <private-key.pem> [--out <file>]
  tvmod plugin registry add <name> <url> --key <public-key.pem>
  tvmod plugin registry list
  tvmod plugin registry remove <name> --yes
  tvmod plugin registry sign <index.json> --key <private-key.pem>
  tvmod plugin browse [query] [--registry <name>]
  tvmod plugin install <id> [--registry <name>] [--force]

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
  --system                elevate only the app.asar replacement (sudo/pkexec)
  --force                 replace an existing user-owned copy

Patch options:
  --app <path>            override the detected TradingView executable
  --restart               close TradingView before modifying app.asar
  --system                elevate only the app.asar replacement (sudo/pkexec)
  --yes                   required confirmation for patch/repair/unpatch/plugin remove

Plugin options:
  --force                 replace an existing plugin, bundle, or copy
  --key <path>            signing public/private key for pack/registry commands
  --out <path>            output path for pack/registry sign
  --registry <name>       restrict browse/install to one registry

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
      system: { type: 'boolean', default: false },
      force: { type: 'boolean', default: false },
      key: { type: 'string' },
      out: { type: 'string' },
      registry: { type: 'string' },
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
        system: Boolean(values.system),
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
        system: Boolean(values.system),
      });
      return;

    case 'repair':
      await repairCommand({
        app,
        restart: Boolean(values.restart),
        yes: Boolean(values.yes),
        system: Boolean(values.system),
      });
      return;

    case 'unpatch':
      await unpatchCommand({
        app,
        restart: Boolean(values.restart),
        yes: Boolean(values.yes),
        system: Boolean(values.system),
      });
      return;

    case 'plugin': {
      const subcommand = positionals[1] ?? 'list';
      const arg = positionals[2];
      const registry = typeof values.registry === 'string' ? values.registry : undefined;
      const key = typeof values.key === 'string' ? values.key : undefined;
      const out = typeof values.out === 'string' ? values.out : undefined;

      switch (subcommand) {
        case 'add':
          await pluginAddCommand(arg, { force: Boolean(values.force) });
          return;
        case 'list':
          pluginListCommand();
          return;
        case 'remove':
          await pluginRemoveCommand(arg, { yes: Boolean(values.yes) });
          return;
        case 'refresh':
          await pluginRefreshCommand();
          return;
        case 'path':
          pluginPathCommand();
          return;
        case 'keygen':
          pluginKeygenCommand(arg, { force: Boolean(values.force) });
          return;
        case 'pack':
          pluginPackCommand(arg, {
            key,
            out,
            force: Boolean(values.force),
          });
          return;
        case 'browse':
          await pluginBrowseCommand(arg, { registry });
          return;
        case 'install':
          await pluginInstallCommand(arg, {
            registry,
            force: Boolean(values.force),
          });
          return;
        case 'registry': {
          const action = positionals[2] ?? 'list';
          const name = positionals[3];
          const url = positionals[4];
          switch (action) {
            case 'add':
              await registryAddCommand(name, url, key, {
                force: Boolean(values.force),
              });
              return;
            case 'list':
              registryListCommand();
              return;
            case 'remove':
              registryRemoveCommand(name, { yes: Boolean(values.yes) });
              return;
            case 'sign':
              registrySignCommand(name, key, {
                out,
                force: Boolean(values.force),
              });
              return;
            default:
              throw new UserError(`unknown registry subcommand: ${action}`);
          }
        }
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
