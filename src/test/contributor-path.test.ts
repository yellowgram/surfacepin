import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const cli = join(root, "dist", "cli.js");
const verifySh = join(root, "action", "verify.sh");
const hook = join(root, ".githooks", "pre-commit");

function run(
  file: string,
  env: Record<string, string | undefined>,
): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync("bash", [file], {
    cwd: root,
    encoding: "utf8",
    timeout: 20_000,
    env: { ...process.env, SURFACEPIN_BIN: cli, ...env },
  });
  return {
    status: r.status,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
  };
}

describe("action/verify.sh", () => {
  it("file mode matches examples/tools.json (backward compatible)", () => {
    const r = run(verifySh, {
      SURFACEPIN_TOOLS_PATH: "examples/tools.json",
      SURFACEPIN_LOCKFILE: "examples/surfacepin.lock.json",
      SURFACEPIN_SURFACE: "",
      SURFACEPIN_SERVER_COMMAND: "",
      SURFACEPIN_SERVER_ARGS: "",
    });
    assert.equal(r.status, 0, `stderr=${r.stderr}\nstdout=${r.stdout}`);
    assert.match(r.stdout, /OK:/);
  });

  it("file mode honors --surface tools,resources,prompts", () => {
    const r = run(verifySh, {
      SURFACEPIN_TOOLS_PATH: "testdata/basic.surface.json",
      SURFACEPIN_LOCKFILE: "testdata/basic.multi.lock.json",
      SURFACEPIN_SURFACE: "tools,resources,prompts",
      SURFACEPIN_SERVER_COMMAND: "",
      SURFACEPIN_SERVER_ARGS: "",
    });
    assert.equal(r.status, 0, `stderr=${r.stderr}\nstdout=${r.stdout}`);
    assert.match(r.stdout, /OK:/);
  });

  it("stdio mode verifies the stub against the multi lockfile", () => {
    const r = run(verifySh, {
      SURFACEPIN_TOOLS_PATH: "",
      SURFACEPIN_LOCKFILE: "testdata/basic.multi.lock.json",
      SURFACEPIN_SURFACE: "tools,resources,prompts",
      SURFACEPIN_SERVER_COMMAND: process.execPath,
      SURFACEPIN_SERVER_ARGS: "testdata/stub-mcp-server.mjs",
    });
    assert.equal(r.status, 0, `stderr=${r.stderr}\nstdout=${r.stdout}`);
    assert.match(r.stdout, /OK:/);
  });

  it("stdio mode accepts newline-separated server args", () => {
    const r = run(verifySh, {
      SURFACEPIN_TOOLS_PATH: "",
      SURFACEPIN_LOCKFILE: "examples/sdk-default-path/surfacepin.lock.json",
      SURFACEPIN_SURFACE: "tools",
      SURFACEPIN_SERVER_COMMAND: process.execPath,
      SURFACEPIN_SERVER_ARGS: "examples/sdk-default-path/server.mjs\n",
    });
    assert.equal(r.status, 0, `stderr=${r.stderr}\nstdout=${r.stdout}`);
    assert.match(r.stdout, /OK:/);
  });

  it("exits 1 on digest drift", () => {
    const r = run(verifySh, {
      SURFACEPIN_TOOLS_PATH: "testdata/basic.tools.json",
      SURFACEPIN_LOCKFILE: "testdata/empty.lock.json",
      SURFACEPIN_SURFACE: "",
      SURFACEPIN_SERVER_COMMAND: "",
      SURFACEPIN_SERVER_ARGS: "",
    });
    assert.equal(r.status, 1, `stderr=${r.stderr}\nstdout=${r.stdout}`);
    assert.match(r.stdout, /DRIFT:/);
  });

  it("rejects file and stdio together", () => {
    const r = run(verifySh, {
      SURFACEPIN_TOOLS_PATH: "examples/tools.json",
      SURFACEPIN_LOCKFILE: "examples/surfacepin.lock.json",
      SURFACEPIN_SERVER_COMMAND: "node",
      SURFACEPIN_SERVER_ARGS: "testdata/stub-mcp-server.mjs",
    });
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /not both/);
  });

  it("rejects a missing source", () => {
    const r = run(verifySh, {
      SURFACEPIN_TOOLS_PATH: "",
      SURFACEPIN_LOCKFILE: "examples/surfacepin.lock.json",
      SURFACEPIN_SERVER_COMMAND: "",
      SURFACEPIN_SERVER_ARGS: "",
    });
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /tools-path or server-command/);
  });
});

describe("pre-commit hook", () => {
  it("verifies the same stub lockfile the Action stdio job uses", () => {
    const r = spawnSync(hook, [], {
      cwd: root,
      encoding: "utf8",
      timeout: 20_000,
    });
    assert.equal(r.status, 0, `stderr=${r.stderr}\nstdout=${r.stdout}`);
    assert.match(r.stdout ?? "", /OK:/);
  });

  it("file-mode override verifies examples/surfacepin.lock.json", () => {
    const r = spawnSync(hook, [], {
      cwd: root,
      encoding: "utf8",
      timeout: 20_000,
      env: {
        ...process.env,
        SURFACEPIN_LOCKFILE: "examples/surfacepin.lock.json",
        SURFACEPIN_SURFACE: "",
        SURFACEPIN_SERVER_COMMAND: "",
        SURFACEPIN_SERVER_ARGS: "",
        SURFACEPIN_TOOLS: "examples/tools.json",
      },
    });
    assert.equal(r.status, 0, `stderr=${r.stderr}\nstdout=${r.stdout}`);
    assert.match(r.stdout ?? "", /OK:/);
  });
});
