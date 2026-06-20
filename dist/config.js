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
};
const DEFAULTS = {
    include: ["**/*.{ts,tsx,js,jsx,py}"],
    exclude: [
        "**/node_modules/**",
        "**/dist/**",
        "**/build/**",
        "**/.git/**",
        "**/.venv/**",
        "**/venv/**",
        "**/__pycache__/**",
        "**/*.{test,spec}.{ts,tsx,js,jsx}",
        "**/test_*.py",
        "**/*_test.py",
    ],
    catalog: "erroratlas.catalog.json",
    docs: "docs/errors.md",
    failOn: "error",
};
export function defaultRawConfig() {
    return {
        include: DEFAULTS.include,
        exclude: DEFAULTS.exclude,
        catalog: DEFAULTS.catalog,
        docs: DEFAULTS.docs,
        failOn: DEFAULTS.failOn,
        useDefaultConstructors: true,
        constructors: {
            typescript: [],
            python: [],
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
    return {
        include: raw.include ?? DEFAULTS.include,
        exclude: raw.exclude ?? DEFAULTS.exclude,
        catalog: raw.catalog ?? DEFAULTS.catalog,
        docs: raw.docs ?? DEFAULTS.docs,
        failOn: raw.failOn ?? DEFAULTS.failOn,
        constructors: {
            typescript: mergeConstructors(useDefaults ? DEFAULT_CONSTRUCTORS.typescript : [], raw.constructors?.typescript ?? []),
            python: mergeConstructors(useDefaults ? DEFAULT_CONSTRUCTORS.python : [], raw.constructors?.python ?? []),
        },
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
    for (const language of ["typescript", "python"]) {
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