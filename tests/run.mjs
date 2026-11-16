import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const directory = await mkdtemp(join(tmpdir(), 'des-tests-'));
try {
  const output = join(directory, 'tests.cjs');
  await build({ entryPoints: ['tests/caseStudies.test.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: output });
  const result = spawnSync(process.execPath, [output], { stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} finally {
  await rm(directory, { recursive: true, force: true });
}
