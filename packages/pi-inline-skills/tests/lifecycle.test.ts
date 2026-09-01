import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AutocompleteProvider } from "@earendil-works/pi-tui";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import piInlineSkills from "../src/index.ts";
import { INLINE_SKILLS_TYPE } from "../src/message.ts";

type EventHandler = (event: any, ctx: any) => unknown;

function createMockPi(getCommands: () => any[]) {
	const events = new Map<string, EventHandler[]>();
	const commands = new Map<string, { handler: (args: string, ctx: any) => Promise<void> }>();
	const pi = {
		getCommands,
		on: vi.fn((event: string, handler: EventHandler) => {
			const handlers = events.get(event) ?? [];
			handlers.push(handler);
			events.set(event, handlers);
		}),
		registerCommand: vi.fn((name: string, command: { handler: (args: string, ctx: any) => Promise<void> }) => {
			commands.set(name, command);
		}),
		registerMessageRenderer: vi.fn(),
	} as unknown as ExtensionAPI;
	return { pi, events, commands };
}

function createSessionContext() {
	let provider: AutocompleteProvider | undefined;
	const ctx = {
		hasUI: true,
		ui: {
			addAutocompleteProvider: vi.fn((wrap: (base: AutocompleteProvider) => AutocompleteProvider) => {
				provider = wrap({
					getSuggestions: vi.fn(async () => null),
					applyCompletion: vi.fn(),
				} as AutocompleteProvider);
			}),
			notify: vi.fn(),
		},
		sessionManager: {
			getEntries: () => [],
			getLeafId: () => undefined,
		},
	};
	return { ctx, getProvider: () => provider };
}

function beforeAgentEvent(prompt: string, skills: Array<{ name: string; filePath: string }> = []) {
	return {
		prompt,
		systemPrompt: "",
		systemPromptOptions: { cwd: process.cwd(), skills },
	};
}

async function writeSkill(name: string, body: string): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "pi-inline-skills-lifecycle-"));
	const path = join(dir, "SKILL.md");
	await writeFile(path, `---\nname: ${name}\n---\n\n${body}\n`, "utf8");
	return path;
}

const staleError = () => new Error(
	"This extension ctx is stale after session replacement or reload. Do not use a captured pi or command ctx after ctx.reload().",
);

const options = { signal: new AbortController().signal };

describe("inline-skills lifecycle", () => {
	it("provides immediate autocomplete when command discovery is healthy", async () => {
		const { pi, events } = createMockPi(() => [
			{ name: "skill:blog", source: "skill", sourceInfo: { path: "/p/blog/SKILL.md" } },
		]);
		piInlineSkills(pi);
		const { ctx, getProvider } = createSessionContext();
		events.get("session_start")?.[0]?.({}, ctx);

		const result = await getProvider()?.getSuggestions(["use $bl"], 0, 7, options);
		expect(result).toMatchObject({ prefix: "$bl", items: [{ value: "$blog" }] });
	});

	it("continues session setup when command discovery uses a stale runtime", async () => {
		const { pi, events } = createMockPi(() => {
			throw staleError();
		});
		piInlineSkills(pi);
		const { ctx, getProvider } = createSessionContext();

		expect(() => events.get("session_start")?.[0]?.({}, ctx)).not.toThrow();
		expect(ctx.ui.addAutocompleteProvider).toHaveBeenCalledTimes(1);
		expect(await getProvider()?.getSuggestions(["use $bl"], 0, 7, options)).toBeNull();
	});

	it("ignores a stale command refresh during resource discovery", () => {
		const { pi, events } = createMockPi(() => {
			throw staleError();
		});
		piInlineSkills(pi);
		expect(() => events.get("resources_discover")?.[0]?.({}, {})).not.toThrow();
	});

	it("recovers from stale discovery using authoritative loaded skills", async () => {
		const path = await writeSkill("blog", "# Blog Writer");
		const { pi, events } = createMockPi(() => {
			throw staleError();
		});
		piInlineSkills(pi);
		const { ctx, getProvider } = createSessionContext();
		events.get("session_start")?.[0]?.({}, ctx);

		const result = await events.get("before_agent_start")?.[0]?.(
			beforeAgentEvent("Use $blog", [{ name: "blog", filePath: path }]),
			ctx,
		);
		expect(result).toMatchObject({
			message: {
				customType: INLINE_SKILLS_TYPE,
				details: { skills: [{ name: "blog", mode: "full" }] },
			},
		});
		const suggestions = await getProvider()?.getSuggestions(["use $bl"], 0, 7, options);
		expect(suggestions).toMatchObject({ items: [{ description: path }] });
	});

	it("replaces obsolete command-derived skills with the authoritative list", async () => {
		const freshPath = await writeSkill("fresh", "# Fresh Skill");
		const { pi, events } = createMockPi(() => [
			{ name: "skill:stale", source: "skill", sourceInfo: { path: "/old/SKILL.md" } },
		]);
		piInlineSkills(pi);
		const { ctx, getProvider } = createSessionContext();
		events.get("session_start")?.[0]?.({}, ctx);
		await events.get("before_agent_start")?.[0]?.(
			beforeAgentEvent("plain prompt", [{ name: "fresh", filePath: freshPath }]),
			ctx,
		);

		expect(await getProvider()?.getSuggestions(["use $st"], 0, 7, options)).toBeNull();
		expect(await getProvider()?.getSuggestions(["use $fr"], 0, 7, options)).toMatchObject({
			items: [{ value: "$fresh", description: freshPath }],
		});
	});

	it("rethrows non-stale command discovery errors", () => {
		const { pi, events } = createMockPi(() => {
			throw new Error("command registry failed");
		});
		piInlineSkills(pi);
		const { ctx } = createSessionContext();
		expect(() => events.get("session_start")?.[0]?.({}, ctx)).toThrow("command registry failed");
	});
});
