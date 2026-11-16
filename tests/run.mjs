import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
const directory = await mkdtemp(join(tmpdir(), "des-tests-"));
try {
  const output = join(directory, "tests.cjs");
  await build({
    stdin: {
      contents:
        "import './tests/caseStudies.test.ts'; import './tests/processModel.test.ts'; import './tests/desFeatures.test.ts';",
      resolveDir: process.cwd(),
      loader: "ts",
    },
    bundle: true,
    platform: "node",
    format: "cjs",
    loader: { ".py": "text", ".R": "text" },
    outfile: output,
  });
  const result = spawnSync(process.execPath, [output], { stdio: "inherit" });
  process.exitCode = result.status ?? 1;
  if (result.status === 0) {
    for (const name of ["modelerUI", "desPlayback"]) {
      const ui = join(directory, `${name}.cjs`);
      await build({
        entryPoints: [`tests/${name}.test.tsx`],
        bundle: true,
        platform: "node",
        format: "cjs",
        // Keep Node task scheduling in React.act; bundling React falls back to persistent MessagePorts.
        external: ["jsdom", "react", "react-dom"],
        loader: { ".py": "text", ".R": "text", ".css": "empty" },
        outfile: ui,
      });
      const uiResult = spawnSync(process.execPath, [ui], {
        stdio: "inherit",
        timeout: 60000,
        env: { ...process.env, NODE_PATH: resolve("node_modules") },
      });
      process.exitCode = uiResult.status ?? 1;
      if (uiResult.error) console.error(uiResult.error.message);
      if (process.exitCode !== 0) break;
    }
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}
