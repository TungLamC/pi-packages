import { mkdtemp, realpath, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildInjection, buildSkillBlock, collectPreviousFull, escapeXml, fingerprint } from "../src/injection.ts";
import { INLINE_SKILLS_TYPE } from "../src/message.ts";

async function writeSkill(name: string, content: string): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "psm-"));
	const path = join(dir, `${name}.md`);
	await writeFile(path, content, "utf8");
	return path;
}

const SKILL_MD = `---\nname: blog\ndescription: write blogs\n---\n\n# Blog Writer\n\nUse scripts/write.py.\n`;

describe("buildSkillBlock", () => {
	it("matches the codex fragment shape", () => {
		expect(buildSkillBlock("blog", "/p/SKILL.md", "body")).toBe(
			"<skill>\n<name>blog</name>\n<path>/p/SKILL.md</path>\nbody\n</skill>",
		);
	});

	it("escapes xml metadata", () => {
		expect(escapeXml('a<b>&"c')).toBe("a&lt;b&gt;&amp;&quot;c");
		expect(buildSkillBlock("a<b", "/p", "body")).toContain("<name>a&lt;b</name>");
	});
});

describe("buildInjection", () => {
	it("strips frontmatter and extracts the H1 label", async () => {
		const path = await writeSkill("blog", SKILL_MD);
		const result = await buildInjection([{ name: "blog", path }], { previousFull: null });
		expect(result).toBeDefined();
		expect(result?.content).not.toContain("description: write blogs");
		expect(result?.content).toContain("# Blog Writer");
		expect(result?.skills[0]).toMatchObject({ name: "blog", mode: "full", label: "Blog Writer" });
		expect(result?.skills[0]?.tokenCount).toBeGreaterThan(0);
	});

	it("falls back to $name when there is no H1", async () => {
		const path = await writeSkill("plain", "just text\n");
		const result = await buildInjection([{ name: "plain", path }], { previousFull: null });
		expect(result?.skills[0]?.label).toBe("$plain");
	});

	it("joins multiple skills into one content string", async () => {
		const a = await writeSkill("a", "# A\n");
		const b = await writeSkill("b", "# B\n");
		const result = await buildInjection(
			[{ name: "a", path: a }, { name: "b", path: b }],
			{ previousFull: null },
		);
		expect(result?.skills).toHaveLength(2);
		expect(result?.content.match(/<skill>/g)).toHaveLength(2);
	});

	it("downgrades to reminder when the recorded fingerprint matches", async () => {
		const path = await writeSkill("blog", SKILL_MD);
		const { mtimeMs, size } = await stat(path);
		const real = await realpath(path);
		const result = await buildInjection(
			[{ name: "blog", path }],
			{ previousFull: new Map([["blog", fingerprint(real, mtimeMs, size)]]) },
		);
		expect(result?.skills[0]?.mode).toBe("reminder");
		expect(result?.content).toContain("Reminder to use $blog.");
		expect(result?.content).not.toContain("# Blog Writer");
	});

	it("re-injects in full when the file changed since the recorded fingerprint", async () => {
		const path = await writeSkill("blog", SKILL_MD);
		const result = await buildInjection(
			[{ name: "blog", path }],
			{ previousFull: new Map([["blog", fingerprint("/other", 12345, 6)]]) },
		);
		expect(result?.skills[0]?.mode).toBe("full");
	});

	it("re-injects in full when a different file shares the recorded mtime", async () => {
		const path = await writeSkill("blog", SKILL_MD);
		const { mtimeMs } = await stat(path);
		// Same name + mtime but a stale path / different size must not dedup.
		const result = await buildInjection(
			[{ name: "blog", path }],
			{ previousFull: new Map([["blog", fingerprint("/stale/SKILL.md", mtimeMs, 999)]]) },
		);
		expect(result?.skills[0]?.mode).toBe("full");
	});

	it("stays full when dedup is disabled", async () => {
		const path = await writeSkill("blog", SKILL_MD);
		const { mtimeMs, size } = await stat(path);
		const real = await realpath(path);
		const withDedup = await buildInjection([{ name: "blog", path }], { previousFull: new Map([["blog", fingerprint(real, mtimeMs, size)]]) });
		const withoutDedup = await buildInjection([{ name: "blog", path }], { previousFull: null });
		expect(withDedup?.skills[0]?.mode).toBe("reminder");
		expect(withoutDedup?.skills[0]?.mode).toBe("full");
	});

	it("preserves indentation within the body (e.g. code blocks)", async () => {
		const path = await writeSkill("indented", "---\nname: indented\n---\n\n# Title\n\n    indented code line\n\nafter\n");
		const result = await buildInjection([{ name: "indented", path }], { previousFull: null });
		expect(result?.content).toContain("    indented code line");
	});

	it("skips unreadable skills, notifies, and keeps the rest", async () => {
		const ok = await writeSkill("ok", "# Ok\n");
		const warnings: string[] = [];
		const result = await buildInjection(
			[{ name: "gone", path: "/nonexistent/SKILL.md" }, { name: "ok", path: ok }],
			{ previousFull: null, notify: (m) => warnings.push(m) },
		);
		expect(result?.skills.map((s) => s.name)).toEqual(["ok"]);
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain('"gone"');
	});

	it("returns undefined when every skill fails", async () => {
		const result = await buildInjection([{ name: "gone", path: "/nonexistent/SKILL.md" }], { previousFull: null });
		expect(result).toBeUndefined();
	});

	it("notifies failures in mention order despite parallel loading", async () => {
		const warnings: string[] = [];
		await buildInjection(
			[{ name: "alpha", path: "/nonexistent/a" }, { name: "beta", path: "/nonexistent/b" }],
			{ previousFull: null, notify: (m) => warnings.push(m) },
		);
		expect(warnings.map((w) => w.match(/"(\w+)"/)?.[1])).toEqual(["alpha", "beta"]);
	});
});

