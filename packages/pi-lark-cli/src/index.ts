import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { join, dirname, isAbsolute, relative, sep } from "node:path";
import { prependPath, removePath, findExternalLarkCli } from "./env.ts";

const require = createRequire(import.meta.url);
const binDir = fileURLToPath(new URL("../bin", import.meta.url));
const skillsDir = fileURLToPath(new URL("../skills", import.meta.url));
const ownPkg = require("../package.json") as { name: string; version: string; larkCliVersion: string };
type CommandInfo = ReturnType<ExtensionAPI["getCommands"]>[number];

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

function isInside(parent: string, child: string): boolean {
	const path = relative(parent, child);
	return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

export function findActiveExternalUserLarkSkills(commands: CommandInfo[]): CommandInfo[] {
	return commands.filter(
		(command) =>
			command.source === "skill" &&
			command.name.startsWith("skill:lark-") &&
			command.sourceInfo.scope === "user" &&
			!isInside(skillsDir, command.sourceInfo.path),
	);
}

function conflictGuidance(externalSkills: CommandInfo[]): string[] {
	const skillFix = externalSkills.every(
		(skill) => skill.sourceInfo.origin === "top-level" && skill.sourceInfo.source === "auto",
	)
		? '  Add "!skills/lark-*" to ~/.pi/agent/settings.json, then /reload.'
		: "  Disable the external lark-* skills with pi config, then /reload.";
	return [
		"Lark setup conflict: Pi uses the bundled CLI, but external lark-* skills are active.",
		"",
		"Use external setup:",
		`  pi remove npm:${ownPkg.name}`,
		"",
		"Use the bundled CLI and matching skills:",
		skillFix,
	];
}

function statusLines(pi: ExtensionAPI): string[] {
	const lines = [`${ownPkg.name} v${ownPkg.version} (bundles lark-cli v${ownPkg.larkCliVersion})`];
	const cli = resolveCliInfo();
	if (!cli) {
		lines.push("@larksuite/cli: NOT RESOLVED — reinstall with: pi update npm:" + ownPkg.name);
		return lines;
	}
	lines.push(`@larksuite/cli: v${cli.version}${cli.version === ownPkg.larkCliVersion ? "" : ` (MISMATCH, expected v${ownPkg.larkCliVersion})`}`);
	lines.push(cli.binaryPresent ? `binary: ${cli.binaryPath}` : "binary: not downloaded yet (fetched automatically on first lark-cli call)");
	const external = findExternalLarkCli(process.env, binDir);
	if (external) {
		lines.push(`external lark-cli: ${external}`);
		const externalSkills = findActiveExternalUserLarkSkills(pi.getCommands());
		if (externalSkills.length > 0)
			lines.push("", ...conflictGuidance(externalSkills));
	} else {
		lines.push("external lark-cli: none");
	}
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
			ctx.ui.notify(statusLines(pi).join("\n"), "info");
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
		const externalSkills = findActiveExternalUserLarkSkills(pi.getCommands());
		if (externalSkills.length === 0)
			return;
		processFlags[NOTIFIED_KEY] = true;
		ctx.ui.notify(conflictGuidance(externalSkills).join("\n"), "warning");
	});

	pi.on("session_shutdown", () => {
		if (!processFlags[INJECTED_KEY])
			return;
		removePath(process.env, binDir);
		processFlags[INJECTED_KEY] = false;
	});
}
