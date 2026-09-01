import type { AutocompleteProvider } from "@earendil-works/pi-tui";
import { describe, expect, it, vi } from "vitest";
import { buildSkillItems, createInlineSkillsProvider } from "../src/autocomplete.ts";
import { collectLoadedSkills, collectSkills } from "../src/skills.ts";

const skills = new Map([
	["blog", "/skills/blog/SKILL.md"],
	["commit", "/skills/commit/SKILL.md"],
]);
const items = buildSkillItems(skills);

function fakeBase(overrides: Partial<AutocompleteProvider> = {}): AutocompleteProvider {
	return {
		getSuggestions: vi.fn(async () => null),
		applyCompletion: vi.fn(() => ({ lines: ["base"], cursorLine: 0, cursorCol: 0 })),
		...overrides,
	} as AutocompleteProvider;
}

const options = { signal: new AbortController().signal };

describe("buildSkillItems", () => {
	it("builds $-prefixed items with the path as description", () => {
		expect(items[0]).toEqual({ value: "$blog", label: "$blog", description: "/skills/blog/SKILL.md" });
	});
});

describe("collectSkills", () => {
	it("keeps only skill commands and strips the skill: prefix", () => {
		const commands = [
			{ name: "skill:blog", source: "skill", sourceInfo: { path: "/p/blog" } },
			{ name: "skill:blog", source: "skill", sourceInfo: { path: "/dup" } },
			{ name: "commit", source: "prompt", sourceInfo: { path: "/p/tpl" } },
			{ name: "skill:broken", source: "skill", sourceInfo: {} },
		];
		const collected = collectSkills(commands as Parameters<typeof collectSkills>[0]);
		expect([...collected.entries()]).toEqual([["blog", "/p/blog"]]);
	});
});

describe("collectLoadedSkills", () => {
	it("uses authoritative loaded skill paths with first occurrence precedence", () => {
		const collected = collectLoadedSkills([
			{ name: " blog ", filePath: "/p/blog/SKILL.md" },
			{ name: "blog", filePath: "/dup/SKILL.md" },
			{ name: "", filePath: "/p/empty/SKILL.md" },
			{ name: "broken", filePath: "" },
		]);
		expect([...collected.entries()]).toEqual([["blog", "/p/blog/SKILL.md"]]);
	});

	it("returns an empty map when Pi reports no loaded skills", () => {
		expect(collectLoadedSkills(undefined).size).toBe(0);
	});
});

describe("createInlineSkillsProvider", () => {
	it("declares $ as a trigger character and keeps the base's", () => {
		const provider = createInlineSkillsProvider(fakeBase({ triggerCharacters: ["#"] }), () => items);
		expect(provider.triggerCharacters).toEqual(["$", "#"]);
	});

	it("preserves other wrappers' trigger characters when nested", () => {
		// Mirrors interactive-mode's aggregation: another extension's wrapper
		// declares '#', ours wraps on top — '#' must survive so its popup still opens.
		const hashWrapper = fakeBase({ triggerCharacters: ["#"] });
		const provider = createInlineSkillsProvider(hashWrapper, () => items);
		expect(provider.triggerCharacters).toContain("$");
		expect(provider.triggerCharacters).toContain("#");
	});

	it("returns skill items when the cursor is in a $token", async () => {
		const provider = createInlineSkillsProvider(fakeBase(), () => items);
		const result = await provider.getSuggestions(["use $bl"], 0, 7, options);
		expect(result).toEqual({ items: [items[0]], prefix: "$bl" });
	});

	it("delegates when there is no mention or nothing matches", async () => {
		const base = fakeBase();
		const provider = createInlineSkillsProvider(base, () => items);
		await provider.getSuggestions(["plain text"], 0, 10, options);
		await provider.getSuggestions(["use $zzz"], 0, 8, options);
		expect(base.getSuggestions).toHaveBeenCalledTimes(2);
	});

	it("replaces the token in place on completion", () => {
		const provider = createInlineSkillsProvider(fakeBase(), () => items);
		const applied = provider.applyCompletion(["use $bl now"], 0, 7, items[0]!, "$bl");
		expect(applied.lines).toEqual(["use $blog now"]);
		expect(applied.cursorCol).toBe(9);
	});

	it("delegates non-$ completions to the base", () => {
		const base = fakeBase();
		const provider = createInlineSkillsProvider(base, () => items);
		provider.applyCompletion(["/mod"], 0, 4, { value: "/model", label: "/model" }, "/mod");
		expect(base.applyCompletion).toHaveBeenCalledTimes(1);
	});

	it("passes optional capabilities through bound to the base", () => {
		const shouldTrigger = vi.fn(() => false);
		const base = fakeBase({ shouldTriggerFileCompletion: shouldTrigger });
		const provider = createInlineSkillsProvider(base, () => items);
		expect(provider.shouldTriggerFileCompletion?.(["x"], 0, 1)).toBe(false);
		expect(shouldTrigger).toHaveBeenCalledTimes(1);
	});
});
