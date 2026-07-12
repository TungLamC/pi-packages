#!/usr/bin/env node
// Vendors the skills/ tree from github.com/larksuite/cli at a release tag and
// pins that version in package.json. POSIX-only (relies on git/cp); runs
// locally and in the sync workflow.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, lstatSync, existsSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { sep, join, dirname, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const UPSTREAM_REPO = "https://github.com/larksuite/cli.git";
const MAX_FILES = 2000;
const MAX_BYTES = 20 * 1024 * 1024;

export function assertValidVersion(version) {
	if (!/^\d+\.\d+\.\d+$/.test(version))
		throw new Error(`invalid upstream version: ${JSON.stringify(version)} (expected X.Y.Z)`);
}

export function compareVersions(a, b) {
	const pa = a.split(".").map(Number);
	const pb = b.split(".").map(Number);
	for (let i = 0; i < 3; i++)
		if (pa[i] !== pb[i])
			return pa[i] - pb[i];
	return 0;
}

export function bumpPatch(version) {
	const [major, minor, patch] = version.split(".").map(Number);
	return `${major}.${minor}.${patch + 1}`;
}

export function parseFrontmatter(markdown) {
	const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!match)
		return null;
	const fields = {};
	for (const line of match[1].split("\n")) {
		const kv = line.match(/^(\w+):\s*(.*)$/);
		if (kv)
			fields[kv[1]] = kv[2].replace(/^["']|["']\s*$/g, "").trim();
	}
	return fields;
}

function walkFiles(dir) {
	const files = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (lstatSync(path).isSymbolicLink())
			throw new Error(`symlink not allowed in skills tree: ${path}`);
		if (entry.isDirectory())
			files.push(...walkFiles(path));
		else
			files.push(path);
	}
	return files;
}

// Fenced blocks and inline code are full of illustrative pseudo-links
// (img_xxx, ./a.png); only prose links are worth checking.
export function stripCodeSegments(markdown) {
	return markdown.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
}

export function collectMarkdownLinks(markdown) {
	const links = [];
	for (const match of stripCodeSegments(markdown).matchAll(/\]\(([^)\s]+)\)/g)) {
		const target = match[1];
		if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("#") || target.startsWith("/"))
			continue;
		links.push(target.split("#")[0]);
	}
	return links.filter(Boolean);
}

export function validateSkillsTree(skillsDir) {
	const warnings = [];
	const names = new Map();
	const skillDirs = readdirSync(skillsDir, { withFileTypes: true }).filter((e) => e.isDirectory());
	if (skillDirs.length === 0)
		throw new Error(`no skill directories found under ${skillsDir}`);
	for (const entry of skillDirs) {
		const skillPath = join(skillsDir, entry.name);
		const skillMd = join(skillPath, "SKILL.md");
		if (!existsSync(skillMd))
			throw new Error(`missing SKILL.md in ${skillPath}`);
		const fields = parseFrontmatter(readFileSync(skillMd, "utf8"));
		if (!fields?.name || !fields?.description)
			throw new Error(`SKILL.md missing name/description frontmatter: ${skillMd}`);
		if (names.has(fields.name))
			throw new Error(`duplicate skill name "${fields.name}" in ${skillPath} and ${names.get(fields.name)}`);
		names.set(fields.name, skillPath);
	}
	const files = walkFiles(skillsDir);
	if (files.length > MAX_FILES)
		throw new Error(`skills tree has ${files.length} files (budget ${MAX_FILES})`);
	const totalBytes = files.reduce((sum, f) => sum + statSync(f).size, 0);
	if (totalBytes > MAX_BYTES)
		throw new Error(`skills tree is ${totalBytes} bytes (budget ${MAX_BYTES})`);
	const root = resolve(skillsDir);
	for (const file of files) {
		if (!file.endsWith(".md"))
			continue;
		for (const link of collectMarkdownLinks(readFileSync(file, "utf8"))) {
			const target = resolve(dirname(file), link);
			const rel = relative(root, target);
			if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel))
				warnings.push(`link escapes skills tree: ${relative(skillsDir, file)} -> ${link}`);
			else if (!existsSync(target))
				warnings.push(`broken link: ${relative(skillsDir, file)} -> ${link}`);
		}
	}
	return { skillCount: skillDirs.length, fileCount: files.length, totalBytes, warnings };
}

function run(command, args, opts = {}) {
	execFileSync(command, args, { stdio: "inherit", ...opts });
}

function main() {
	const version = process.argv[2];
	if (!version) {
		console.error("usage: sync-upstream.mjs <upstream-version>  (e.g. 1.0.68)");
		process.exit(2);
	}
	assertValidVersion(version);

	const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
	const manifestPath = join(packageRoot, "package.json");
	const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
	const previous = manifest.larkCliVersion;
	assertValidVersion(previous);
	if (compareVersions(version, previous) < 0)
		throw new Error(`downgrade refused: ${previous} -> ${version}`);

	const cloneDir = mkdtempSync(join(tmpdir(), "lark-cli-upstream-"));
	try {
		run("git", ["clone", "--quiet", "--depth", "1", "--branch", `v${version}`, UPSTREAM_REPO, cloneDir]);
		const upstreamSkills = join(cloneDir, "skills");
		const report = validateSkillsTree(upstreamSkills);

		const targetSkills = join(packageRoot, "skills");
		rmSync(targetSkills, { recursive: true, force: true });
		run("cp", ["-a", upstreamSkills, targetSkills]);

		const upstreamLicense = join(cloneDir, "LICENSE");
		if (!existsSync(upstreamLicense))
			throw new Error("upstream LICENSE not found; investigate before syncing");
		run("cp", [upstreamLicense, join(packageRoot, "UPSTREAM_LICENSE")]);
		if (existsSync(join(cloneDir, "NOTICE")))
			report.warnings.push("upstream added a NOTICE file; review whether it must ship in the tarball");

		const piVersionOld = manifest.version;
		if (version !== previous)
			manifest.version = bumpPatch(manifest.version);
		manifest.larkCliVersion = version;
		manifest.dependencies["@larksuite/cli"] = version;
		writeFileSync(manifestPath, JSON.stringify(manifest, null, "\t") + "\n");

		for (const warning of report.warnings)
			console.warn(`WARN ${warning}`);
		console.log(JSON.stringify({
			larkCliVersion: { old: previous, new: version },
			piVersion: { old: piVersionOld, new: manifest.version },
			skills: report.skillCount,
			files: report.fileCount,
			bytes: report.totalBytes,
			warnings: report.warnings.length,
		}));
		if (version !== previous)
			console.error("note: run `npm install` at the repo root to refresh package-lock.json");
	} finally {
		rmSync(cloneDir, { recursive: true, force: true });
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
	main();
