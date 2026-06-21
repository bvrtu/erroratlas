fun structured() {
    throw ApiException("KOTLIN_USER_MISSING", "User was not found", 404)
}

fun dynamic(dynamicCode: String) {
    throw ApiException(dynamicCode, "Dynamic code remains unresolved", 500)
}

fun generic() {
    throw IllegalStateException("Invalid state")
}

val ignored = IllegalStateException("KOTLIN_NOISE")
