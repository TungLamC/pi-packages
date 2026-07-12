#!/usr/bin/env node
// Shim owned by @tunglam/pi-lark-cli. Must stay CommonJS: the package is
// "type": "module", and this file is executed directly by the launchers.
"use strict";
const { spawnSync } = require("node:child_process");

const PKG = "@tunglam/pi-lark-cli";

// Root-level flags of the upstream Cobra CLI, split by whether they consume
// the next argv token. A future upstream value-flag we do not know yet makes
// its value look like the subcommand, so any unknown flag downgrades the
// parse to a conservative scan of every bare token (fail closed).
const VALUE_FLAGS = new Set(["--profile"]);
const BOOLEAN_FLAGS = new Set(["-h", "--help", "-v", "--version"]);

// "update" would npm-install a global @larksuite/cli and "install" runs the
// setup wizard which does the same; both would break the pinned CLI/skill
// version pairing this package guarantees.
const BLOCKED = {
	update: [
		`lark-cli here is managed by the pi package ${PKG};`,
		"its version is pinned so the bundled skills always match the binary.",
		"Update it through pi instead:",
		`  pi update npm:${PKG}`,
	],
	install: [
		`lark-cli here is managed by the pi package ${PKG}; the setup wizard is disabled.`,
		"Configure and authorize directly instead:",
		"  lark-cli config init --new",
		"  lark-cli auth login",
	],
};

function analyzeArgs(args) {
	let unknownFlag = false;
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--")
			return { subcommand: args[i + 1], unknownFlag };
		if (arg.startsWith("-")) {
			if (arg.includes("="))
				continue;
			if (VALUE_FLAGS.has(arg)) {
				i++;
				continue;
			}
			if (!BOOLEAN_FLAGS.has(arg))
				unknownFlag = true;
			continue;
		}
		return { subcommand: arg, unknownFlag };
	}
	return { subcommand: undefined, unknownFlag };
}

function findBlockedSubcommand(args) {
	const { subcommand, unknownFlag } = analyzeArgs(args);
	if (subcommand !== undefined && Object.hasOwn(BLOCKED, subcommand))
		return subcommand;
	if (!unknownFlag)
		return undefined;
	for (const arg of args) {
		if (arg === "--")
			break;
		if (Object.hasOwn(BLOCKED, arg))
			return arg;
	}
	return undefined;
}

function main() {
	const args = process.argv.slice(2);
	const blockedKey = findBlockedSubcommand(args);
	if (blockedKey) {
		console.error(BLOCKED[blockedKey].join("\n"));
		process.exit(1);
	}

	let runJs;
	try {
		runJs = require.resolve("@larksuite/cli/scripts/run.js");
	} catch {
		console.error(`${PKG}: cannot resolve @larksuite/cli — reinstall with: pi update npm:${PKG}`);
		process.exit(1);
	}

	const result = spawnSync(process.execPath, [runJs, ...args], {
		stdio: "inherit",
		env: {
			...process.env,
			LARKSUITE_CLI_NO_UPDATE_NOTIFIER: "1",
			LARKSUITE_CLI_NO_SKILLS_NOTIFIER: "1",
		},
	});
	process.exit(result.status ?? 1);
}

if (require.main === module)
	main();

module.exports = { BLOCKED, analyzeArgs, findBlockedSubcommand };
