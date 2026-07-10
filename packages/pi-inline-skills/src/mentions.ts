// Boundary rules follow codex: a mention starts at line start or after whitespace.
// Regexes adapted from sids/pi-extensions mention-skills (MIT).
const CURSOR_MENTION_PATTERN = /(?:^|\s)\$([a-zA-Z0-9_-]*)$/;
const GLOBAL_MENTION_PATTERN = /(?:^|(?<=\s))\$([a-zA-Z][a-zA-Z0-9_-]*)/g;

export interface CursorMention {
	token: string;
	query: string;
}

export interface MentionedSkill {
	name: string;
	path: string;
}

export function findMentionAtCursor(line: string, cursorCol: number): CursorMention | null {
	const beforeCursor = line.slice(0, cursorCol);
	const match = beforeCursor.match(CURSOR_MENTION_PATTERN);
	if (!match)
		return null;
	const query = match[1] ?? "";
	return { token: `$${query}`, query };
}

export function collectMentionedSkills(text: string, skills: Map<string, string>): MentionedSkill[] {
	const seen = new Set<string>();
	const mentioned: MentionedSkill[] = [];
	for (const match of text.matchAll(GLOBAL_MENTION_PATTERN)) {
		const name = match[1];
		if (!name || seen.has(name))
			continue;
		const path = skills.get(name);
		if (path === undefined)
			continue;
		seen.add(name);
		mentioned.push({ name, path });
	}
	return mentioned;
}
