import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { findActiveExternalUserLarkSkills } from "../src/index.ts";

type CommandInfo = ReturnType<ExtensionAPI["getCommands"]>[number];
const ownSource = "npm:@tunglam/pi-lark-cli";

function skill(source: string, scope: "user" | "project" = "user"): CommandInfo {
	return {
		name: "skill:lark-im",
		source: "skill",
		sourceInfo: { path: "/skills/lark-im/SKILL.md", source, scope, origin: source === "auto" ? "top-level" : "package" },
	};
}

describe("findActiveExternalUserLarkSkills", () => {
	it("finds user-level lark skills from other sources", () => {
		expect(findActiveExternalUserLarkSkills([skill("auto")])).toHaveLength(1);
		expect(findActiveExternalUserLarkSkills([skill("npm:other-package")])).toHaveLength(1);
		expect(findActiveExternalUserLarkSkills([skill(ownSource)])).toHaveLength(0);
		expect(findActiveExternalUserLarkSkills([skill(`${ownSource}@0.1.3`)])).toHaveLength(0);
		expect(findActiveExternalUserLarkSkills([skill("auto", "project")])).toHaveLength(0);
	});
});
