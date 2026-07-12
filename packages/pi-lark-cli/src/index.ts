import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { prependPath, removePath, findExternalLarkCli } from "./env.ts";

const require = createRequire(import.meta.url);
const binDir = fileURLToPath(new URL("../bin", import.meta.url));
const ownPkg = require("../package.json") as { name: string; version: string; larkCliVersion: string };

interface CliInfo {
	version: string;
	binaryPath: string;
	binaryPresent: boolean;
}

function resolveCliInfo(): CliInfo | null {
	try {
		const pkgPath = require.resolve("@larksuite/cli/package.json");
		const version = (require(pkgPath) as { version: string }).version;
		const binName = process.platform === "win32" ? "lark-cli.exe" : "lark-cli";
		const binaryPath = join(dirname(pkgPath), "bin", binName);
		return { version, binaryPath, binaryPresent: existsSync(binaryPath) };
	} catch {
		return null;
	}
}

function conflictGuidance(externalPath: string): string[] {
	return [
		`Another lark-cli was found on PATH: ${externalPath}`,
		`Inside pi, the bundled lark-cli v${ownPkg.larkCliVersion} takes precedence; note that same-name skills outside this package override the bundled ones.`,
		"To keep a single installation:",
		`  use the external one only:  pi remove npm:${ownPkg.name}`,
		"  use this package only:      npm rm -g @larksuite/cli, then block external lark skills",
		'    in ~/.pi/agent/settings.json:  "skills": ["!skills/lark-*"]',
	];
}

function statusLines(): string[] {
	const lines = [`${ownPkg.name} v${ownPkg.version} (bundles lark-cli v${ownPkg.larkCliVersion})`];
	const cli = resolveCliInfo();
	if (!cli) {
		lines.push("@larksuite/cli: NOT RESOLVED — reinstall with: pi update npm:" + ownPkg.name);
		return lines;
	}
	lines.push(`@larksuite/cli: v${cli.version}${cli.version === ownPkg.larkCliVersion ? "" : ` (MISMATCH, expected v${ownPkg.larkCliVersion})`}`);
	lines.push(cli.binaryPresent ? `binary: ${cli.binaryPath}` : "binary: not downloaded yet (fetched automatically on first lark-cli call)");
	const external = findExternalLarkCli(process.env, binDir);
	if (external)
		lines.push("", ...conflictGuidance(external));
	else
		lines.push("external lark-cli: none");
	return lines;
}

// pi reloads and re-binds extensions on /new, resume, fork, and reload; a
// factory-local flag would re-notify each time, so the sentinel lives on
// globalThis to be truly once-per-process.
const NOTIFIED_KEY = Symbol.for("@tunglam/pi-lark-cli:conflict-notified");
const INJECTED_KEY = Symbol.for("@tunglam/pi-lark-cli:path-injected");
const processFlags = globalThis as unknown as Record<symbol, boolean | undefined>;

export default function piLarkCli(pi: ExtensionAPI): void {
	pi.registerCommand("lark-cli", {
		description: "Show bundled lark-cli status: versions, binary, PATH conflicts",
		handler: async (_args, ctx) => {
			ctx.ui.notify(statusLines().join("\n"), "info");
		},
	});

	pi.on("session_start", (_event, ctx) => {
		if (prependPath(process.env, binDir))
			processFlags[INJECTED_KEY] = true;
		if (processFlags[NOTIFIED_KEY] || !ctx.hasUI)
			return;
		const external = findExternalLarkCli(process.env, binDir);
		if (!external)
			return;
		processFlags[NOTIFIED_KEY] = true;
		ctx.ui.notify(conflictGuidance(external).join("\n"), "warning");
	});

	pi.on("session_shutdown", () => {
		if (!processFlags[INJECTED_KEY])
			return;
		removePath(process.env, binDir);
		processFlags[INJECTED_KEY] = false;
	});
}
