package middleware

import (
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/react-go-quick-starter/server/internal/model"
)

// RequireRole returns a middleware that allows the request only if the JWT
// claims include all of the given role names. Use after JWTMiddleware.
func RequireRole(roles ...string) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			claims, err := GetClaims(c)
			if err != nil {
				return c.JSON(http.StatusUnauthorized, model.ErrorResponse{Message: "unauthorized"})
			}
			for _, r := range roles {
				if !claims.HasRole(r) {
					return c.JSON(http.StatusForbidden, model.ErrorResponse{Message: "insufficient role"})
				}
			}
			return next(c)
		}
	}
}

// RequirePermission returns a middleware that allows the request only if the
// JWT claims include all of the given permissions. Use after JWTMiddleware.
func RequirePermission(perms ...string) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			claims, err := GetClaims(c)
			if err != nil {
				return c.JSON(http.StatusUnauthorized, model.ErrorResponse{Message: "unauthorized"})
			}
			for _, p := range perms {
				if !claims.HasPermission(p) {
					return c.JSON(http.StatusForbidden, model.ErrorResponse{Message: "permission denied"})
				}
			}
			return next(c)
		}
	}
}
