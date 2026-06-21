import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { compareDiagnostics } from "./scanner.js";
export async function readOpenApiContract(filename) {
    const source = await readFile(filename, "utf8");
    let document;
    try {
        document = parseYaml(source);
    }
    catch (error) {
        throw new Error(`Could not parse OpenAPI document: ${error.message}`);
    }
    if (!isRecord(document) || !isRecord(document.paths)) {
        throw new Error(`${filename} is not a valid OpenAPI or Swagger document.`);
    }
    const contracts = [];
    const methods = new Set([
        "get",
        "put",
        "post",
        "delete",
        "options",
        "head",
        "patch",
        "trace",
    ]);
    for (const [route, pathItem] of Object.entries(document.paths)) {
        if (!isRecord(pathItem))
            continue;
        for (const [method, operation] of Object.entries(pathItem)) {
            if (!methods.has(method.toLowerCase()) || !isRecord(operation))
                continue;
            const responses = resolveObject(operation.responses, document);
            if (!responses)
                continue;
            for (const [statusKey, responseValue] of Object.entries(responses)) {
                if (!isErrorStatus(statusKey))
                    continue;
                const response = resolveValue(responseValue, document);
                const status = /^\d{3}$/.test(statusKey) ? Number(statusKey) : null;
                const operationName = `${method.toUpperCase()} ${route}`;
                const content = isRecord(response)
                    ? resolveObject(response.content, document)
                    : null;
                if (content) {
                    for (const [mediaType, mediaValue] of Object.entries(content)) {
                        const problem = collectProblemShape(mediaValue, document);
                        for (const code of collectCodes(mediaValue, document)) {
                            contracts.push({
                                code,
                                status,
                                operation: operationName,
                                ...(isProblemMediaType(mediaType) || problem
                                    ? { mediaType }
                                    : {}),
                                ...(problem ? { problem } : {}),
                            });
                        }
                    }
                }
                else {
                    for (const code of collectCodes(response, document)) {
                        contracts.push({ code, status, operation: operationName });
                    }
                }
            }
        }
    }
    return deduplicateContracts(contracts);
}
export function compareCatalogWithOpenApi(catalog, contract) {
    if (contract.length === 0) {
        return [
            {
                ruleId: "openapi-no-error-codes",
                severity: "note",
                message: "The OpenAPI document has no static error codes in 4xx/5xx response examples, enums, constants, or defaults.",
                code: null,
                location: null,
            },
        ];
    }
    const sourceByCode = new Map(catalog.errors.map((entry) => [entry.code, entry]));
    const contractByCode = new Map();
    for (const entry of contract) {
        const group = contractByCode.get(entry.code) ?? [];
        group.push(entry);
        contractByCode.set(entry.code, group);
    }
    const diagnostics = [];
    for (const [code, source] of sourceByCode) {
        const documented = contractByCode.get(code);
        const location = source.occurrences[0] ?? null;
        const evidence = source.occurrences[0]?.evidence;
        if (!documented) {
            diagnostics.push({
                ruleId: "openapi-undocumented-error",
                severity: "error",
                message: `${code} exists in source but is missing from OpenAPI error responses.`,
                code,
                ...(evidence ? { evidence } : {}),
                location,
            });
            continue;
        }
        const statuses = new Set(documented
            .map((entry) => entry.status)
            .filter((status) => status !== null));
        if (source.status !== null &&
            statuses.size > 0 &&
            !statuses.has(source.status)) {
            diagnostics.push({
                ruleId: "openapi-status-drift",
                severity: "error",
                message: `${code} has status ${source.status} in source but OpenAPI documents ${[...statuses].sort().join(", ")}.`,
                code,
                ...(evidence ? { evidence } : {}),
                location,
            });
        }
        if (source.problem &&
            !documented.some((entry) => entry.mediaType ? isProblemMediaType(entry.mediaType) : false)) {
            diagnostics.push({
                ruleId: "openapi-problem-media-type",
                severity: "error",
                message: `${code} is an RFC 9457 problem in source but OpenAPI does not expose it as application/problem+json.`,
                code,
                ...(evidence ? { evidence } : {}),
                location,
            });
        }
        if (source.problem) {
            const conflictingFields = ["type", "title", "detail", "instance"].filter((field) => {
                const sourceValue = source.problem?.[field];
                const documentedValues = new Set(documented
                    .map((entry) => entry.problem?.[field])
                    .filter((value) => typeof value === "string"));
                return (sourceValue !== null &&
                    sourceValue !== undefined &&
                    documentedValues.size > 0 &&
                    !documentedValues.has(sourceValue));
            });
            if (conflictingFields.length) {
                diagnostics.push({
                    ruleId: "openapi-problem-details-drift",
                    severity: "error",
                    message: `${code} has RFC 9457 drift in: ${conflictingFields.join(", ")}.`,
                    code,
                    ...(evidence ? { evidence } : {}),
                    location,
                });
            }
        }
    }
    for (const [code, entries] of contractByCode) {
        if (sourceByCode.has(code))
            continue;
        diagnostics.push({
            ruleId: "openapi-stale-error",
            severity: "warning",
            message: `${code} is documented by OpenAPI (${entries.map((entry) => entry.operation).join(", ")}) but was not found in source.`,
            code,
            location: null,
        });
    }
    return diagnostics.sort(compareDiagnostics);
}
function collectProblemShape(value, document) {
    const candidates = new Map(["type", "title", "detail", "instance"].map((field) => [
        field,
        new Set(),
    ]));
    const visited = new Set();
    function add(field, input) {
        const resolved = resolveValue(input, document);
        if (typeof resolved === "string") {
            candidates.get(field)?.add(resolved);
            return;
        }
        if (!isRecord(resolved))
            return;
        for (const candidate of [
            resolved.const,
            resolved.example,
            resolved.default,
        ]) {
            if (typeof candidate === "string")
                candidates.get(field)?.add(candidate);
        }
        if (Array.isArray(resolved.enum) && resolved.enum.length === 1) {
            const candidate = resolved.enum[0];
            if (typeof candidate === "string")
                candidates.get(field)?.add(candidate);
        }
    }
    function visit(input, depth = 0) {
        if (depth > 30)
            return;
        const resolved = resolveValue(input, document);
        if (Array.isArray(resolved)) {
            for (const item of resolved)
                visit(item, depth + 1);
            return;
        }
        if (!isRecord(resolved) || visited.has(resolved))
            return;
        visited.add(resolved);
        const properties = resolveObject(resolved.properties, document);
        if (properties) {
            for (const field of ["type", "title", "detail", "instance"]) {
                if (field in properties)
                    add(field, properties[field]);
            }
        }
        const looksLikeExample = ["title", "detail", "instance"].some((field) => field in resolved);
        if (looksLikeExample) {
            for (const field of ["type", "title", "detail", "instance"]) {
                if (field in resolved)
                    add(field, resolved[field]);
            }
        }
        for (const child of Object.values(resolved))
            visit(child, depth + 1);
    }
    visit(value);
    const problem = {};
    for (const [field, values] of candidates) {
        const [only] = values;
        if (values.size === 1 && only !== undefined)
            problem[field] = only;
    }
    return Object.keys(problem).length ? problem : undefined;
}
function collectCodes(value, document) {
    const codes = new Set();
    const visited = new Set();
    function visit(current, key = "", depth = 0) {
        if (depth > 30 || current === null || current === undefined)
            return;
        const resolved = resolveValue(current, document);
        if (typeof resolved === "string") {
            if (isCodeKey(key))
                codes.add(resolved);
            return;
        }
        if (Array.isArray(resolved)) {
            for (const item of resolved)
                visit(item, key, depth + 1);
            return;
        }
        if (!isRecord(resolved) || visited.has(resolved))
            return;
        visited.add(resolved);
        if (isCodeKey(key)) {
            for (const candidate of [
                resolved.const,
                resolved.example,
                resolved.default,
            ]) {
                if (typeof candidate === "string")
                    codes.add(candidate);
            }
            if (Array.isArray(resolved.enum)) {
                for (const candidate of resolved.enum) {
                    if (typeof candidate === "string")
                        codes.add(candidate);
                }
            }
        }
        for (const [childKey, child] of Object.entries(resolved)) {
            visit(child, childKey, depth + 1);
        }
    }
    visit(value);
    return codes;
}
function resolveObject(value, document) {
    const resolved = resolveValue(value, document);
    return isRecord(resolved) ? resolved : null;
}
function resolveValue(value, document) {
    if (!isRecord(value) || typeof value.$ref !== "string")
        return value;
    if (!value.$ref.startsWith("#/"))
        return value;
    let current = document;
    for (const rawPart of value.$ref.slice(2).split("/")) {
        if (!isRecord(current))
            return value;
        const part = rawPart.replace(/~1/g, "/").replace(/~0/g, "~");
        current = current[part];
    }
    return current ?? value;
}
function deduplicateContracts(contracts) {
    const unique = new Map();
    for (const entry of contracts) {
        unique.set(`${entry.code}\0${entry.status}\0${entry.operation}\0${entry.mediaType ?? ""}\0${JSON.stringify(entry.problem ?? {})}`, entry);
    }
    return [...unique.values()].sort((left, right) => left.code.localeCompare(right.code) ||
        (left.status ?? 0) - (right.status ?? 0) ||
        left.operation.localeCompare(right.operation));
}
function isProblemMediaType(mediaType) {
    return (mediaType.split(";", 1)[0]?.trim().toLowerCase() ===
        "application/problem+json");
}
function isCodeKey(key) {
    return ["code", "errorCode", "error_code"].includes(key);
}
function isErrorStatus(status) {
    return /^(?:[45]\d{2}|[45]XX|default)$/i.test(status);
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
//# sourceMappingURL=openapi.js.map