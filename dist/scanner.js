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
import { buildTypeScriptStaticValues } from "./extractors/typescript-symbols.js";
export async function scanProject(root, config) {
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
    const staticValues = buildTypeScriptStaticValues(typescriptSources);
    const detected = await Promise.all(sources.map(async ({ filename, source }) => {
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
        const fileStaticValues = staticValues.get(path.resolve(filename));
        return extractTypeScriptErrors({
            root: absoluteRoot,
            filename,
            source,
            constructors: config.constructors.typescript,
            ...(fileStaticValues ? { staticValues: fileStaticValues } : {}),
        });
    }));
    const errors = detected.flat().sort(compareDetectedErrors);
    return {
        root: absoluteRoot,
        filesScanned: files.length,
        errors,
        diagnostics: analyzeDetections(errors),
    };
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