import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface InlineSkillsSettings {
	reminderDedup: boolean;
	display: boolean;
}

export function defaultSettings(): InlineSkillsSettings {
	return { reminderDedup: true, display: true };
}

const TOGGLE_KEYS = ["reminder", "display"] as const;

// Vocabulary for `/inline-skills <key> <on|off>`, also used for arg completion.
export const COMMAND_OPTIONS = TOGGLE_KEYS.flatMap((key) => ["on", "off"].map((value) => `${key} ${value}`));

// Apply a toggle command in place. Returns false when the args are malformed
// (caller shows usage); empty args are a no-op so the caller can just report state.
export function applyToggle(settings: InlineSkillsSettings, args: string): boolean {
	const [key, value] = args.trim().toLowerCase().split(/\s+/);
	if (!key)
		return true;
	if ((value !== "on" && value !== "off") || !(TOGGLE_KEYS as readonly string[]).includes(key))
		return false;
	if (key === "reminder")
		settings.reminderDedup = value === "on";
	else
		settings.display = value === "on";
	return true;
}

// User-level config, following the ecosystem convention (e.g. zentui.json lives
// in the same agent dir). These are user preferences, not per-project config.
export function configPath(): string {
	return join(getAgentDir(), "inline-skills.json");
}

export function loadSettings(): Partial<InlineSkillsSettings> {
	try {
		const parsed: unknown = JSON.parse(readFileSync(configPath(), "utf8"));
		if (typeof parsed !== "object" || parsed === null)
			return {};
		const config = parsed as Record<string, unknown>;
		const settings: Partial<InlineSkillsSettings> = {};
		if (typeof config.reminderDedup === "boolean")
			settings.reminderDedup = config.reminderDedup;
		if (typeof config.display === "boolean")
			settings.display = config.display;
		return settings;
	} catch {
		return {};
	}
}
