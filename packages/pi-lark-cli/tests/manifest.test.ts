import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"));

describe("package manifest", () => {
	it("pins @larksuite/cli to exactly larkCliVersion", () => {
		expect(manifest.larkCliVersion).toMatch(/^\d+\.\d+\.\d+$/);
		expect(manifest.dependencies["@larksuite/cli"]).toBe(manifest.larkCliVersion);
	});

	it("has a valid self-maintained version", () => {
		expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
	});

	it("declares pi extensions and skills", () => {
		expect(manifest.pi.extensions).toEqual(["./src/index.ts"]);
		expect(manifest.pi.skills).toEqual(["./skills"]);
	});

	it("ships all runtime files in the tarball", () => {
		for (const entry of ["src", "bin", "skills", "UPSTREAM_LICENSE"])
			expect(manifest.files).toContain(entry);
	});
});
