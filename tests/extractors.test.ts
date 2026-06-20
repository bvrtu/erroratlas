import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { extractDartErrors } from "../src/extractors/dart.js";
import { extractCSharpErrors } from "../src/extractors/csharp.js";
import { extractGoErrors } from "../src/extractors/go.js";
import { extractJavaErrors } from "../src/extractors/java.js";
import { extractKotlinErrors } from "../src/extractors/kotlin.js";
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

  it("extracts local constants, direct factories, and API error responses", async () => {
    const config = await loadConfig(root);
    const errors = extractTypeScriptErrors({
      root,
      filename: path.join(root, "app/api.ts"),
      constructors: config.constructors.typescript,
      source: `
        const DIRECT_CODE = "DIRECT_FAILURE";
        const DIRECT_MESSAGE = "Direct failure";
        const DIRECT_STATUS = 409;
        const makeFailure = (code) => new AppError(code, "Factory failure", 422);

        function direct() {
          throw new AppError(DIRECT_CODE, DIRECT_MESSAGE, DIRECT_STATUS);
        }
        function factory() {
          throw makeFailure("FACTORY_FAILURE");
        }
        function next() {
          return NextResponse.json(
            { code: "NEXT_FAILURE", message: "Next failure" },
            { status: 400 },
          );
        }
        function express(res) {
          res.status(401).json({ code: "AUTH_REQUIRED", message: "Sign in" });
          res.json({ ok: true });
        }
        function fastify(reply) {
          reply.code(503).send({ errorCode: "UPSTREAM_DOWN", error: "Retry later" });
        }
      `,
    });

    expect(errors).toHaveLength(5);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "DIRECT_FAILURE",
          message: "Direct failure",
          status: 409,
          constructor: "AppError",
        }),
        expect.objectContaining({
          code: "FACTORY_FAILURE",
          status: 422,
          constructor: "makeFailure()",
        }),
        expect.objectContaining({
          code: "NEXT_FAILURE",
          status: 400,
          constructor: "NextResponse.json",
        }),
        expect.objectContaining({
          code: "AUTH_REQUIRED",
          status: 401,
          constructor: "response.status().json()",
        }),
        expect.objectContaining({
          code: "UPSTREAM_DOWN",
          message: "Retry later",
          status: 503,
          constructor: "reply.code().send()",
        }),
      ]),
    );
  });

  it("classifies basic try/catch and response control flow", async () => {
    const config = await loadConfig(root);
    const errors = extractTypeScriptErrors({
      root,
      filename: path.join(root, "src/flow.ts"),
      constructors: config.constructors.typescript,
      source: `
        function run() {
          try {
            throw new AppError("CAUGHT_ERROR", "Caught", 400);
          } catch (error) {
            throw new AppError("RETHROWN_ERROR", "Rethrown", 500);
          }
        }
        function direct() {
          throw new AppError("PROPAGATED_ERROR", "Propagated", 500);
        }
        function response() {
          return NextResponse.json(
            { code: "RETURNED_ERROR", message: "Returned" },
            { status: 409 },
          );
        }
      `,
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "CAUGHT_ERROR", flow: "caught" }),
        expect.objectContaining({ code: "RETHROWN_ERROR", flow: "rethrown" }),
        expect.objectContaining({
          code: "PROPAGATED_ERROR",
          flow: "propagated",
        }),
        expect.objectContaining({ code: "RETURNED_ERROR", flow: "returned" }),
      ]),
    );
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

describe("Go extraction", () => {
  it("finds structured returned errors, panics, and generic errors", async () => {
    const config = await loadConfig(root);
    const errors = extractGoErrors({
      root,
      filename: path.join(root, "service.go"),
      constructors: config.constructors.go,
      source: `
        package service
        func load() error {
          return NewAppError("USER_NOT_FOUND", "No user", 404)
        }
        func fail() {
          panic(NewAPIError("INTERNAL_FAILURE", "Failed", 500))
        }
        func validate() error {
          return errors.New("Invalid input")
        }
      `,
    });

    expect(errors).toEqual([
      expect.objectContaining({
        code: "USER_NOT_FOUND",
        status: 404,
        language: "go",
      }),
      expect.objectContaining({
        code: "INTERNAL_FAILURE",
        status: 500,
        language: "go",
      }),
      expect.objectContaining({
        code: null,
        constructor: "errors.New",
        language: "go",
      }),
    ]);
  });
});

describe("C# extraction", () => {
  it("finds structured and generic exceptions", async () => {
    const config = await loadConfig(root);
    const errors = extractCSharpErrors({
      root,
      filename: path.join(root, "Users.cs"),
      constructors: config.constructors.csharp,
      source: `
        class Users {
          void Find() { throw new ApiException("USER_NOT_FOUND", "No user", 404); }
          void Fail() { throw new InvalidOperationException("Invalid state"); }
        }
      `,
    });

    expect(errors).toEqual([
      expect.objectContaining({
        code: "USER_NOT_FOUND",
        status: 404,
        language: "csharp",
      }),
      expect.objectContaining({
        code: null,
        constructor: "InvalidOperationException",
      }),
    ]);
  });
});

describe("Kotlin extraction", () => {
  it("finds structured and generic exceptions", async () => {
    const config = await loadConfig(root);
    const errors = extractKotlinErrors({
      root,
      filename: path.join(root, "Users.kt"),
      constructors: config.constructors.kotlin,
      source: `
        fun find() { throw ApiException("USER_NOT_FOUND", "No user", 404) }
        fun fail() { throw IllegalStateException("Invalid state") }
      `,
    });

    expect(errors).toEqual([
      expect.objectContaining({
        code: "USER_NOT_FOUND",
        status: 404,
        language: "kotlin",
      }),
      expect.objectContaining({
        code: null,
        constructor: "IllegalStateException",
      }),
    ]);
  });
});
