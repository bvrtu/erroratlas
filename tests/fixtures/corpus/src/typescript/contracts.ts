export function makeProblem({ code, detail = "Factory detail", status = 500 }) {
  return new AppError(code, detail, status);
}
