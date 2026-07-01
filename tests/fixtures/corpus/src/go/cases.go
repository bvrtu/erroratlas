package corpus

import "errors"

func structured() error {
	return NewAppError("GO_USER_MISSING", "User was not found", 404)
}

func dynamic(dynamicCode string) error {
	return NewAppError(dynamicCode, "Dynamic code remains unresolved", 500)
}

func generic() error {
	return errors.New("Invalid state")
}

var ignored = errors.New("GO_NOISE")
