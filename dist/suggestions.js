export function suggestCatalogDocumentation(catalog) {
    return catalog.errors
        .map((entry) => {
        const suggestion = { code: entry.code };
        if (!entry.description.trim()) {
            suggestion.description = entry.message
                ? sentence(entry.message)
                : `The operation failed because ${humanizeCode(entry.code).toLowerCase()}.`;
        }
        if (!entry.resolution.trim()) {
            suggestion.resolution = resolutionForStatus(entry.status);
        }
        return suggestion;
    })
        .filter((suggestion) => suggestion.description || suggestion.resolution);
}
export function applyCatalogDocumentation(catalog, suggestions = suggestCatalogDocumentation(catalog)) {
    const byCode = new Map(suggestions.map((item) => [item.code, item]));
    return {
        ...catalog,
        errors: catalog.errors.map((entry) => {
            const suggestion = byCode.get(entry.code);
            return {
                ...entry,
                description: entry.description || suggestion?.description || "",
                resolution: entry.resolution || suggestion?.resolution || "",
            };
        }),
    };
}
export function renderCatalogSuggestions(suggestions) {
    if (suggestions.length === 0)
        return "No documentation gaps found.\n";
    const lines = [`Documentation suggestions: ${suggestions.length}`, ""];
    for (const suggestion of suggestions) {
        lines.push(suggestion.code);
        if (suggestion.description) {
            lines.push(`  Description: ${suggestion.description}`);
        }
        if (suggestion.resolution) {
            lines.push(`  Resolution: ${suggestion.resolution}`);
        }
        lines.push("");
    }
    return `${lines.join("\n").trimEnd()}\n`;
}
function resolutionForStatus(status) {
    if (status === 400)
        return "Correct the request and try again.";
    if (status === 401)
        return "Authenticate and retry the request.";
    if (status === 403)
        return "Verify that the caller has the required permissions.";
    if (status === 404)
        return "Verify that the requested resource identifier exists.";
    if (status === 409)
        return "Resolve the conflicting resource state and retry.";
    if (status === 422)
        return "Correct the invalid fields and retry.";
    if (status === 429)
        return "Wait before retrying and respect the service rate limit.";
    if (status !== null && status >= 500) {
        return "Retry with backoff; if the problem persists, contact the service owner.";
    }
    return "Review the error message and correct the triggering condition before retrying.";
}
function humanizeCode(code) {
    return code.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}
function sentence(message) {
    const trimmed = message.trim();
    if (!trimmed)
        return "The operation failed.";
    return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}
//# sourceMappingURL=suggestions.js.map