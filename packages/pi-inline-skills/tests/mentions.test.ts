import { describe, expect, it } from "vitest";
import { collectMentionedSkills, findMentionAtCursor } from "../src/mentions.ts";

const skills = new Map([
	["blog", "/skills/blog/SKILL.md"],
	["commit", "/skills/commit/SKILL.md"],
]);

describe("findMentionAtCursor", () => {
	it("matches at line start", () => {
		expect(findMentionAtCursor("$bl", 3)).toEqual({ token: "$bl", query: "bl" });
	});

	it("matches a bare $ with empty query", () => {
		expect(findMentionAtCursor("$", 1)).toEqual({ token: "$", query: "" });
	});

	it("matches mid-line after whitespace", () => {
		expect(findMentionAtCursor("use $com", 8)).toEqual({ token: "$com", query: "com" });
	});

	it("matches after a tab", () => {
		expect(findMentionAtCursor("use\t$com", 8)).toEqual({ token: "$com", query: "com" });
	});

	it("does not match when glued to a word", () => {
		expect(findMentionAtCursor("foo$bar", 7)).toBeNull();
	});

	it("does not match after CJK without whitespace (strict codex boundary)", () => {
		expect(findMentionAtCursor("用$blog", 6)).toBeNull();
	});

	it("does not match after punctuation", () => {
		expect(findMentionAtCursor("($blog", 6)).toBeNull();
	});

	it("only inspects text before the cursor", () => {
		expect(findMentionAtCursor("$blog tail", 5)).toEqual({ token: "$blog", query: "blog" });
		expect(findMentionAtCursor("$blog tail", 10)).toBeNull();
	});
});

describe("collectMentionedSkills", () => {
	it("collects a mention at text start", () => {
		expect(collectMentionedSkills("$blog write something", skills)).toEqual([
			{ name: "blog", path: "/skills/blog/SKILL.md" },
		]);
	});

	it("collects mid-sentence and multi-line mentions", () => {
		const text = "please use $blog here\nand $commit there";
		expect(collectMentionedSkills(text, skills).map((s) => s.name)).toEqual(["blog", "commit"]);
	});

	it("ignores unknown names such as $HOME", () => {
		expect(collectMentionedSkills("echo $HOME and $unknown", skills)).toEqual([]);
	});

	it("ignores glued tokens", () => {
		expect(collectMentionedSkills("foo$blog", skills)).toEqual([]);
	});

	it("dedupes repeated mentions", () => {
		expect(collectMentionedSkills("$blog then $blog again", skills)).toHaveLength(1);
	});

	it("requires a leading letter in the name", () => {
		expect(collectMentionedSkills("costs $100 for $blog", skills).map((s) => s.name)).toEqual(["blog"]);
	});
});
