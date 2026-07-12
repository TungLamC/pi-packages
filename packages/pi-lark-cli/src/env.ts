import { statSync, accessSync, constants, realpathSync } from "node:fs";
import { resolve, delimiter } from "node:path";

export type Env = Record<string, string | undefined>;

const POSIX_LAUNCHERS = ["lark-cli"];
const WINDOWS_LAUNCHERS = ["lark-cli.exe", "lark-cli.cmd", "lark-cli.bat", "lark-cli"];

export function pathKeyOf(env: Env): string {
	return Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "PATH";
}

// Symlink aliases and Windows case differences must compare equal, otherwise
// our own bin dir gets duplicated on PATH or misreported as an external CLI.
function canonicalize(path: string, windows: boolean): string {
	let resolved: string;
	try {
		resolved = realpathSync.native(path);
	} catch {
		resolved = resolve(path);
	}
	return windows ? resolved.toLowerCase() : resolved;
}

export function prependPath(env: Env, dir: string, platform: string = process.platform): boolean {
	const windows = platform === "win32";
	const key = pathKeyOf(env);
	const entries = (env[key] ?? "").split(delimiter).filter(Boolean);
	const canonical = canonicalize(dir, windows);
	if (entries.length > 0 && canonicalize(entries[0], windows) === canonical)
		return false;
	const rest = entries.filter((entry) => canonicalize(entry, windows) !== canonical);
	env[key] = [dir, ...rest].join(delimiter);
	return true;
}

export function removePath(env: Env, dir: string, platform: string = process.platform): boolean {
	const windows = platform === "win32";
	const key = pathKeyOf(env);
	const entries = (env[key] ?? "").split(delimiter).filter(Boolean);
	const canonical = canonicalize(dir, windows);
	const rest = entries.filter((entry) => canonicalize(entry, windows) !== canonical);
	if (rest.length === entries.length)
		return false;
	env[key] = rest.join(delimiter);
	return true;
}

function isExecutableFile(path: string, windows: boolean): boolean {
	try {
		if (!statSync(path).isFile())
			return false;
		if (!windows)
			accessSync(path, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

export function findExternalLarkCli(env: Env, ownBinDir: string, platform: string = process.platform): string | null {
	const windows = platform === "win32";
	const names = windows ? WINDOWS_LAUNCHERS : POSIX_LAUNCHERS;
	const canonicalOwn = canonicalize(ownBinDir, windows);
	const entries = (env[pathKeyOf(env)] ?? "").split(delimiter).filter(Boolean);
	for (const entry of entries) {
		if (canonicalize(entry, windows) === canonicalOwn)
			continue;
		for (const name of names) {
			const candidate = resolve(entry, name);
			if (isExecutableFile(candidate, windows))
				return candidate;
		}
	}
	return null;
}
