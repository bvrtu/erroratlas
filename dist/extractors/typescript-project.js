import { readFile } from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];
const MAX_TSCONFIG_EXTENDS = 4;
export async function loadTypeScriptProjectResolution(root, policy) {
    if (!policy.resolveProjectImports)
        return null;
    const absoluteRoot = path.resolve(root);
    const tsconfig = path.resolve(absoluteRoot, policy.tsconfig);
    assertWithin(absoluteRoot, tsconfig, "TypeScript config");
    const loaded = await loadTsConfig(tsconfig, absoluteRoot, new Set(), 0);
    return {
        root: absoluteRoot,
        baseUrl: loaded.baseUrl,
        aliases: loaded.aliases,
        workspaces: await loadWorkspacePackages(absoluteRoot),
    };
}
export function resolveTypeScriptImport(filename, specifier, knownFiles, project) {
    if (specifier.startsWith(".")) {
        const target = resolveCandidate(path.resolve(path.dirname(filename), specifier), knownFiles, project?.root ?? null);
        return target ? { filename: target, kind: "relative-import" } : null;
    }
    if (!project)
        return null;
    const alias = resolveAlias(specifier, knownFiles, project);
    if (alias.matched) {
        return alias.filename
            ? { filename: alias.filename, kind: "path-alias" }
            : null;
    }
    if (project.baseUrl) {
        const target = resolveCandidate(path.resolve(project.baseUrl, specifier), knownFiles, project.root);
        if (target)
            return { filename: target, kind: "base-url" };
    }
    const workspace = resolveWorkspace(specifier, knownFiles, project);
    return workspace ? { filename: workspace, kind: "workspace-import" } : null;
}
export function typeScriptImportSpecifiers(source) {
    const specifiers = [];
    const pattern = /(?:\bfrom\s+|\bimport\s*)(["'])([^"']+)\1/g;
    for (const match of source.matchAll(pattern)) {
        if (match[2])
            specifiers.push(match[2]);
    }
    return specifiers;
}
async function loadTsConfig(filename, root, seen, depth) {
    if (depth > MAX_TSCONFIG_EXTENDS) {
        throw new Error(`TypeScript config extends more than ${MAX_TSCONFIG_EXTENDS} local files.`);
    }
    if (seen.has(filename)) {
        throw new Error(`Circular TypeScript config extends chain at ${filename}.`);
    }
    const nextSeen = new Set(seen).add(filename);
    let raw;
    try {
        raw = parseJsonc(await readFile(filename, "utf8"));
    }
    catch (error) {
        if (error.code === "ENOENT") {
            throw new Error(`TypeScript project resolution is enabled but ${path.relative(root, filename)} was not found.`);
        }
        throw new Error(`Could not read TypeScript config ${path.relative(root, filename)}: ${error.message}`);
    }
    let inherited = { baseUrl: null, aliases: [] };
    if (typeof raw.extends === "string") {
        if (!raw.extends.startsWith(".")) {
            throw new Error(`TypeScript project resolution supports only local tsconfig extends; received ${raw.extends}.`);
        }
        const parent = resolveConfigFilename(path.resolve(path.dirname(filename), raw.extends));
        assertWithin(root, parent, "Extended TypeScript config");
        inherited = await loadTsConfig(parent, root, nextSeen, depth + 1);
    }
    const compilerOptions = isRecord(raw.compilerOptions)
        ? raw.compilerOptions
        : {};
    const baseUrl = typeof compilerOptions.baseUrl === "string"
        ? path.resolve(path.dirname(filename), compilerOptions.baseUrl)
        : inherited.baseUrl;
    if (baseUrl)
        assertWithin(root, baseUrl, "TypeScript baseUrl");
    const aliases = isRecord(compilerOptions.paths)
        ? parseAliasRules(compilerOptions.paths, baseUrl ?? path.dirname(filename), root)
        : inherited.aliases;
    return { baseUrl, aliases };
}
function parseAliasRules(paths, baseUrl, root) {
    const rules = [];
    for (const [pattern, rawTargets] of Object.entries(paths)) {
        if (!Array.isArray(rawTargets) || rawTargets.length === 0)
            continue;
        if (count(pattern, "*") > 1) {
            throw new Error(`TypeScript path pattern has more than one *: ${pattern}`);
        }
        const [prefix = "", suffix = ""] = pattern.split("*");
        const targets = rawTargets
            .filter((target) => typeof target === "string")
            .map((target) => {
            if (count(target, "*") > 1) {
                throw new Error(`TypeScript path target has more than one *: ${target}`);
            }
            const absolute = path.resolve(baseUrl, target);
            assertWithin(root, absolute, "TypeScript path target");
            return absolute;
        });
        if (targets.length)
            rules.push({ pattern, prefix, suffix, targets });
    }
    return rules.sort((left, right) => Number(!right.pattern.includes("*")) -
        Number(!left.pattern.includes("*")) ||
        right.prefix.length +
            right.suffix.length -
            (left.prefix.length + left.suffix.length) ||
        left.pattern.localeCompare(right.pattern));
}
async function loadWorkspacePackages(root) {
    let manifest;
    try {
        manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
    }
    catch (error) {
        if (error.code === "ENOENT")
            return [];
        throw error;
    }
    const patterns = Array.isArray(manifest.workspaces)
        ? manifest.workspaces
        : isRecord(manifest.workspaces) &&
            Array.isArray(manifest.workspaces.packages)
            ? manifest.workspaces.packages
            : [];
    const safePatterns = patterns.filter((item) => {
        if (typeof item !== "string" || item.startsWith("!"))
            return false;
        if (path.isAbsolute(item) ||
            path.win32.isAbsolute(item) ||
            item.split(/[\\/]/).includes("..")) {
            throw new Error(`Workspace pattern must stay inside the project: ${item}`);
        }
        return true;
    });
    if (!safePatterns.length)
        return [];
    const manifests = await fg(safePatterns.map((pattern) => `${pattern.replace(/[\\/]$/, "")}/package.json`), {
        cwd: root,
        onlyFiles: true,
        unique: true,
        ignore: ["**/node_modules/**"],
        followSymbolicLinks: false,
    });
    const packages = [];
    const names = new Set();
    for (const relative of manifests.sort()) {
        const filename = path.resolve(root, relative);
        assertWithin(root, filename, "Workspace manifest");
        const child = JSON.parse(await readFile(filename, "utf8"));
        if (typeof child.name !== "string" || !child.name)
            continue;
        if (names.has(child.name)) {
            throw new Error(`Duplicate workspace package name: ${child.name}`);
        }
        names.add(child.name);
        packages.push({
            name: child.name,
            root: path.dirname(filename),
            manifest: child,
        });
    }
    return packages.sort((left, right) => right.name.length - left.name.length);
}
function resolveAlias(specifier, knownFiles, project) {
    const matches = project.aliases
        .map((rule) => ({ rule, capture: matchPattern(rule, specifier) }))
        .filter((item) => item.capture !== null);
    if (!matches.length)
        return { matched: false, filename: null };
    const best = matches[0];
    if (!best)
        return { matched: false, filename: null };
    const bestScore = aliasScore(best.rule);
    const resolved = new Set();
    for (const { rule, capture } of matches) {
        if (aliasScore(rule) !== bestScore)
            break;
        for (const target of rule.targets) {
            const replaced = target.replace("*", capture);
            const filename = resolveCandidate(replaced, knownFiles, project.root);
            if (filename) {
                resolved.add(filename);
                break;
            }
        }
    }
    return {
        matched: true,
        filename: resolved.size === 1 ? ([...resolved][0] ?? null) : null,
    };
}
function resolveWorkspace(specifier, knownFiles, project) {
    const workspace = project.workspaces.find((item) => specifier === item.name || specifier.startsWith(`${item.name}/`));
    if (!workspace)
        return null;
    const subpath = specifier === workspace.name
        ? "."
        : `./${specifier.slice(workspace.name.length + 1)}`;
    const candidates = workspaceCandidates(workspace, subpath);
    for (const candidate of candidates) {
        const absolute = path.resolve(workspace.root, candidate);
        if (!isWithin(workspace.root, absolute))
            continue;
        const filename = resolveCandidate(absolute, knownFiles, project.root);
        if (filename)
            return filename;
    }
    return null;
}
function workspaceCandidates(workspace, subpath) {
    const exports = workspace.manifest.exports;
    if (exports !== undefined) {
        const target = exportedTarget(exports, subpath);
        return target ? [target] : [];
    }
    if (subpath !== ".") {
        const relative = subpath.slice(2);
        return [relative, path.join("src", relative)];
    }
    return [
        ...["source", "types", "module", "main"]
            .map((key) => workspace.manifest[key])
            .filter((value) => typeof value === "string"),
        path.join("src", "index"),
        "index",
    ];
}
function exportedTarget(value, subpath) {
    if (typeof value === "string")
        return subpath === "." ? value : null;
    if (!isRecord(value))
        return null;
    const direct = value[subpath];
    if (direct !== undefined)
        return conditionalTarget(direct);
    for (const [pattern, target] of Object.entries(value)) {
        if (count(pattern, "*") !== 1)
            continue;
        const [prefix = "", suffix = ""] = pattern.split("*");
        if (!subpath.startsWith(prefix) || !subpath.endsWith(suffix))
            continue;
        const capture = subpath.slice(prefix.length, subpath.length - suffix.length);
        const resolved = conditionalTarget(target);
        return resolved?.replace("*", capture) ?? null;
    }
    return subpath === "." ? conditionalTarget(value) : null;
}
function conditionalTarget(value) {
    if (typeof value === "string")
        return value;
    if (Array.isArray(value)) {
        for (const item of value) {
            const target = conditionalTarget(item);
            if (target)
                return target;
        }
        return null;
    }
    if (!isRecord(value))
        return null;
    for (const key of ["types", "import", "default", "require"]) {
        const target = conditionalTarget(value[key]);
        if (target)
            return target;
    }
    return null;
}
function matchPattern(rule, specifier) {
    if (!rule.pattern.includes("*")) {
        return rule.pattern === specifier ? "" : null;
    }
    if (!specifier.startsWith(rule.prefix) || !specifier.endsWith(rule.suffix)) {
        return null;
    }
    return specifier.slice(rule.prefix.length, specifier.length - rule.suffix.length);
}
function aliasScore(rule) {
    return ((rule.pattern.includes("*") ? 0 : 1_000_000) +
        rule.prefix.length +
        rule.suffix.length);
}
function resolveCandidate(base, knownFiles, root) {
    const candidates = [
        path.resolve(base),
        ...EXTENSIONS.map((extension) => path.resolve(`${base}${extension}`)),
        ...EXTENSIONS.map((extension) => path.resolve(base, `index${extension}`)),
    ];
    return (candidates.find((candidate) => (!root || isWithin(root, candidate)) && knownFiles.has(candidate)) ?? null);
}
function resolveConfigFilename(value) {
    return value.endsWith(".json") ? value : `${value}.json`;
}
function parseJsonc(source) {
    const withoutComments = stripJsonComments(source);
    const withoutTrailingCommas = stripTrailingCommas(withoutComments);
    const parsed = JSON.parse(withoutTrailingCommas);
    if (!isRecord(parsed))
        throw new Error("Expected a JSON object.");
    return parsed;
}
function stripJsonComments(source) {
    let output = "";
    let string = false;
    let escaped = false;
    let lineComment = false;
    let blockComment = false;
    for (let index = 0; index < source.length; index += 1) {
        const character = source[index] ?? "";
        const next = source[index + 1] ?? "";
        if (lineComment) {
            if (character === "\n") {
                lineComment = false;
                output += character;
            }
            continue;
        }
        if (blockComment) {
            if (character === "*" && next === "/") {
                blockComment = false;
                index += 1;
            }
            else if (character === "\n") {
                output += character;
            }
            continue;
        }
        if (string) {
            output += character;
            if (escaped)
                escaped = false;
            else if (character === "\\")
                escaped = true;
            else if (character === '"')
                string = false;
            continue;
        }
        if (character === '"') {
            string = true;
            output += character;
        }
        else if (character === "/" && next === "/") {
            lineComment = true;
            index += 1;
        }
        else if (character === "/" && next === "*") {
            blockComment = true;
            index += 1;
        }
        else {
            output += character;
        }
    }
    return output;
}
function stripTrailingCommas(source) {
    let output = "";
    let string = false;
    let escaped = false;
    for (let index = 0; index < source.length; index += 1) {
        const character = source[index] ?? "";
        if (string) {
            output += character;
            if (escaped)
                escaped = false;
            else if (character === "\\")
                escaped = true;
            else if (character === '"')
                string = false;
            continue;
        }
        if (character === '"') {
            string = true;
            output += character;
            continue;
        }
        if (character === ",") {
            let cursor = index + 1;
            while (/\s/.test(source[cursor] ?? ""))
                cursor += 1;
            if (["}", "]"].includes(source[cursor] ?? ""))
                continue;
        }
        output += character;
    }
    return output;
}
function assertWithin(root, candidate, label) {
    if (!isWithin(root, candidate)) {
        throw new Error(`${label} must stay inside the ErrorAtlas project root.`);
    }
}
function isWithin(root, candidate) {
    const relative = path.relative(path.resolve(root), path.resolve(candidate));
    return (relative === "" ||
        (!relative.startsWith("..") && !path.isAbsolute(relative)));
}
function count(value, character) {
    return [...value].filter((item) => item === character).length;
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
//# sourceMappingURL=typescript-project.js.map