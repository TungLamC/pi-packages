import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { findActiveExternalUserLarkSkills } from "../src/index.ts";

type CommandInfo = ReturnType<ExtensionAPI["getCommands"]>[number];
const ownSkillPath = fileURLToPath(new URL("../skills/lark-im/SKILL.md", import.meta.url));

function skill(path: string, origin: "package" | "top-level", scope: "user" | "project" = "user"): CommandInfo {
	return {
		name: "skill:lark-im",
		source: "skill",
		sourceInfo: { path, source: "test", scope, origin },
	};
}

describe("findActiveExternalUserLarkSkills", () => {
	it("finds user-level lark skills outside this package", () => {
		expect(findActiveExternalUserLarkSkills([skill("/external/lark-im/SKILL.md", "top-level")])).toHaveLength(1);
		expect(findActiveExternalUserLarkSkills([skill("/other-package/lark-im/SKILL.md", "package")])).toHaveLength(1);
		expect(findActiveExternalUserLarkSkills([skill(ownSkillPath, "package")])).toHaveLength(0);
		expect(findActiveExternalUserLarkSkills([skill("/project/lark-im/SKILL.md", "top-level", "project")])).toHaveLength(0);
	});
});
