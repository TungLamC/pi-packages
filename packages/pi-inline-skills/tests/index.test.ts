import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import piInlineSkills from "../src/index.ts";

it("ignores custom turns with skill mentions and still injects user prompts", async () => {
	const dir = await realpath(await mkdtemp(join(tmpdir(), "inline-skills-turn-")));
	try {
		const path = join(dir, "SKILL.md");
		await writeFile(path, "# Probe\n\nUse the probe skill.\n");
		const on = vi.fn();
		piInlineSkills({
			on,
			registerCommand: vi.fn(),
			registerMessageRenderer: vi.fn(),
			getCommands: () => [{ name: "skill:probe", source: "skill", sourceInfo: { path } }],
		} as unknown as ExtensionAPI);
		const handler = on.mock.calls.find(([name]) => name === "before_agent_start")?.[1];
		const ctx = { hasUI: false, sessionManager: SessionManager.inMemory(dir) };
		const base = { type: "before_agent_start", systemPrompt: "", systemPromptOptions: {} };
		expect(await handler({ ...base, messageType: "custom", message: { role: "custom", customType: "notification", content: "$probe", display: false } }, ctx)).toBeUndefined();
		for (const event of [{ ...base, messageType: "user", prompt: "$probe" }, { ...base, prompt: "$probe" }]) {
			const result = await handler(event, ctx);
			expect(result.message.customType).toBe("inline-skills");
			expect(result.message.content).toBe(`<skill>\n<name>probe</name>\n<path>${path}</path>\n# Probe\n\nUse the probe skill.\n</skill>`);
		}
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
