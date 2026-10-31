import type { BeforeAgentStartEvent, ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import piInlineSkills from "../src/index.ts";

type Handler = (event: BeforeAgentStartEvent, ctx: ExtensionContext) => unknown;

function setup(skillPath = "/unused/SKILL.md") {
	let handler: Handler | undefined;
	const getCommands = vi.fn(() => [{
		name: "skill:blog",
		source: "skill",
		sourceInfo: { path: skillPath },
	}]);
	piInlineSkills({
		registerMessageRenderer: vi.fn(),
		registerCommand: vi.fn(),
		getCommands,
		on: (name: string, callback: Handler) => {
			if (name === "before_agent_start") handler = callback;
		},
	} as unknown as ExtensionAPI);
	const ctx = {
		hasUI: false,
		sessionManager: { getEntries: () => [], getLeafId: () => null },
	} as unknown as ExtensionContext;
	return {
		getCommands,
		run: (event: object) => {
			if (!handler) throw new Error("before_agent_start handler was not registered");
			return handler(event as BeforeAgentStartEvent, ctx);
		},
	};
}

const dirs: string[] = [];
afterEach(async () => {
	await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("before_agent_start", () => {
	it("skips custom-message runs that have no prompt", async () => {
		const { run } = setup();
		await expect(run({
			type: "before_agent_start",
			messageType: "custom",
			message: { role: "custom", customType: "notification", content: "Use $blog", display: true },
		})).resolves.toBeUndefined();
	});

	it.each(["hello", ""])("does not inject skills for a prompt without mentions: %j", async (prompt) => {
		await expect(setup().run({ type: "before_agent_start", messageType: "user", prompt })).resolves.toBeUndefined();
	});

	it.each([true, false])("still injects a mentioned skill (messageType present: %s)", async (includeMessageType) => {
		const dir = await mkdtemp(join(tmpdir(), "inline-skills-event-"));
		dirs.push(dir);
		const path = join(dir, "SKILL.md");
		await writeFile(path, "---\nname: blog\ndescription: Write blogs\n---\n\n# Blog Writer\n\nWrite a blog.\n");
		const { run, getCommands } = setup(path);
		const result = await run({
			type: "before_agent_start",
			...(includeMessageType ? { messageType: "user" } : {}),
			prompt: "Use $blog",
		});
		expect(result).toMatchObject({ message: { content: expect.stringContaining("# Blog Writer") } });
		expect(getCommands).toHaveBeenCalledOnce();
	});
});
