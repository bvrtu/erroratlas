import { readFile } from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import { extractPythonErrors } from "./extractors/python.js";
import { extractDartErrors } from "./extractors/dart.js";
import { extractJavaErrors } from "./extractors/java.js";
import { extractCSharpErrors } from "./extractors/csharp.js";
import { extractGoErrors } from "./extractors/go.js";
import { extractKotlinErrors } from "./extractors/kotlin.js";
import { extractSwiftErrors } from "./extractors/swift.js";
import { extractTypeScriptErrors } from "./extractors/typescript.js";
import { buildTypeScriptFactories, buildTypeScriptStaticAnalysis, } from "./extractors/typescript-symbols.js";
import { loadTypeScriptProjectResolution, resolveTypeScriptImport, typeScriptImportSpecifiers, } from "./extractors/typescript-project.js";
export async function scanProject(root, config, options = {}) {
    const absoluteRoot = path.resolve(root);
    const files = await fg(config.include, {
        cwd: absoluteRoot,
        ignore: config.exclude,
        onlyFiles: true,
        unique: true,
        dot: false,
        followSymbolicLinks: false,
    });
    const sources = await Promise.all(files.sort().map(async (relativeFile) => {
        const filename = path.join(absoluteRoot, relativeFile);
        const source = await readFile(filename, "utf8");
        return { filename, source };
    }));
    const typescriptSources = sources.filter(({ filename }) => /\.[jt]sx?$/.test(filename));
    const projectResolution = await loadTypeScriptProjectResolution(absoluteRoot, config.typescript);
    const staticAnalysis = buildTypeScriptStaticAnalysis(typescriptSources, projectResolution);
    const factories = buildTypeScriptFactories(typescriptSources, config.constructors.typescript, projectResolution);
    const selectedFiles = options.changedFiles?.length
        ? affectedFiles(absoluteRoot, sources, options.changedFiles, options.affectedImportHops ?? 2, projectResolution)
        : new Set(sources.map(({ filename }) => path.resolve(filename)));
    const selectedSources = sources.filter(({ filename }) => selectedFiles.has(path.resolve(filename)));
    const detected = await Promise.all(selectedSources.map(async ({ filename, source }) => {
        if (filename.endsWith(".py")) {
            return extractPythonErrors({
                root: absoluteRoot,
                filename,
                source,
                constructors: config.constructors.python,
            });
        }
        if (filename.endsWith(".java")) {
            return extractJavaErrors({
                root: absoluteRoot,
                filename,
                source,
                constructors: config.constructors.java,
            });
        }
        if (filename.endsWith(".dart")) {
            return extractDartErrors({
                root: absoluteRoot,
                filename,
                source,
                constructors: config.constructors.dart,
            });
        }
        if (filename.endsWith(".swift")) {
            return extractSwiftErrors({
                root: absoluteRoot,
                filename,
                source,
                constructors: config.constructors.swift,
            });
        }
        if (filename.endsWith(".go")) {
            return extractGoErrors({
                root: absoluteRoot,
                filename,
                source,
                constructors: config.constructors.go,
            });
        }
        if (filename.endsWith(".cs")) {
            return extractCSharpErrors({
                root: absoluteRoot,
                filename,
                source,
                constructors: config.constructors.csharp,
            });
        }
        if (filename.endsWith(".kt") || filename.endsWith(".kts")) {
            return extractKotlinErrors({
                root: absoluteRoot,
                filename,
                source,
                constructors: config.constructors.kotlin,
            });
        }
        const fileStaticAnalysis = staticAnalysis.get(path.resolve(filename));
        const fileFactories = factories.get(path.resolve(filename));
        return extractTypeScriptErrors({
            root: absoluteRoot,
            filename,
            source,
            constructors: config.constructors.typescript,
            ...(fileStaticAnalysis
                ? {
                    staticValues: fileStaticAnalysis.values,
                    staticEvidence: fileStaticAnalysis.evidence,
                }
                : {}),
            ...(fileFactories ? { factories: fileFactories } : {}),
        });
    }));
    const errors = detected
        .flat()
        .map((error) => ensureEvidence(error))
        .sort(compareDetectedErrors);
    return {
        root: absoluteRoot,
        filesScanned: selectedSources.length,
        errors,
        diagnostics: analyzeDetections(errors),
    };
}
function ensureEvidence(error) {
    if (error.evidence?.steps.length)
        return error;
    return {
        ...error,
        evidence: {
            confidence: error.structured ? "proven" : "partial",
            steps: [
                {
                    kind: "syntax",
                    file: error.location.file,
                    symbol: error.constructor,
                },
            ],
        },
    };
}
function affectedFiles(root, sources, changedFiles, maxHops, projectResolution) {
    const known = new Set(sources.map(({ filename }) => path.resolve(filename)));
    const changed = new Set(changedFiles.map((filename) => path.resolve(root, filename.split("/").join(path.sep))));
    const reverseImports = new Map();
    for (const source of sources) {
        if (!/\.[jt]sx?$/.test(source.filename))
            continue;
        for (const specifier of typeScriptImportSpecifiers(source.source)) {
            const target = resolveTypeScriptImport(source.filename, specifier, known, projectResolution);
            if (!target)
                continue;
            const importers = reverseImports.get(target.filename) ?? new Set();
            importers.add(path.resolve(source.filename));
            reverseImports.set(target.filename, importers);
        }
    }
    const affected = new Set([...changed].filter((filename) => known.has(filename)));
    let frontier = new Set(changed);
    for (let hop = 0; hop < Math.max(0, maxHops); hop += 1) {
        const next = new Set();
        for (const filename of frontier) {
            for (const importer of reverseImports.get(filename) ?? []) {
                if (affected.has(importer))
                    continue;
                affected.add(importer);
                next.add(importer);
            }
        }
        frontier = next;
        if (frontier.size === 0)
            break;
    }
    return affected;
}
export function analyzeDetections(errors) {
    const diagnostics = errors
        .filter((item) => !item.structured)
        .map((item) => ({
        ruleId: "unstructured-error",
        severity: "warning",
        message: `${item.constructor} has no static machine-readable error code.`,
        code: null,
        location: item.location,
    }));
    const byCode = new Map();
    for (const item of errors) {
        if (!item.code)
            continue;
        const group = byCode.get(item.code) ?? [];
        group.push(item);
        byCode.set(item.code, group);
    }
    for (const [code, definitions] of byCode) {
        const messages = new Set(definitions.map((item) => item.message).filter(Boolean));
        const statuses = new Set(definitions.map((item) => item.status).filter((item) => item !== null));
        const variantsAllowed = definitions.every((item) => item.allowMessageVariants);
        const hasMessageConflict = messages.size > 1 && !variantsAllowed;
        if (!hasMessageConflict && statuses.size <= 1)
            continue;
        diagnostics.push({
            ruleId: "duplicate-definition",
            severity: "error",
            message: `${code} has conflicting definitions (${messages.size} messages, ${statuses.size} statuses).`,
            code,
            location: definitions[1]?.location ?? definitions[0]?.location ?? null,
        });
    }
    return diagnostics.sort(compareDiagnostics);
}
export function compareDiagnostics(left, right) {
    const leftFile = left.location?.file ?? "";
    const rightFile = right.location?.file ?? "";
    return (leftFile.localeCompare(rightFile) ||
        (left.location?.line ?? 0) - (right.location?.line ?? 0) ||
        left.ruleId.localeCompare(right.ruleId));
}
function compareDetectedErrors(left, right) {
    return (left.location.file.localeCompare(right.location.file) ||
        left.location.line - right.location.line ||
        left.location.column - right.location.column);
}
//# sourceMappingURL=scanner.js.map