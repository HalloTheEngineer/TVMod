import { UserError } from '../lib/errors.js';

const MESSAGE =
  'Patch mode is not implemented in v0.1.0. The launcher backend is the tested path. ' +
  'See docs/PATCHING.md for the planned ASAR patch design.';

export function patchCommand(): never {
  throw new UserError(MESSAGE);
}

export function repairCommand(): never {
  throw new UserError(MESSAGE);
}

export function unpatchCommand(): never {
  throw new UserError(MESSAGE);
}
