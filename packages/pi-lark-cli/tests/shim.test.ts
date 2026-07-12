import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { describe, expect, it, afterAll } from "vitest";

const require = createRequire(import.meta.url);
const shim = fileURLToPath(new URL("../bin/main.cjs", import.meta.url));
const { analyzeArgs, findBlockedSubcommand } = require("../bin/main.cjs") as {
	analyzeArgs: (args: string[]) => { subcommand: string | undefined; unknownFlag: boolean };
	findBlockedSubcommand: (args: string[]) => string | undefined;
};

function runShim(shimPath: string, args: string[]): { status: number; stdout: string; stderr: string } {
	try {
		const stdout = execFileSync(process.execPath, [shimPath, ...args], { stdio: ["ignore", "pipe", "pipe"] });
		return { status: 0, stdout: stdout.toString(), stderr: "" };
	} catch (error) {
		const e = error as { status: number | null; stdout: Buffer; stderr: Buffer };
		return { status: e.status ?? -1, stdout: e.stdout?.toString() ?? "", stderr: e.stderr?.toString() ?? "" };
	}
}

describe("analyzeArgs", () => {
	it("skips leading global flags in all spellings", () => {
		expect(analyzeArgs(["update"]).subcommand).toBe("update");
		expect(analyzeArgs(["--profile", "work", "update"]).subcommand).toBe("update");
		expect(analyzeArgs(["--profile=work", "update"]).subcommand).toBe("update");
		expect(analyzeArgs(["-v"]).subcommand).toBeUndefined();
		expect(analyzeArgs(["--", "update"]).subcommand).toBe("update");
	});

	it("marks unknown boolean-looking flags", () => {
		expect(analyzeArgs(["--json", "im"])).toEqual({ subcommand: "im", unknownFlag: true });
		expect(analyzeArgs(["--profile", "work", "im"])).toEqual({ subcommand: "im", unknownFlag: false });
		expect(analyzeArgs(["-v"]).unknownFlag).toBe(false);
	});
});

describe("findBlockedSubcommand", () => {
	it("falls back to a conservative scan when unknown flags are present", () => {
		expect(findBlockedSubcommand(["--future-config", "work", "update"])).toBe("update");
		expect(findBlockedSubcommand(["--future-config", "work", "install"])).toBe("install");
		expect(findBlockedSubcommand(["--future-config", "work", "im"])).toBeUndefined();
		expect(findBlockedSubcommand(["--profile", "work", "im", "update-something"])).toBeUndefined();
		expect(findBlockedSubcommand(["constructor"])).toBeUndefined();
	});
});

describe("bin shim interception", () => {
	it.each([
		[["update"]],
		[["--profile", "work", "update"]],
		[["--profile=work", "update"]],
		[["--", "update"]],
		[["--future-config", "work", "update"]],
	])("blocks update via %j and points to pi update", (args) => {
		const result = runShim(shim, args);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("pi update npm:@tunglam/pi-lark-cli");
	});

	it("blocks the install wizard and points to config/auth commands", () => {
		const result = runShim(shim, ["install"]);
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("lark-cli auth login");
	});
});

describe("bin shim forwarding", () => {
	const fixtures: string[] = [];

	afterAll(() => {
		for (const dir of fixtures)
			rmSync(dir, { recursive: true, force: true });
	});

	function makeFixture(): string {
		const root = mkdtempSync(join(tmpdir(), "pi-lark-cli-shim-"));
		fixtures.push(root);
		mkdirSync(join(root, "bin"), { recursive: true });
		copyFileSync(shim, join(root, "bin", "main.cjs"));
		const fakePkg = join(root, "node_modules", "@larksuite", "cli");
		mkdirSync(join(fakePkg, "scripts"), { recursive: true });
		writeFileSync(join(fakePkg, "package.json"), JSON.stringify({ name: "@larksuite/cli", version: "0.0.0-fake" }));
		writeFileSync(join(fakePkg, "scripts", "run.js"), [
			"console.log(JSON.stringify({",
			"\targv: process.argv.slice(2),",
			"\tupdateNotifier: process.env.LARKSUITE_CLI_NO_UPDATE_NOTIFIER,",
			"\tskillsNotifier: process.env.LARKSUITE_CLI_NO_SKILLS_NOTIFIER,",
			"}));",
		].join("\n"));
		return root;
	}

	it("resolves a nested @larksuite/cli, forwards args, and injects notifier env", () => {
		const root = makeFixture();
		const result = runShim(join(root, "bin", "main.cjs"), ["--profile", "work", "im", "+chat-list"]);
		expect(result.status).toBe(0);
		const payload = JSON.parse(result.stdout);
		expect(payload.argv).toEqual(["--profile", "work", "im", "+chat-list"]);
		expect(payload.updateNotifier).toBe("1");
		expect(payload.skillsNotifier).toBe("1");
	});

	it("propagates the forwarded exit code", () => {
		const root = makeFixture();
		writeFileSync(join(root, "node_modules", "@larksuite", "cli", "scripts", "run.js"), "process.exit(42);");
		expect(runShim(join(root, "bin", "main.cjs"), ["im"]).status).toBe(42);
	});
});
