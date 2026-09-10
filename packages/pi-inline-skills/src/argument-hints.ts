import type { CustomEditor } from "@earendil-works/pi-coding-agent";
import type { EditorComponent } from "@earendil-works/pi-tui";
import { parseFrontmatter } from "@earendil-works/pi-coding-agent";
import { CURSOR_MARKER, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { readFileSync } from "node:fs";
import { stripVTControlCharacters } from "node:util";
import { findMentionAtCursor } from "./mentions.ts";

export function loadArgumentHints(skills: Map<string, string>): Map<string, string> {
	const hints = new Map<string, string>();
	for (const [name, path] of skills) {
		try {
			const { frontmatter } = parseFrontmatter<{ "argument-hint"?: unknown }>(readFileSync(path, "utf8"));
			const raw = frontmatter["argument-hint"];
			const hint = typeof raw === "string" ? stripVTControlCharacters(raw).replace(/[\x00-\x1f\x7f-\x9f\s]+/g, " ").trim() : "";
			if (hint)
				hints.set(name, hint);
		} catch {
			// Optional metadata must not break skill completion or execution.
		}
	}
	return hints;
}

type HintableEditor = EditorComponent & Pick<CustomEditor, "focused" | "getCursor" | "getLines" | "getPaddingX">;

export function withArgumentHints(
	editor: EditorComponent,
	getHints: () => Map<string, string>,
	dim: (text: string) => string,
): EditorComponent {
	const target = editor as Partial<HintableEditor>;
	if (typeof target.getCursor !== "function" || typeof target.getLines !== "function" || typeof target.getPaddingX !== "function")
		return editor;
	const hintable = editor as HintableEditor;
	const render = editor.render.bind(editor);
	editor.render = (width) => {
		const rows = render(width);
		if (!hintable.focused)
			return rows;
		const lines = hintable.getLines();
		const cursor = hintable.getCursor();
		const line = lines[cursor.line] ?? "";
		if (cursor.line !== lines.length - 1 || cursor.col !== line.length)
			return rows;
		const trimmed = line.trimEnd();
		const mention = findMentionAtCursor(trimmed, trimmed.length);
		const hint = mention && getHints().get(mention.query);
		if (!hint)
			return rows;

		// Use the real cursor row, not a fixed row index: wrappers can add borders.
		// Replace only trailing blank cells; never change the buffer or cursor marker.
		const cursorCell = `${CURSOR_MARKER}\x1b[7m \x1b[0m`;
		const rowIndex = rows.findIndex(row => row.includes(cursorCell));
		if (rowIndex < 0)
			return rows;
		const row = rows[rowIndex]!;
		const start = row.indexOf(cursorCell) + cursorCell.length;
		const spaces = row.slice(start).match(/^ */)?.[0].length ?? 0;
		const available = Math.max(0, spaces - hintable.getPaddingX());
		if (available === 0)
			return rows;
		const text = truncateToWidth(hint, available);
		rows[rowIndex] = row.slice(0, start) + dim(text) + row.slice(start + visibleWidth(text));
		return rows;
	};
	return editor;
}