describe("collectPreviousFull", () => {
	const fullMessage = (name: string, mtimeMs: number, mode = "full") => ({
		role: "custom",
		customType: INLINE_SKILLS_TYPE,
		details: { skills: [{ name, path: `/p/${name}`, mode, label: name, mtimeMs, size: 10, tokenCount: 1 }] },
	});

	it("collects full injections from own custom messages only", () => {
		const messages = [
			{ role: "user", content: "hi" },
			fullMessage("blog", 111),
			{ role: "custom", customType: "other", details: { skills: [{ name: "x", mode: "full", path: "/x", mtimeMs: 5, size: 1 }] } },
		];
		const full = collectPreviousFull(messages);
		expect(full.get("blog")).toBe(fingerprint("/p/blog", 111, 10));
		expect(full.has("x")).toBe(false);
	});

	it("ignores reminder records and lets the latest full win", () => {
		const messages = [fullMessage("blog", 111), fullMessage("blog", 222), fullMessage("blog", 0, "reminder")];
		expect(collectPreviousFull(messages).get("blog")).toBe(fingerprint("/p/blog", 222, 10));
	});

	it("returns empty for an empty or foreign context (compaction self-heal)", () => {
		expect(collectPreviousFull([]).size).toBe(0);
		expect(collectPreviousFull([{ role: "assistant", content: [] }]).size).toBe(0);
	});

	it("ignores malformed details without throwing", () => {
		const messages = [
			{ role: "custom", customType: INLINE_SKILLS_TYPE, details: null },
			{ role: "custom", customType: INLINE_SKILLS_TYPE, details: { skills: "not-an-array" } },
			{ role: "custom", customType: INLINE_SKILLS_TYPE, details: { skills: [{ name: "blog", mode: "full" }] } },
			{ role: "custom", customType: INLINE_SKILLS_TYPE },
		];
		expect(() => collectPreviousFull(messages)).not.toThrow();
		expect(collectPreviousFull(messages).size).toBe(0);
	});
});
