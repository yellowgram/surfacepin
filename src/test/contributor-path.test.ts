import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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
  it("in GitHub Actions: drift writes an annotation and a job summary, with commands stopped around the report", () => {
    const dir = mkdtempSync(join(tmpdir(), "surfacepin-action-"));
    const summary = join(dir, "summary.md");
    writeFileSync(summary, "");
    const evil = join(dir, "evil.tools.json");
    writeFileSync(
      evil,
      JSON.stringify({ tools: [{ name: "a\n::error::forged", description: "<img src=x>" }] }),
    );
    const r = run(verifySh, {
      GITHUB_ACTIONS: "true",
      GITHUB_STEP_SUMMARY: summary,
      SURFACEPIN_TOOLS_PATH: evil,
      SURFACEPIN_LOCKFILE: "testdata/empty.lock.json",
      SURFACEPIN_SURFACE: "",
      SURFACEPIN_SERVER_COMMAND: "",
      SURFACEPIN_SERVER_ARGS: "",
    });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    const lines = r.stdout.split("\n");
    const stop = lines.findIndex((l) => l.startsWith("::stop-commands::"));
    assert.ok(stop >= 0, r.stdout);
    const token = lines[stop].slice("::stop-commands::".length);
    assert.match(token, /^surfacepin-[0-9a-f]{32}$/);
    const resume = lines.indexOf(`::${token}::`);
    assert.ok(resume > stop, r.stdout);
    // Nothing between stop and resume starts a workflow command.
    for (const l of lines.slice(stop + 1, resume)) assert.ok(!l.startsWith("::"), l);
    const ann = lines.slice(resume + 1).filter((l) => l.startsWith("::error "));
    assert.equal(ann.length, 1, r.stdout);
    assert.match(ann[0], /^::error file=testdata\/empty\.lock\.json,title=SurfacePin drift::.*1 added, 0 removed, 0 changed/);
    const md = readFileSync(summary, "utf8");
    assert.match(md, /### SurfacePin: drift against <code>testdata\/empty\.lock\.json<\/code>/);
    assert.match(md, /<pre>[\s\S]*ADDED   "a\\n::error::forged"[\s\S]*<\/pre>/);
    assert.doesNotMatch(md, /<img/);
  });

  it("in GitHub Actions: the annotation path includes working-directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "surfacepin-action-"));
    const r = run(verifySh, {
      GITHUB_ACTIONS: "true",
      GITHUB_STEP_SUMMARY: join(dir, "s.md"),
      SURFACEPIN_WORKDIR: "services/mcp",
      SURFACEPIN_TOOLS_PATH: "testdata/basic.tools.json",
      SURFACEPIN_LOCKFILE: "testdata/empty.lock.json",
      SURFACEPIN_SURFACE: "",
      SURFACEPIN_SERVER_COMMAND: "",
      SURFACEPIN_SERVER_ARGS: "",
    });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /^::error file=services\/mcp\/testdata\/empty\.lock\.json,title=SurfacePin drift::/m);
  });

  it("in GitHub Actions: a match writes a one-line summary and no annotation", () => {
    const dir = mkdtempSync(join(tmpdir(), "surfacepin-action-"));
    const summary = join(dir, "summary.md");
    writeFileSync(summary, "");
    const r = run(verifySh, {
      GITHUB_ACTIONS: "true",
      GITHUB_STEP_SUMMARY: summary,
      SURFACEPIN_TOOLS_PATH: "examples/tools.json",
      SURFACEPIN_LOCKFILE: "examples/surfacepin.lock.json",
      SURFACEPIN_SURFACE: "",
      SURFACEPIN_SERVER_COMMAND: "",
      SURFACEPIN_SERVER_ARGS: "",
    });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.doesNotMatch(r.stdout, /^::error/m);
    assert.match(readFileSync(summary, "utf8"), /SurfacePin: surface matches/);
  });

  it("space-separated server-args are not glob-expanded", () => {
    const dir = mkdtempSync(join(tmpdir(), "surfacepin-argv-"));
    const fake = join(dir, "fake-cli.js");
    const out = join(dir, "argv.json");
    writeFileSync(
      fake,
      `require("fs").writeFileSync(${JSON.stringify(out)}, JSON.stringify(process.argv.slice(2)));`,
    );
    const r = run(verifySh, {
      SURFACEPIN_BIN: fake,
      SURFACEPIN_TOOLS_PATH: "",
      SURFACEPIN_LOCKFILE: "x.lock.json",
      SURFACEPIN_SURFACE: "",
      SURFACEPIN_SERVER_COMMAND: "server",
      SURFACEPIN_SERVER_ARGS: "--files *.json",
    });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.deepEqual(JSON.parse(readFileSync(out, "utf8")), [
      "verify", "--stdio", "x.lock.json", "--", "server", "--files", "*.json",
    ]);
  });

  it("clean-env and env-allow reach the CLI in stdio mode and are refused in file mode", () => {
    const dir = mkdtempSync(join(tmpdir(), "surfacepin-argv-"));
    const fake = join(dir, "fake-cli.js");
    const out = join(dir, "argv.json");
    writeFileSync(
      fake,
      `require("fs").writeFileSync(${JSON.stringify(out)}, JSON.stringify(process.argv.slice(2)));`,
    );
    const base = {
      SURFACEPIN_BIN: fake,
      SURFACEPIN_TOOLS_PATH: "",
      SURFACEPIN_LOCKFILE: "x.lock.json",
      SURFACEPIN_SURFACE: "",
      SURFACEPIN_SERVER_COMMAND: "server",
      SURFACEPIN_SERVER_ARGS: "",
    };
    const r = run(verifySh, { ...base, SURFACEPIN_CLEAN_ENV: "true", SURFACEPIN_ENV_ALLOW: "A,B" });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.deepEqual(JSON.parse(readFileSync(out, "utf8")), [
      "verify", "--stdio", "--clean-env", "--env-allow", "A,B", "x.lock.json", "--", "server",
    ]);
    assert.equal(run(verifySh, { ...base, SURFACEPIN_CLEAN_ENV: "yes" }).status, 2);
    const file = run(verifySh, {
      ...base,
      SURFACEPIN_SERVER_COMMAND: "",
      SURFACEPIN_TOOLS_PATH: "examples/tools.json",
      SURFACEPIN_ENV_ALLOW: "A",
    });
    assert.equal(file.status, 2, file.stdout + file.stderr);
  });

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
    // Verify drift prints no offer or external link on stderr.
    assert.doesNotMatch(r.stderr, /founding offer|surface-guard/);
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
