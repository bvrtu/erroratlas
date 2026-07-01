func structured() throws {
  throw APIError.failure("SWIFT_USER_MISSING", "User was not found", 404)
}

func dynamic(_ dynamicCode: String) throws {
  throw APIError.failure(dynamicCode, "Dynamic code remains unresolved", 500)
}

func generic() throws {
  throw NetworkError.offline
}

let ignored = NetworkError.offline
