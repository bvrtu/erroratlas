def structured():
    raise AppError("PY_PAYMENT_DECLINED", "Payment was declined", 402)


def fastapi_problem():
    raise HTTPException(
        status_code=404,
        detail={"code": "PY_USER_MISSING", "message": "User was not found"},
    )


def dynamic(dynamic_code):
    raise AppError(dynamic_code, "Dynamic code remains unresolved", 500)


# Instantiation without raise is noise.
ignored = ValueError("PY_NOISE")
