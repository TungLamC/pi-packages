import type { AutocompleteItem, AutocompleteProvider } from "@earendil-works/pi-tui";
import { findMentionAtCursor } from "./mentions.ts";

export function buildSkillItems(skills: Map<string, string>): AutocompleteItem[] {
	const items: AutocompleteItem[] = [];
	for (const [name, path] of skills)
		items.push({ value: `$${name}`, label: `$${name}`, description: path });
	return items;
}

export function createInlineSkillsProvider(base: AutocompleteProvider, getItems: () => AutocompleteItem[]): AutocompleteProvider {
	const provider: AutocompleteProvider = {
		triggerCharacters: ["$", ...(base.triggerCharacters ?? [])],

		async getSuggestions(lines, cursorLine, cursorCol, options) {
			const line = lines[cursorLine] ?? "";
			const mention = findMentionAtCursor(line, cursorCol);
			if (mention) {
				const query = mention.query.toLowerCase();
				const items = getItems().filter((item) => query === "" || item.label.toLowerCase().includes(query));
				if (items.length > 0)
					return { items, prefix: mention.token };
			}
			return base.getSuggestions(lines, cursorLine, cursorCol, options);
		},

		applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
			if (!prefix.startsWith("$"))
				return base.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
			const line = lines[cursorLine] ?? "";
			const startCol = cursorCol - prefix.length;
			const newLine = line.slice(0, startCol) + item.value + line.slice(cursorCol);
			const newLines = [...lines];
			newLines[cursorLine] = newLine;
			return { lines: newLines, cursorLine, cursorCol: startCol + item.value.length };
		},
	};

	// Preserve the base's optional Tab/file-completion capability through the wrap.
	if (base.shouldTriggerFileCompletion)
		provider.shouldTriggerFileCompletion = base.shouldTriggerFileCompletion.bind(base);
	return provider;
}
