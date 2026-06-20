class AppError(Exception):
    pass


def charge(card_token: str | None) -> None:
    if not card_token:
        raise AppError("CARD_REQUIRED", "A card token is required", 400)
    raise AppError("PAYMENT_DECLINED", "The payment was declined", 402)
