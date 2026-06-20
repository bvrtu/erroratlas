import { readFile } from "node:fs/promises";
export function buildBaseline(diagnostics, generatedAt = new Date().toISOString()) {
    return {
        schemaVersion: 1,
        generatedAt,
        fingerprints: diagnostics.map(diagnosticFingerprint).sort(),
    };
}
export async function readBaseline(filename) {
    const value = JSON.parse(await readFile(filename, "utf8"));
    if (value.schemaVersion !== 1 ||
        !Array.isArray(value.fingerprints) ||
        value.fingerprints.some((fingerprint) => typeof fingerprint !== "string")) {
        throw new Error(`${filename} is not a valid ErrorAtlas baseline.`);
    }
    return value;
}
export function filterBaselineDiagnostics(diagnostics, baseline) {
    const remaining = new Map();
    for (const fingerprint of baseline.fingerprints) {
        remaining.set(fingerprint, (remaining.get(fingerprint) ?? 0) + 1);
    }
    return diagnostics.filter((diagnostic) => {
        const fingerprint = diagnosticFingerprint(diagnostic);
        const count = remaining.get(fingerprint) ?? 0;
        if (count <= 0)
            return true;
        remaining.set(fingerprint, count - 1);
        return false;
    });
}
export function diagnosticFingerprint(diagnostic) {
    return JSON.stringify([
        diagnostic.ruleId,
        diagnostic.code,
        diagnostic.location?.file ?? null,
        diagnostic.message,
    ]);
}
//# sourceMappingURL=baseline.js.map