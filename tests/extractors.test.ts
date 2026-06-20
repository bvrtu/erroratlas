import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { extractPythonErrors } from "../src/extractors/python.js";
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
});
