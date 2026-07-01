class Cases
{
    void Structured()
    {
        throw new ApiException("CS_USER_MISSING", "User was not found", 404);
    }

    void Dynamic(string dynamicCode)
    {
        throw new ApiException(dynamicCode, "Dynamic code remains unresolved", 500);
    }

    void Generic()
    {
        throw new InvalidOperationException("Invalid state");
    }

    Exception Noise() => new InvalidOperationException("CS_NOISE");
}
