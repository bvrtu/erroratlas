class Cases {
  void structured() {
    throw new ApiException("JAVA_USER_MISSING", "User was not found");
  }

  void dynamic(String dynamicCode) {
    throw new ApiException(dynamicCode, "Dynamic code remains unresolved");
  }

  void generic() {
    throw new IllegalStateException("Invalid state");
  }

  Exception noise() {
    return new IllegalArgumentException("JAVA_NOISE");
  }
}
