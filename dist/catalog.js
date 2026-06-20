import { readFile } from "node:fs/promises";
import { compareDiagnostics } from "./scanner.js";
export function buildCatalog(errors, previous = null, generatedAt = new Date().toISOString()) {
    const previousByCode = new Map(previous?.errors.map((item) => [item.code, item]) ?? []);
    const byCode = new Map();
    for (const item of errors) {
        if (!item.code)
            continue;
        const group = byCode.get(item.code) ?? [];
        group.push(item);
        byCode.set(item.code, group);
    }
    const entries = [...byCode.entries()]
        .map(([code, definitions]) => {
        const first = definitions[0];
        const existing = previousByCode.get(code);
        const observedMessages = [
            ...new Set(definitions
                .map((definition) => definition.message)
                .filter((message) => message !== null)),
        ].sort();
        const variantsAllowed = definitions.every((definition) => definition.allowMessageVariants);
        const message = variantsAllowed && observedMessages.length > 1
            ? null
            : (first?.message ?? null);
        return {
            code,
            message,
            observedMessages,
            status: first?.status ?? null,
            description: existing?.description ?? "",
            resolution: existing?.resolution ?? "",
            occurrences: definitions.map((item) => ({
                ...item.location,
                language: item.language,
                constructor: item.constructor,
            })),
        };
    })
        .sort((left, right) => left.code.localeCompare(right.code));
    return {
        schemaVersion: 1,
        generatedAt,
        errors: entries,
    };
}
export async function readCatalog(filename) {
    const parsed = JSON.parse(await readFile(filename, "utf8"));
    validateCatalog(parsed, filename);
    return parsed;
}
export async function readCatalogIfPresent(filename) {
    try {
        return await readCatalog(filename);
    }
    catch (error) {
        if (error.code === "ENOENT")
            return null;
        throw error;
    }
}
export function compareWithCatalog(scan, catalog) {
    const diagnostics = [...scan.diagnostics];
    const sourceCatalog = buildCatalog(scan.errors, null, catalog.generatedAt);
    const sourceByCode = new Map(sourceCatalog.errors.map((item) => [item.code, item]));
    const catalogByCode = new Map(catalog.errors.map((item) => [item.code, item]));
    for (const [code, source] of sourceByCode) {
        const documented = catalogByCode.get(code);
        const location = source.occurrences[0] ?? null;
        if (!documented) {
            diagnostics.push({
                ruleId: "undocumented-error",
                severity: "error",
                message: `${code} exists in source but is missing from the catalog.`,
                code,
                location,
            });
            continue;
        }
        const sourceMessages = normalizedMessages(source);
        const documentedMessages = normalizedMessages(documented);
        if (source.message !== documented.message ||
            !sameStrings(sourceMessages, documentedMessages)) {
            diagnostics.push({
                ruleId: "message-drift",
                severity: "error",
                message: `${code} message changed from ${quote(documented.message)} to ${quote(source.message)}.`,
                code,
                location,
            });
        }
        if (source.status !== documented.status) {
            diagnostics.push({
                ruleId: "status-drift",
                severity: "error",
                message: `${code} status changed from ${documented.status ?? "none"} to ${source.status ?? "none"}.`,
                code,
                location,
            });
        }
        if (!documented.resolution.trim()) {
            diagnostics.push({
                ruleId: "missing-resolution",
                severity: "note",
                message: `${code} has no documented resolution.`,
                code,
                location,
            });
        }
    }
    for (const [code, documented] of catalogByCode) {
        if (sourceByCode.has(code))
            continue;
        diagnostics.push({
            ruleId: "stale-error",
            severity: "warning",
            message: `${code} is cataloged but no longer exists in source.`,
            code,
            location: documented.occurrences[0] ?? null,
        });
    }
    return diagnostics.sort(compareDiagnostics);
}
function validateCatalog(value, filename) {
    if (value.schemaVersion !== 1 || !Array.isArray(value.errors)) {
        throw new Error(`${filename} is not a valid ErrorAtlas catalog.`);
    }
    const codes = new Set();
    for (const entry of value.errors) {
        if (!entry.code || codes.has(entry.code)) {
            throw new Error(`${filename} contains an empty or duplicate error code: ${entry.code}`);
        }
        codes.add(entry.code);
    }
}
function quote(value) {
    return value === null ? "none" : JSON.stringify(value);
}
function normalizedMessages(entry) {
    return [
        ...new Set(entry.observedMessages ?? (entry.message ? [entry.message] : [])),
    ].sort();
}
function sameStrings(left, right) {
    return (left.length === right.length &&
        left.every((value, index) => value === right[index]));
}
//# sourceMappingURL=catalog.js.map