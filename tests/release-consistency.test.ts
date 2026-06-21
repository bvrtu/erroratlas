import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const exec = promisify(execFile);

describe("release consistency gate", () => {
  it("keeps package metadata, docs, demo, and fixture claims aligned", async () => {
    const result = await exec(process.execPath, [
      "scripts/check-release-consistency.mjs",
    ]);
    expect(result.stderr).toBe("");
    const packageJson = JSON.parse(await readFile("package.json", "utf8"));
    expect(result.stdout).toContain(
      `Release consistency passed for ErrorAtlas ${packageJson.version}`,
    );
  });
});
