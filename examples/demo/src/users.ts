class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly options: { status: number },
  ) {
    super(message);
  }
}

export function getUser(id: string | null): never {
  if (!id) {
    throw new AppError("USER_ID_REQUIRED", "A user id is required", {
      status: 400,
    });
  }
  throw new AppError("USER_NOT_FOUND", "The requested user was not found", {
    status: 404,
  });
}
