import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import { Lang, parse } from "@ast-grep/napi";
import { readCatalogIfPresent } from "./catalog.js";
import { propertyNumber, propertyString } from "./extractors/shared.js";
export async function planSourceFixes(root, config) {
    const absoluteRoot = path.resolve(root);
    const catalog = await readCatalogIfPresent(path.resolve(absoluteRoot, config.catalog));
    const files = await fg(config.include, {
        cwd: absoluteRoot,
        ignore: config.exclude,
        onlyFiles: true,
        unique: true,
        dot: false,
        followSymbolicLinks: false,
    });
    const fixes = (await Promise.all(files
        .filter((file) => /\.[jt]sx?$/.test(file))
        .sort()
        .map(async (relativeFile) => {
        const filename = path.join(absoluteRoot, relativeFile);
        const source = await readFile(filename, "utf8");
        return planTypeScriptFileFixes(absoluteRoot, filename, source, catalog, config.fix.codePrefix);
    }))).flat();
    markIntraPlanCollisions(fixes);
    return fixes.sort((left, right) => left.file.localeCompare(right.file) || left.line - right.line);
}
export async function applySourceFixes(root, fixes) {
    const absoluteRoot = path.resolve(root);
    const byFile = new Map();
    for (const fix of fixes) {
        if (!fix.safe)
            continue;
        const group = byFile.get(fix.file) ?? [];
        group.push(fix);
        byFile.set(fix.file, group);
    }
    for (const [relativeFile, fileFixes] of byFile) {
        const filename = path.join(absoluteRoot, relativeFile);
        let source = await readFile(filename, "utf8");
        for (const fix of fileFixes.sort((left, right) => right.insertionIndex - left.insertionIndex)) {
            source =
                source.slice(0, fix.insertionIndex) +
                    fix.insertion +
                    source.slice(fix.insertionIndex);
        }
        await writeFile(filename, source, "utf8");
    }
}
export function renderSourceFixes(fixes) {
    if (fixes.length === 0)
        return "No safe source fixes found.\n";
    const safe = fixes.filter((fix) => fix.safe).length;
    const blocked = fixes.length - safe;
    return `${[
        `Safe source fixes: ${safe}${blocked ? ` · blocked collisions: ${blocked}` : ""}`,
        "",
        ...fixes.map((fix) => `${fix.file}:${fix.line}:${fix.column} ${fix.safe ? "add" : "skip"} code ${fix.code} for ${JSON.stringify(fix.message)}\n  Rationale: ${fix.rationale}`),
    ].join("\n")}\n`;
}
function planTypeScriptFileFixes(root, filename, source, catalog, codePrefix) {
    const language = /\.[jt]sx$/.test(filename) ? Lang.Tsx : Lang.TypeScript;
    const tree = parse(language, source).root();
    const fixes = [];
    const seen = new Set();
    for (const callee of ["NextResponse.json", "Response.json"]) {
        for (const node of tree.findAll({
            rule: { pattern: `${callee}($$$ARGS)` },
        })) {
            const args = namedMatches(node, "ARGS");
            const body = args[0];
            if (!body)
                continue;
            const status = propertyNumber(args[1]?.text() ?? "", [
                "status",
                "statusCode",
            ]);
            addFix(root, filename, body, status, fixes, seen, catalog, codePrefix);
        }
    }
    for (const pattern of [
        "$RESPONSE.status($STATUS).json($BODY)",
        "$RESPONSE.status($STATUS).send($BODY)",
        "$RESPONSE.code($STATUS).send($BODY)",
    ]) {
        for (const node of tree.findAll({ rule: { pattern } })) {
            const body = node.getMatch("BODY");
            if (!body)
                continue;
            const statusText = node.getMatch("STATUS")?.text() ?? "";
            const status = /^\d{3}$/.test(statusText.trim())
                ? Number(statusText)
                : null;
            addFix(root, filename, body, status, fixes, seen, catalog, codePrefix);
        }
    }
    return fixes;
}
function addFix(root, filename, body, status, fixes, seen, catalog, codePrefix) {
    const text = body.text();
    if (!text.trimStart().startsWith("{"))
        return;
    if (/["']?(?:code|errorCode|error_code)["']?\s*:/.test(text))
        return;
    const message = propertyString(text, ["error", "message", "detail", "title"]);
    if (!message || (status !== null && status < 400))
        return;
    const identity = chooseIdentity(message, status, catalog, codePrefix);
    const code = identity.code;
    if (!code)
        return;
    const range = body.range();
    const key = `${range.start.index}:${range.end.index}`;
    if (seen.has(key))
        return;
    seen.add(key);
    const insertion = insertionForObject(text, code);
    const location = range.start;
    fixes.push({
        file: path.relative(root, filename).split(path.sep).join("/"),
        line: location.line + 1,
        column: location.column + 1,
        code,
        message,
        insertionIndex: range.start.index + insertion.offset,
        insertion: insertion.text,
        safe: identity.safe,
        rationale: identity.rationale,
        source: identity.source,
    });
}
function chooseIdentity(message, status, catalog, codePrefix) {
    const exactMatches = catalog?.errors.filter((entry) => catalogMessages(entry).includes(message) &&
        (status === null || entry.status === status)) ?? [];
    if (exactMatches.length === 1) {
        const match = exactMatches[0];
        return {
            code: match.code,
            safe: true,
            source: "catalog",
            rationale: `Reuses catalog identity ${match.code}; static message${status === null ? "" : ` and status ${status}`} match.`,
        };
    }
    const generated = withPrefix(toErrorCode(message), codePrefix);
    if (!generated) {
        return {
            code: "UNRESOLVED_ERROR",
            safe: false,
            source: "generated",
            rationale: "Blocked because the static message cannot produce a stable code.",
        };
    }
    if (exactMatches.length > 1) {
        return {
            code: generated,
            safe: false,
            source: "generated",
            rationale: `Blocked because ${exactMatches.length} catalog identities match the same message/status.`,
        };
    }
    const collision = catalog?.errors.find((entry) => entry.code === generated);
    if (collision) {
        return {
            code: generated,
            safe: false,
            source: "generated",
            rationale: `Blocked because ${generated} already belongs to a different catalog message/status.`,
        };
    }
    return {
        code: generated,
        safe: true,
        source: "generated",
        rationale: codePrefix
            ? `Generated deterministically from the static message using namespace ${codePrefix}.`
            : "Generated deterministically from the static message; no catalog identity matched.",
    };
}
function catalogMessages(entry) {
    return [
        ...(entry.message ? [entry.message] : []),
        ...(entry.observedMessages ?? []),
    ];
}
function withPrefix(code, prefix) {
    if (!code || !prefix || code.startsWith(`${prefix}_`))
        return code;
    return `${prefix}_${code}`;
}
function markIntraPlanCollisions(fixes) {
    const byCode = new Map();
    for (const fix of fixes.filter((item) => item.safe)) {
        const group = byCode.get(fix.code) ?? [];
        group.push(fix);
        byCode.set(fix.code, group);
    }
    for (const [code, group] of byCode) {
        const identities = new Set(group.map((fix) => JSON.stringify([fix.message, fix.source])));
        if (identities.size <= 1)
            continue;
        for (const fix of group) {
            fix.safe = false;
            fix.rationale = `Blocked because ${code} would be assigned to multiple distinct messages in this fix plan.`;
        }
    }
}
function insertionForObject(objectText, code) {
    const multiline = objectText.match(/^\{\r?\n([ \t]*)/);
    if (multiline) {
        const indent = multiline[1] ?? "";
        return {
            offset: multiline[0].length,
            text: `code: ${JSON.stringify(code)},\n${indent}`,
        };
    }
    return {
        offset: objectText.indexOf("{") + 1,
        text: ` code: ${JSON.stringify(code)},`,
    };
}
function toErrorCode(message) {
    const code = message
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/([a-z\d])([A-Z])/g, "$1_$2")
        .replace(/[^A-Za-z\d]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .toUpperCase();
    return code || null;
}
function namedMatches(node, name) {
    return node.getMultipleMatches(name).filter((item) => item.isNamed());
}
//# sourceMappingURL=source-fixes.js.map