import { CURSOR_MARKER, Editor, type EditorTheme, type TUI, visibleWidth } from "@earendil-works/pi-tui";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { describe, expect, it, vi } from "vitest";
import { loadArgumentHints, withArgumentHints } from "../src/argument-hints.ts";

const identity = (text: string) => text;
const theme: EditorTheme = {
	borderColor: identity,
	selectList: { selectedPrefix: identity, selectedText: identity, description: identity, scrollInfo: identity, noMatch: identity },
};
const hints = new Map([["review", "<target> [focus]"]]);
const dim = (text: string) => `\x1b[2m${text}\x1b[22m`;
function createEditor(text: string): Editor {
	const tui = { requestRender: vi.fn(), terminal: { rows: 40 } } as unknown as TUI;
	const editor = new Editor(tui, theme);
	editor.focused = true;
	editor.setText(text);
	return editor;
}
const plain = (editor: Editor, width = 80) => editor.render(width).map(row => stripVTControlCharacters(row.replaceAll(CURSOR_MARKER, ""))).join("\n");

// Exercises the actual Pi editor render and submission paths, not just suggestion metadata.
describe("withArgumentHints", () => {
	it("draws a dim hint immediately after an exact skill mention without submitting it", () => {
		const editor = createEditor("please $review");
		const originalRows = editor.render(80);
		withArgumentHints(editor, () => hints, dim);
		const rows = editor.render(80);
		expect(plain(editor)).toContain("please $review <target> [focus]");
		expect(rows.join("\n")).toContain(dim("<target> [focus]"));
		expect(rows.join("\n").split(CURSOR_MARKER)).toHaveLength(2);
		expect(rows).toHaveLength(originalRows.length);
		expect(rows[0]).toBe(originalRows[0]);
		expect(rows.at(-1)).toBe(originalRows.at(-1));
		expect(editor.getText()).toBe("please $review");
		expect(editor.getExpandedText()).toBe("please $review");
		const submit = vi.fn();
		editor.onSubmit = submit;
		editor.handleInput("\r");
		expect(submit).toHaveBeenCalledWith("please $review");
	});

	it.each(["$review ", "first line\nplease $review", "한국어 $review"])("supports trailing space and wrapped/multiline text: %s", (text) => {
		const editor = createEditor(text);
		withArgumentHints(editor, () => hints, dim);
		expect(plain(editor)).toContain("<target> [focus]");
		expect(editor.getText()).toBe(text);
	});

	it.each(["$rev", "foo$review", "$unknown", "$review file.ts", "$review\nmore text"])("hides hints for incomplete mentions or arguments: %s", (text) => {
		const editor = createEditor(text);
		withArgumentHints(editor, () => hints, dim);
		expect(plain(editor)).not.toContain("<target>");
	});

	it("hides on blur or cursor movement and returns when arguments are removed", () => {
		const editor = createEditor("$review");
		withArgumentHints(editor, () => hints, dim);
		editor.focused = false;
		expect(plain(editor)).not.toContain("<target>");
		editor.focused = true;
		editor.handleInput("\x1b[D");
		expect(plain(editor)).not.toContain("<target>");
		editor.setText("$review something");
		expect(plain(editor)).not.toContain("<target>");
		editor.setText("$review");
		expect(plain(editor)).toContain("<target>");
	});

	it("uses current metadata and never overflows narrow or wrapped rows", () => {
		const editor = createEditor("한국어로 살펴볼 대상은 $review");
		let currentHints = hints;
		withArgumentHints(editor, () => currentHints, dim);
		for (const width of [8, 12, 20, 40, 80]) {
			const rows = editor.render(width);
			expect(rows.every(row => visibleWidth(row) <= width)).toBe(true);
			expect(rows.join("\n").split(CURSOR_MARKER)).toHaveLength(2);
		}
		currentHints = new Map([["review", "<new-target>"]]);
		expect(plain(editor)).toContain("<new-target>");
	});

	it("preserves extra border rows from an existing editor wrapper", () => {
		const editor = createEditor("$review");
		const render = editor.render.bind(editor);
		editor.render = width => ["header", ...render(width - 4).map(row => `| ${row} |`), "footer"];
		const before = editor.render(80);
		withArgumentHints(editor, () => hints, dim);
		const after = editor.render(80);
		expect(after).toHaveLength(before.length);
		expect(after[0]).toBe("header");
		expect(after.at(-1)).toBe("footer");
		expect(after[2]).toMatch(/^\| .* \|$/);
		expect(plain(editor)).toContain("$review <target> [focus]");
	});
});

describe("loadArgumentHints", () => {
	it.each(['"<target> [focus]"', ">\n  <target>\n  [focus]", '"\\u001b[31m<target>\\u001b[0m [focus]"'])("reads and sanitizes %s", async (hint) => {
		const dir = await mkdtemp(join(tmpdir(), "pis-hints-"));
		const path = join(dir, "SKILL.md");
		await writeFile(path, `---\nargument-hint: ${hint}\n---\n# Review\n`);
		expect(loadArgumentHints(new Map([["review", path]]))).toEqual(hints);
	});

	it.each(["# No frontmatter\nargument-hint: <target>", "---\nname: review\n---", '---\nargument-hint: "  "\n---', "---\nargument-hint: [target, focus]\n---", "---\nargument-hint: 42\n---", "---\nargument-hint: [invalid\n---"])("ignores absent or invalid metadata: %s", async (content) => {
		const dir = await mkdtemp(join(tmpdir(), "pis-hints-"));
		const path = join(dir, "SKILL.md");
		await writeFile(path, content);
		expect(loadArgumentHints(new Map([["review", path], ["missing", join(dir, "missing.md")]])).size).toBe(0);
	});
});
