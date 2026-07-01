import { makeProblem } from "./index";

export function factoryCase() {
  throw makeProblem({ code: "TS_FACTORY", status: 409 });
}

export function problemCase() {
  return NextResponse.json(
    {
      type: "https://example.test/problems/user-missing",
      title: "User missing",
      detail: "No user exists for this identifier",
      code: "TS_PROBLEM",
      retryable: false,
    },
    { status: 404 },
  );
}

export function dynamicCase(dynamicCode: string) {
  throw new AppError(dynamicCode, "Dynamic code remains unresolved", 500);
}

// Constructor calls that are not thrown or returned error responses are noise.
const ignored = new AppError("TS_NOISE", "Not emitted", 500);
void ignored;
