const isTty = Boolean(process.stdout.isTTY);
let verbose = false;

const color = (code: number) => (value: string) =>
  isTty ? `\u001b[${code}m${value}\u001b[0m` : value;

const dim = color(2);
const red = color(31);
const green = color(32);
const yellow = color(33);
const cyan = color(36);
const bold = color(1);

export function setVerbose(value: boolean): void {
  verbose = value;
}

export function isVerbose(): boolean {
  return verbose;
}

export function debug(message: string): void {
  if (verbose) process.stderr.write(`${dim(`debug: ${message}`)}\n`);
}

export function info(message: string): void {
  process.stdout.write(`${message}\n`);
}

export function ok(message: string): void {
  process.stdout.write(`${green('ok')} ${message}\n`);
}

export function warn(message: string): void {
  process.stderr.write(`${yellow('warn')} ${message}\n`);
}

export function fail(message: string): void {
  process.stderr.write(`${red('error')} ${message}\n`);
}

export function heading(message: string): void {
  process.stdout.write(`${bold(message)}\n`);
}

export function label(name: string, value: string): void {
  process.stdout.write(`  ${dim(name.padEnd(14))} ${value}\n`);
}

export function accent(message: string): string {
  return cyan(message);
}
