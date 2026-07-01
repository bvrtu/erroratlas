void structured() {
  throw AppException('DART_USER_MISSING', 'User was not found');
}

void dynamic(String dynamicCode) {
  throw AppException(dynamicCode, 'Dynamic code remains unresolved');
}

void generic() {
  throw StateError('Invalid state');
}

final ignored = StateError('DART_NOISE');
