import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { extractDartErrors } from "../src/extractors/dart.js";
import { extractJavaErrors } from "../src/extractors/java.js";
import { extractPythonErrors } from "../src/extractors/python.js";
import { extractSwiftErrors } from "../src/extractors/swift.js";
import { extractTypeScriptErrors } from "../src/extractors/typescript.js";

const root = path.resolve("/fixture");

describe("TypeScript extraction", () => {
  it("finds positional, object-style, and unstructured errors", async () => {
    const config = await loadConfig(root);
    const errors = extractTypeScriptErrors({
      root,
      filename: path.join(root, "src/users.ts"),
      constructors: config.constructors.typescript,
      source: `
        export function findUser(id: string) {
          if (!id) throw new AppError("USER_ID_REQUIRED", "User id is required", { status: 400 });
          if (id === "gone") {
            throw new NotFoundException({
              code: "USER_NOT_FOUND",
              message: "User was not found"
            });
          }
          throw new Error("Database unavailable");
        }
      `,
    });

    expect(errors).toHaveLength(3);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "USER_ID_REQUIRED",
          message: "User id is required",
          status: 400,
          structured: true,
        }),
        expect.objectContaining({
          code: "USER_NOT_FOUND",
          message: "User was not found",
          status: 404,
          structured: true,
        }),
        expect.objectContaining({
          code: null,
          message: "Database unavailable",
          constructor: "Error",
          structured: false,
        }),
      ]),
    );
  });

  it("supports Firebase HttpsError and reports unknown multi-argument errors", async () => {
    const config = await loadConfig(root);
    const errors = extractTypeScriptErrors({
      root,
      filename: path.join(root, "functions/index.js"),
      constructors: config.constructors.typescript,
      source: `
        throw new functions.https.HttpsError(
          "unauthenticated",
          "Authentication is required"
        );
        throw new VendorError("Provider failed", { retryable: true });
      `,
    });

    expect(errors).toEqual([
      expect.objectContaining({
        code: "unauthenticated",
        message: "Authentication is required",
        constructor: "functions.https.HttpsError",
        structured: true,
      }),
      expect.objectContaining({
        code: null,
        message: "Provider failed",
        constructor: "VendorError",
        structured: false,
      }),
    ]);
  });
});

describe("Python extraction", () => {
  it("finds custom exceptions, FastAPI details, and unstructured errors", async () => {
    const config = await loadConfig(root);
    const errors = extractPythonErrors({
      root,
      filename: path.join(root, "app/payments.py"),
      constructors: config.constructors.python,
      source: `
def charge(card):
    if card is None:
        raise AppError("CARD_REQUIRED", "A card is required", 400)
    if card == "missing":
        raise HTTPException(
            status_code=404,
            detail={"code": "CARD_NOT_FOUND", "message": "Card was not found"},
        )
    raise ValueError("Unsupported card")
      `,
    });

    expect(errors).toHaveLength(3);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "CARD_REQUIRED",
          message: "A card is required",
          status: 400,
        }),
        expect.objectContaining({
          code: "CARD_NOT_FOUND",
          message: "Card was not found",
          status: 404,
        }),
        expect.objectContaining({ code: null, constructor: "ValueError" }),
      ]),
    );
  });

  it("reports unknown exceptions with multiple arguments", async () => {
    const config = await loadConfig(root);
    const errors = extractPythonErrors({
      root,
      filename: path.join(root, "app/files.py"),
      constructors: config.constructors.python,
      source: 'raise OSError(2, "File is missing")',
    });

    expect(errors).toEqual([
      expect.objectContaining({
        code: null,
        constructor: "OSError",
        structured: false,
      }),
    ]);
  });
});

describe("Java extraction", () => {
  it("finds structured and generic Java exceptions", async () => {
    const config = await loadConfig(root);
    const errors = extractJavaErrors({
      root,
      filename: path.join(root, "src/Users.java"),
      constructors: config.constructors.java,
      source: `
        class Users {
          void find() {
            throw new ApiException("USER_NOT_FOUND", "No user");
          }
          void fail() {
            throw new IllegalStateException("Invalid state", new Exception());
          }
        }
      `,
    });

    expect(errors).toEqual([
      expect.objectContaining({
        code: "USER_NOT_FOUND",
        message: "No user",
        language: "java",
      }),
      expect.objectContaining({
        code: null,
        message: "Invalid state",
        constructor: "IllegalStateException",
      }),
    ]);
  });
});

describe("Dart extraction", () => {
  it("finds structured, generic, and expression throws", async () => {
    const config = await loadConfig(root);
    const errors = extractDartErrors({
      root,
      filename: path.join(root, "lib/users.dart"),
      constructors: config.constructors.dart,
      source: `
        void find() {
          throw AppException('USER_NOT_FOUND', 'No user');
        }
        void fail() {
          throw StateError('Invalid state');
        }
        void rethrowValue(dynamic existingError) {
          throw existingError;
        }
      `,
    });

    expect(errors).toEqual([
      expect.objectContaining({ code: "USER_NOT_FOUND", language: "dart" }),
      expect.objectContaining({
        code: null,
        message: "Invalid state",
        constructor: "StateError",
      }),
      expect.objectContaining({
        code: null,
        message: null,
        constructor: "existingError",
      }),
    ]);
  });
});

describe("Swift extraction", () => {
  it("finds call and enum-case throws", async () => {
    const config = await loadConfig(root);
    const errors = extractSwiftErrors({
      root,
      filename: path.join(root, "Sources/Users.swift"),
      constructors: config.constructors.swift,
      source: `
        func find() throws {
          throw APIError.notFound("No user")
        }
        func fail() throws {
          throw NetworkError.offline
        }
      `,
    });

    expect(errors).toEqual([
      expect.objectContaining({
        constructor: "APIError.notFound",
        message: "No user",
        language: "swift",
      }),
      expect.objectContaining({
        constructor: "NetworkError.offline",
        message: null,
        language: "swift",
      }),
    ]);
  });
});
