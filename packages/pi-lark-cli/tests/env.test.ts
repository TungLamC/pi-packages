import type { Env } from "../src/env.ts";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, delimiter } from "node:path";
import { describe, expect, it, afterAll } from "vitest";
import { pathKeyOf, prependPath, removePath, findExternalLarkCli } from "../src/env.ts";

const fixtures: string[] = [];

function makeDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "pi-lark-cli-env-"));
	fixtures.push(dir);
	return dir;
}

afterAll(() => {
	for (const dir of fixtures)
		rmSync(dir, { recursive: true, force: true });
});

describe("pathKeyOf", () => {
	it("finds a case-insensitive PATH key", () => {
		expect(pathKeyOf({ Path: "/x" })).toBe("Path");
		expect(pathKeyOf({})).toBe("PATH");
	});
});

describe("prependPath", () => {
	it("prepends and is idempotent", () => {
		const env: Env = { PATH: "/usr/bin" };
		expect(prependPath(env, "/opt/bin")).toBe(true);
		expect(env.PATH).toBe(["/opt/bin", "/usr/bin"].join(delimiter));
		expect(prependPath(env, "/opt/bin")).toBe(false);
		expect(env.PATH).toBe(["/opt/bin", "/usr/bin"].join(delimiter));
	});

	it("moves an existing later entry to the front", () => {
		const env: Env = { PATH: ["/usr/bin", "/opt/bin"].join(delimiter) };
		expect(prependPath(env, "/opt/bin")).toBe(true);
		expect(env.PATH).toBe(["/opt/bin", "/usr/bin"].join(delimiter));
	});

	it("creates the PATH key when absent", () => {
		const env: Env = {};
		expect(prependPath(env, "/opt/bin")).toBe(true);
		expect(env.PATH).toBe("/opt/bin");
	});
});

describe("removePath", () => {
	it("removes the entry and reports whether anything changed", () => {
		const env: Env = { PATH: ["/opt/bin", "/usr/bin"].join(delimiter) };
		expect(removePath(env, "/opt/bin", "linux")).toBe(true);
		expect(env.PATH).toBe("/usr/bin");
		expect(removePath(env, "/opt/bin", "linux")).toBe(false);
	});

	it("round-trips with prependPath", () => {
		const env: Env = { PATH: "/usr/bin" };
		prependPath(env, "/opt/bin", "linux");
		removePath(env, "/opt/bin", "linux");
		expect(env.PATH).toBe("/usr/bin");
	});
});

describe("findExternalLarkCli", () => {
	it("finds an executable launcher outside the own bin dir and skips the own dir", () => {
		const ownBin = makeDir();
		const external = makeDir();
		writeFileSync(join(ownBin, "lark-cli"), "", { mode: 0o755 });
		writeFileSync(join(external, "lark-cli"), "", { mode: 0o755 });
		const env: Env = { PATH: [ownBin, external].join(delimiter) };
		expect(findExternalLarkCli(env, ownBin, "linux")).toBe(join(external, "lark-cli"));
	});

	it("returns null when only the own launcher exists", () => {
		const ownBin = makeDir();
		const empty = makeDir();
		mkdirSync(join(empty, "sub"));
		writeFileSync(join(ownBin, "lark-cli"), "", { mode: 0o755 });
		const env: Env = { PATH: [ownBin, empty].join(delimiter) };
		expect(findExternalLarkCli(env, ownBin, "linux")).toBeNull();
	});

	it("ignores non-executable files and directories on posix", () => {
		const ownBin = makeDir();
		const plain = makeDir();
		const dirLike = makeDir();
		writeFileSync(join(plain, "lark-cli"), "", { mode: 0o644 });
		mkdirSync(join(dirLike, "lark-cli"));
		const env: Env = { PATH: [plain, dirLike].join(delimiter) };
		expect(findExternalLarkCli(env, ownBin, "linux")).toBeNull();
	});

	it("matches windows launcher spellings without the executable bit", () => {
		const ownBin = makeDir();
		const external = makeDir();
		writeFileSync(join(external, "lark-cli.cmd"), "", { mode: 0o644 });
		const env: Env = { PATH: [external].join(delimiter) };
		expect(findExternalLarkCli(env, ownBin, "win32")).toBe(join(external, "lark-cli.cmd"));
		expect(findExternalLarkCli(env, ownBin, "linux")).toBeNull();
	});

	it("treats a symlink alias of the own bin dir as itself", () => {
		const ownBin = makeDir();
		const alias = join(makeDir(), "alias");
		symlinkSync(ownBin, alias);
		writeFileSync(join(ownBin, "lark-cli"), "", { mode: 0o755 });
		const env: Env = { PATH: [alias].join(delimiter) };
		expect(findExternalLarkCli(env, ownBin, "linux")).toBeNull();
		expect(prependPath(env, ownBin, "linux")).toBe(false);
	});

	it("compares paths case-insensitively on windows", () => {
		const env: Env = { PATH: "/OPT/BIN" };
		expect(prependPath(env, "/opt/bin", "win32")).toBe(false);
		expect(prependPath(env, "/opt/bin", "linux")).toBe(true);
	});
});
