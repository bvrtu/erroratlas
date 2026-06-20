import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const [inputName, outputName] = process.argv.slice(2);

if (!inputName || !outputName) {
  process.stderr.write(
    "Usage: npm run dataset:publish -- <audit-derived-public.json> <output.json>\n",
  );
  process.exit(2);
}

const input = JSON.parse(await readFile(path.resolve(inputName), "utf8"));

for (const repository of input.repositories ?? []) {
  if (repository.visibility !== "PUBLIC") {
    throw new Error(
      `Refusing to publish non-public repository data: ${repository.repository}`,
    );
  }
  if ("scan" in repository) {
    throw new Error("Refusing to publish raw scan contents.");
  }
}

const dataset = {
  ...input,
  license: "CC-BY-4.0",
  privacy: {
    scope: "public repositories only",
    excluded: [
      "source code",
      "error messages",
      "error codes",
      "file paths",
      "private repository metadata",
    ],
  },
};

const output = path.resolve(outputName);
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(dataset, null, 2)}\n`, "utf8");
process.stdout.write(`Published sanitized dataset: ${output}\n`);
