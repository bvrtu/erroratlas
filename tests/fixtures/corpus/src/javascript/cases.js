export function expressCase(res) {
  res.status(401).json({
    code: "JS_AUTH_REQUIRED",
    message: "Authentication is required",
  });
  res.json({ ok: true });
}

// A successful response with a string called code is not an error contract.
export function noise(res) {
  res.status(200).json({ code: "JS_SUCCESS", value: 1 });
  res.status(302).json({ code: "JS_REDIRECT", location: "/login" });
}
