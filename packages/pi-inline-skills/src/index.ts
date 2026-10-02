import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem } from "@earendil-works/pi-tui";
import type { InlineSkillsSettings } from "./settings.ts";
import { buildSessionContext } from "@earendil-works/pi-coding-agent";
import { buildSkillItems, createInlineSkillsProvider } from "./autocomplete.ts";
import { buildInjection, collectPreviousFull } from "./injection.ts";
import { collectMentionedSkills } from "./mentions.ts";
import { createInlineSkillsMessage, renderInlineSkillsMessage, INLINE_SKILLS_TYPE } from "./message.ts";
import { collectLoadedSkills, collectSkills } from "./skills.ts";
import { applyToggle, COMMAND_OPTIONS, defaultSettings, loadSettings } from "./settings.ts";

const STALE_EXTENSION_CONTEXT_MESSAGE = "This extension ctx is stale after session replacement or reload";

function isStaleExtensionContextError(error: unknown): boolean {
	return error instanceof Error && error.message.includes(STALE_EXTENSION_CONTEXT_MESSAGE);
}

export default function piInlineSkills(pi: ExtensionAPI): void {
	// getCommands() throws before the core binds; only read it inside events.
	let skills = new Map<string, string>();
	let items: AutocompleteItem[] = [];
	const settings: InlineSkillsSettings = defaultSettings();

	function replaceSkills(nextSkills: Map<string, string>): void {
		skills = nextSkills;
		items = buildSkillItems(skills);
	}

	function refreshFromCommands(): void {
		try {
			replaceSkills(collectSkills(pi.getCommands()));
		} catch (error) {
			if (!isStaleExtensionContextError(error))
				throw error;
			// Do not retain paths from a session or cwd whose runtime was replaced.
			replaceSkills(new Map());
		}
	}

	pi.registerMessageRenderer(INLINE_SKILLS_TYPE, renderInlineSkillsMessage);

	pi.registerCommand("inline-skills", {
		description: "Toggle inline-skills options: reminder|display on|off",
		getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
			const filtered = COMMAND_OPTIONS.filter((option) => option.startsWith(prefix.toLowerCase()));
			return filtered.length > 0 ? filtered.map((option) => ({ value: option, label: option })) : null;
		},
		handler: async (args, ctx) => {
			if (!applyToggle(settings, args)) {
				ctx.ui.notify("Usage: /inline-skills reminder|display on|off", "warning");
				return;
			}
			ctx.ui.notify(`inline-skills: reminder ${settings.reminderDedup ? "on" : "off"}, display ${settings.display ? "on" : "off"}`, "info");
		},
	});

	pi.on("session_start", (_event, ctx) => {
		refreshFromCommands();
		// Reset then apply user config so a prior session's runtime toggles
		// never leak (session_start fires on startup/reload/new/resume/fork).
		// Config is a user-owned file in the agent dir — no project trust needed.
		Object.assign(settings, defaultSettings(), loadSettings());
		if (ctx.hasUI)
			ctx.ui.addAutocompleteProvider((current) => createInlineSkillsProvider(current, () => items));
	});

	// Best-effort refresh so the $ popup reflects reloaded skills. It cannot be
	// authoritative: discovered skill paths are applied only after every
	// resources_discover handler returns, so getCommands() is still stale here.
	pi.on("resources_discover", () => {
		refreshFromCommands();
	});

	pi.on("before_agent_start", async (event, ctx) => {
		// This event carries Pi's authoritative post-discovery skill list and
		// avoids calling a captured ExtensionAPI after session replacement.
		replaceSkills(collectLoadedSkills(event.systemPromptOptions.skills));
		const mentioned = collectMentionedSkills(event.prompt, skills);
		if (mentioned.length === 0)
			return undefined;
		const previousFull = settings.reminderDedup
			? collectPreviousFull(buildSessionContext(ctx.sessionManager.getEntries(), ctx.sessionManager.getLeafId()).messages)
			: null;
		const notify = ctx.hasUI ? (message: string) => ctx.ui.notify(message, "warning") : undefined;
		const result = await buildInjection(mentioned, { previousFull, notify });
		if (!result)
			return undefined;
		return { message: createInlineSkillsMessage(result.content, result.skills, settings.display) };
	});
}
