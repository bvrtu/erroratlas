import { describe, expect, it } from "vitest";
import {
  buildBaseline,
  diagnosticFingerprint,
  filterBaselineDiagnostics,
} from "../src/baseline.js";
import type { Diagnostic } from "../src/types.js";

const known: Diagnostic = {
  ruleId: "unstructured-error",
  severity: "warning",
  message: "Error has no static machine-readable error code.",
  code: null,
  location: {
    file: "src/service.ts",
    line: 10,
    column: 3,
    endLine: 10,
    endColumn: 20,
  },
};

describe("baseline mode", () => {
  it("filters known debt while keeping net-new diagnostics", () => {
    const baseline = buildBaseline([known], "2026-06-20T00:00:00.000Z");
    const moved = {
      ...known,
      location: { ...known.location!, line: 30, endLine: 30 },
    };
    const newDiagnostic: Diagnostic = {
      ...known,
      ruleId: "undocumented-error",
      severity: "error",
      code: "NEW_ERROR",
      message: "NEW_ERROR exists in source but is missing from the catalog.",
    };

    expect(filterBaselineDiagnostics([moved, newDiagnostic], baseline)).toEqual(
      [newDiagnostic],
    );
  });

  it("uses counts so duplicate findings are not hidden indefinitely", () => {
    const baseline = buildBaseline([known]);
    expect(filterBaselineDiagnostics([known, known], baseline)).toEqual([
      known,
    ]);
    expect(baseline.fingerprints).toEqual([diagnosticFingerprint(known)]);
  });
});
