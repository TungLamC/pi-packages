import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, afterAll } from "vitest";
import { bumpPatch, compareVersions, parseFrontmatter, validateSkillsTree, assertValidVersion, collectMarkdownLinks } from "../scripts/sync-upstream.mjs";

const fixtures: string[] = [];

function makeSkillsDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "pi-lark-cli-skills-"));
	fixtures.push(dir);
	return dir;
}

function addSkill(dir: string, folder: string, name = folder): void {
	mkdirSync(join(dir, folder), { recursive: true });
	writeFileSync(join(dir, folder, "SKILL.md"), `---\nname: ${name}\ndescription: "test skill"\n---\n\n# ${name}\n`);
}

afterAll(() => {
	for (const dir of fixtures)
		rmSync(dir, { recursive: true, force: true });
});

describe("version helpers", () => {
	it("accepts X.Y.Z and rejects anything else", () => {
		expect(() => assertValidVersion("1.0.68")).not.toThrow();
		for (const bad of ["v1.0.68", "1.0", "1.0.68-pi.1", "1.0.68;rm -rf /", ""])
			expect(() => assertValidVersion(bad)).toThrow();
	});

	it("compares and bumps", () => {
		expect(compareVersions("1.0.68", "1.0.67")).toBeGreaterThan(0);
		expect(compareVersions("1.0.68", "1.1.0")).toBeLessThan(0);
		expect(compareVersions("1.0.68", "1.0.68")).toBe(0);
		expect(bumpPatch("0.1.9")).toBe("0.1.10");
	});
});

describe("parseFrontmatter", () => {
	it("extracts name and description", () => {
		const fields = parseFrontmatter('---\nname: lark-base\ndescription: "Base ops"\n---\n# x');
		expect(fields).toMatchObject({ name: "lark-base", description: "Base ops" });
	});

	it("returns null without frontmatter", () => {
		expect(parseFrontmatter("# no frontmatter")).toBeNull();
	});
});

describe("collectMarkdownLinks", () => {
	it("keeps relative links, drops urls/anchors/absolute and fragments", () => {
		const md = "[a](./x.md) [b](https://e.com) [c](#top) [d](/abs) [e](ref/y.md#sec)";
		expect(collectMarkdownLinks(md)).toEqual(["./x.md", "ref/y.md"]);
	});

	it("ignores pseudo-links inside fenced blocks and inline code", () => {
		const md = [
			"[real](./x.md)",
			"```json",
			'{"content":"![img](img_xxx) ![f](./a.png)"}',
			"```",
			"and `![inline](img_key)` too",
		].join("\n");
		expect(collectMarkdownLinks(md)).toEqual(["./x.md"]);
	});
});

describe("validateSkillsTree", () => {
	it("passes a valid tree and reports broken links as warnings", () => {
		const dir = makeSkillsDir();
		addSkill(dir, "lark-a");
		addSkill(dir, "lark-b");
		writeFileSync(join(dir, "lark-a", "extra.md"), "[ok](./SKILL.md) [broken](./missing.md)");
		const report = validateSkillsTree(dir);
		expect(report.skillCount).toBe(2);
		expect(report.warnings).toHaveLength(1);
		expect(report.warnings[0]).toContain("missing.md");
	});

	it("flags links escaping the tree, including prefix-collision siblings", () => {
		const parent = makeSkillsDir();
		const dir = join(parent, "skills");
		mkdirSync(dir);
		addSkill(dir, "lark-a");
		mkdirSync(join(parent, "skills-escape"));
		writeFileSync(join(parent, "skills-escape", "target.md"), "outside");
		writeFileSync(join(dir, "lark-a", "extra.md"), "[out](../../skills-escape/target.md)");
		const report = validateSkillsTree(dir);
		expect(report.warnings).toHaveLength(1);
		expect(report.warnings[0]).toContain("escapes");
	});

	it("throws on missing SKILL.md", () => {
		const dir = makeSkillsDir();
		addSkill(dir, "lark-a");
		mkdirSync(join(dir, "empty-skill"));
		expect(() => validateSkillsTree(dir)).toThrow(/missing SKILL.md/);
	});

	it("throws on duplicate skill names", () => {
		const dir = makeSkillsDir();
		addSkill(dir, "lark-a", "dup");
		addSkill(dir, "lark-b", "dup");
		expect(() => validateSkillsTree(dir)).toThrow(/duplicate skill name/);
	});

	it("throws on symlinks", () => {
		const dir = makeSkillsDir();
		addSkill(dir, "lark-a");
		symlinkSync(join(dir, "lark-a", "SKILL.md"), join(dir, "lark-a", "alias.md"));
		expect(() => validateSkillsTree(dir)).toThrow(/symlink/);
	});

	it("throws on an empty tree", () => {
		expect(() => validateSkillsTree(makeSkillsDir())).toThrow(/no skill directories/);
	});
});

describe("vendored skills tree", () => {
	it("is loadable: every skill has valid frontmatter and unique name", () => {
		const skillsDir = fileURLToPath(new URL("../skills", import.meta.url));
		const report = validateSkillsTree(skillsDir);
		expect(report.skillCount).toBeGreaterThanOrEqual(20);
	});
});
