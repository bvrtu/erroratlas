import { readFile } from "node:fs/promises";
import path from "node:path";
export const CONFIG_FILE = "erroratlas.config.json";
const DEFAULT_CONSTRUCTORS = {
    typescript: [
        {
            name: "AppError",
            codeArgument: 0,
            messageArgument: 1,
            statusArgument: 2,
        },
        {
            name: "ApiError",
            codeArgument: 0,
            messageArgument: 1,
            statusArgument: 2,
        },
        { name: "DomainError", codeArgument: 0, messageArgument: 1 },
        {
            name: "HttpError",
            statusArgument: 0,
            codeArgument: 1,
            messageArgument: 2,
        },
        { name: "BadRequestException", defaultStatus: 400 },
        { name: "UnauthorizedException", defaultStatus: 401 },
        { name: "ForbiddenException", defaultStatus: 403 },
        { name: "NotFoundException", defaultStatus: 404 },
        { name: "ConflictException", defaultStatus: 409 },
        { name: "UnprocessableEntityException", defaultStatus: 422 },
        { name: "TooManyRequestsException", defaultStatus: 429 },
        { name: "InternalServerErrorException", defaultStatus: 500 },
        { name: "ServiceUnavailableException", defaultStatus: 503 },
        {
            name: "functions.https.HttpsError",
            codeArgument: 0,
            messageArgument: 1,
            allowMessageVariants: true,
        },
        {
            name: "HttpsError",
            codeArgument: 0,
            messageArgument: 1,
            allowMessageVariants: true,
        },
    ],
    python: [
        {
            name: "AppError",
            codeArgument: 0,
            messageArgument: 1,
            statusArgument: 2,
        },
        {
            name: "ApiError",
            codeArgument: 0,
            messageArgument: 1,
            statusArgument: 2,
        },
        { name: "DomainError", codeArgument: 0, messageArgument: 1 },
        { name: "HTTPException", statusArgument: 0, messageArgument: 1 },
    ],
    java: [
        { name: "AppException", codeArgument: 0, messageArgument: 1 },
        { name: "ApiException", codeArgument: 0, messageArgument: 1 },
        { name: "DomainException", codeArgument: 0, messageArgument: 1 },
        { name: "ResponseStatusException", messageArgument: 1 },
    ],
    csharp: [
        {
            name: "AppException",
            codeArgument: 0,
            messageArgument: 1,
            statusArgument: 2,
        },
        {
            name: "ApiException",
            codeArgument: 0,
            messageArgument: 1,
            statusArgument: 2,
        },
        { name: "DomainException", codeArgument: 0, messageArgument: 1 },
    ],
    go: [
        {
            name: "NewAppError",
            codeArgument: 0,
            messageArgument: 1,
            statusArgument: 2,
        },
        {
            name: "NewAPIError",
            codeArgument: 0,
            messageArgument: 1,
            statusArgument: 2,
        },
    ],
    kotlin: [
        {
            name: "AppException",
            codeArgument: 0,
            messageArgument: 1,
            statusArgument: 2,
        },
        {
            name: "ApiException",
            codeArgument: 0,
            messageArgument: 1,
            statusArgument: 2,
        },
        { name: "DomainException", codeArgument: 0, messageArgument: 1 },
    ],
    dart: [
        { name: "AppException", codeArgument: 0, messageArgument: 1 },
        { name: "ApiException", codeArgument: 0, messageArgument: 1 },
        { name: "FirebaseFunctionsException" },
    ],
    swift: [],
};
const DEFAULTS = {
    include: ["**/*.{ts,tsx,js,jsx,py,java,dart,swift,go,cs,kt,kts}"],
    exclude: [
        "**/node_modules/**",
        "**/dist/**",
        "**/build/**",
        "**/.git/**",
        "**/.venv/**",
        "**/venv/**",
        "**/__pycache__/**",
        "**/{test,tests}/**",
        "**/*.{test,spec}.{ts,tsx,js,jsx}",
        "**/test_*.py",
        "**/*_test.py",
        "**/*Test.java",
        "**/*Tests.swift",
        "**/*_test.go",
        "**/*Test.cs",
        "**/*Tests.cs",
        "**/*Test.kt",
    ],
    catalog: "erroratlas.catalog.json",
    docs: "docs/errors.md",
    openapi: null,
    baseline: null,
    fix: { codePrefix: null },
    failOn: "error",
};
export function defaultRawConfig() {
    return {
        include: DEFAULTS.include,
        exclude: DEFAULTS.exclude,
        catalog: DEFAULTS.catalog,
        docs: DEFAULTS.docs,
        openapi: DEFAULTS.openapi,
        baseline: DEFAULTS.baseline,
        fix: DEFAULTS.fix,
        failOn: DEFAULTS.failOn,
        useDefaultConstructors: true,
        constructors: {
            typescript: [],
            python: [],
            java: [],
            dart: [],
            swift: [],
            go: [],
            csharp: [],
            kotlin: [],
        },
    };
}
export async function loadConfig(root) {
    const configPath = path.join(root, CONFIG_FILE);
    let raw = {};
    try {
        raw = JSON.parse(await readFile(configPath, "utf8"));
    }
    catch (error) {
        if (error.code !== "ENOENT") {
            throw new Error(`Could not read ${CONFIG_FILE}: ${error.message}`);
        }
    }
    validateRawConfig(raw);
    const useDefaults = raw.useDefaultConstructors !== false;
    const languages = [
        "typescript",
        "python",
        "java",
        "dart",
        "swift",
        "go",
        "csharp",
        "kotlin",
    ];
    const constructors = Object.fromEntries(languages.map((language) => [
        language,
        mergeConstructors(useDefaults ? DEFAULT_CONSTRUCTORS[language] : [], raw.constructors?.[language] ?? []),
    ]));
    return {
        include: raw.include ?? DEFAULTS.include,
        exclude: raw.exclude ?? DEFAULTS.exclude,
        catalog: raw.catalog ?? DEFAULTS.catalog,
        docs: raw.docs ?? DEFAULTS.docs,
        openapi: raw.openapi ?? DEFAULTS.openapi,
        baseline: raw.baseline ?? DEFAULTS.baseline,
        fix: {
            codePrefix: raw.fix?.codePrefix ?? DEFAULTS.fix.codePrefix,
        },
        failOn: raw.failOn ?? DEFAULTS.failOn,
        constructors,
    };
}
function mergeConstructors(defaults, custom) {
    const merged = new Map(defaults.map((item) => [item.name, item]));
    for (const item of custom)
        merged.set(item.name, item);
    return [...merged.values()];
}
function validateRawConfig(config) {
    if (config.failOn && !["error", "warning"].includes(config.failOn)) {
        throw new Error('"failOn" must be either "error" or "warning".');
    }
    if (config.fix?.codePrefix !== undefined &&
        config.fix.codePrefix !== null &&
        !/^[A-Z][A-Z0-9_]*$/.test(config.fix.codePrefix)) {
        throw new Error('"fix.codePrefix" must be an uppercase code namespace.');
    }
    for (const language of [
        "typescript",
        "python",
        "java",
        "dart",
        "swift",
        "go",
        "csharp",
        "kotlin",
    ]) {
        for (const constructor of config.constructors?.[language] ?? []) {
            if (!/^[$A-Z_a-z][$\w]*(?:\.[$A-Z_a-z][$\w]*)*$/.test(constructor.name)) {
                throw new Error(`Invalid ${language} constructor name: ${constructor.name}`);
            }
            for (const key of [
                "codeArgument",
                "messageArgument",
                "statusArgument",
            ]) {
                const value = constructor[key];
                if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
                    throw new Error(`${constructor.name}.${key} must be a non-negative integer.`);
                }
            }
        }
    }
}
//# sourceMappingURL=config.js.map