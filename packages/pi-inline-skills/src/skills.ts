import type { SlashCommandInfo } from "@earendil-works/pi-coding-agent";

const SKILL_COMMAND_PREFIX = "skill:";

// First occurrence wins so results are deterministic across scopes.
export function collectSkills(commands: SlashCommandInfo[]): Map<string, string> {
	const skills = new Map<string, string>();
	for (const command of commands) {
		const path = command.sourceInfo?.path;
		if (command.source !== "skill" || !path || !command.name.startsWith(SKILL_COMMAND_PREFIX))
			continue;
		const name = command.name.slice(SKILL_COMMAND_PREFIX.length).trim();
		if (name.length === 0 || skills.has(name))
			continue;
		skills.set(name, path);
	}
	return skills;
}
