import type { MessageRenderer } from "@earendil-works/pi-coding-agent";
import { keyText } from "@earendil-works/pi-coding-agent";
import { Box, Text } from "@earendil-works/pi-tui";

export const INLINE_SKILLS_TYPE = "inline-skills";

export type InjectionMode = "full" | "reminder";

export interface InjectedSkillMeta {
	name: string;
	path: string;
	mode: InjectionMode;
	label: string;
	mtimeMs: number;
	size: number;
	tokenCount: number;
}

export interface InlineSkillsDetails {
	skills: InjectedSkillMeta[];
}

const COLLAPSED_VISIBLE_SKILLS = 4;

export function createInlineSkillsMessage(content: string, skills: InjectedSkillMeta[], display: boolean) {
	return { customType: INLINE_SKILLS_TYPE, content, display, details: { skills } };
}

function formatTokenCount(tokens: number): string {
	if (tokens < 1000)
		return `${tokens}`;
	return `${(tokens / 1000).toFixed(1).replace(/\.0$/, "")}k`;
}

type RendererTheme = Parameters<MessageRenderer>[2];

function formatSkillLine(skill: InjectedSkillMeta, theme: RendererTheme): string {
	const title = skill.mode === "reminder" ? "Skill reminder:" : "Skill:";
	const summary = skill.mode === "reminder"
		? ` ${skill.label}`
		: ` ${skill.label} (~${formatTokenCount(skill.tokenCount)} tokens)`;
	return theme.fg("customMessageLabel", title) + theme.fg("customMessageText", summary);
}

function getTextContent(content: string | { type: string; text?: string }[]): string {
	if (typeof content === "string")
		return content;
	return content
		.filter((item) => item.type === "text")
		.map((item) => item.text ?? "")
		.join("\n");
}

// Rendering approach follows pyronaur/pi-skillrefs (MIT): collapsed one-liners, expanded raw XML.
export const renderInlineSkillsMessage: MessageRenderer<InlineSkillsDetails> = (message, { expanded }, theme) => {
	// paddingY: 0 keeps the receipt tight under the message it annotates
	// (custom messages get no leading spacer from the chat container).
	const box = new Box(1, 0, (text) => theme.bg("customMessageBg", text));
	const skills = message.details?.skills ?? [];
	const lines = skills.slice(0, expanded ? skills.length : COLLAPSED_VISIBLE_SKILLS).map((skill) => formatSkillLine(skill, theme));
	const expandKey = keyText("app.tools.expand") || "ctrl+o";
	const text = expanded
		? [...lines, "", theme.fg("customMessageText", getTextContent(message.content))].join("\n")
		: [...lines, theme.fg("dim", `(${expandKey} to expand)`)].join("\n");
	box.addChild(new Text(text, 0, 0));
	return box;
};
