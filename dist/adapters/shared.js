export function problemFromError(error, options = {}, instance) {
    const record = isRecord(error) ? error : {};
    const status = readNumber(record, ["status", "statusCode", "status_code"]) ?? 500;
    const code = readString(record, ["code", "errorCode", "error_code"]);
    const name = error instanceof Error ? error.name : "Error";
    const message = error instanceof Error ? error.message : "An unexpected error occurred";
    const slug = code?.toLowerCase().replace(/_/g, "-") ?? "internal-error";
    return {
        type: `${(options.problemTypeBase ?? "about:blank").replace(/\/$/, "")}${options.problemTypeBase ? `/${slug}` : ""}`,
        title: code ? humanize(code) : name,
        status,
        ...(options.exposeDetail ? { detail: message } : {}),
        ...(instance ? { instance } : {}),
        ...(code ? { code } : {}),
    };
}
export function traceIdFromRequest(request) {
    if (!isRecord(request))
        return undefined;
    if (typeof request.id === "string")
        return request.id;
    const headers = isRecord(request.headers) ? request.headers : {};
    for (const key of ["x-request-id", "traceparent"]) {
        if (typeof headers[key] === "string")
            return headers[key];
    }
    return undefined;
}
function readString(value, keys) {
    return keys
        .map((key) => value[key])
        .find((item) => typeof item === "string");
}
function readNumber(value, keys) {
    return keys
        .map((key) => value[key])
        .find((item) => typeof item === "number");
}
function humanize(code) {
    return code
        .toLowerCase()
        .split(/[_-]+/)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}
function isRecord(value) {
    return typeof value === "object" && value !== null;
}
//# sourceMappingURL=shared.js.map