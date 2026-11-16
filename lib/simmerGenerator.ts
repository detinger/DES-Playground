import type { DesModel } from './model';
import type { RunConfig } from './engine';
import { generateProcessCode } from './processExport';

/** Emit the canonical graph and its executable R simmer runtime. */
export function generateSimmerCode(model: DesModel, config: RunConfig): string {
  return generateProcessCode(model, config, 'r');
}
