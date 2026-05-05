// Package handler implements HTTP request handlers for the API.
package handler

import (
	"errors"
	"net/http"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/react-go-quick-starter/server/internal/middleware"
	"github.com/react-go-quick-starter/server/internal/model"
	"github.com/react-go-quick-starter/server/internal/service"
)

type AuthHandler struct {
	authSvc      *service.AuthService
	jwtAccessTTL time.Duration
}

func NewAuthHandler(authSvc *service.AuthService, jwtAccessTTL time.Duration) *AuthHandler {
	return &AuthHandler{authSvc: authSvc, jwtAccessTTL: jwtAccessTTL}
}

// Register godoc
// @Summary      Register a new account
// @Description  Creates a user, hashes the password with bcrypt, and returns access + refresh tokens.
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        body body model.RegisterRequest true "Registration payload"
// @Success      201 {object} model.AuthResponse
// @Failure      409 {object} model.ErrorResponse "Email already exists"
// @Failure      422 {object} model.ErrorResponse "Validation failed"
// @Router       /auth/register [post]
func (h *AuthHandler) Register(c echo.Context) error {
	req := new(model.RegisterRequest)
	if err := c.Bind(req); err != nil {
		return c.JSON(http.StatusBadRequest, model.ErrorResponse{Message: "invalid request body"})
	}
	if err := c.Validate(req); err != nil {
		return c.JSON(http.StatusUnprocessableEntity, model.ErrorResponse{Message: err.Error()})
	}

	resp, err := h.authSvc.Register(c.Request().Context(), req)
	if err != nil {
		if errors.Is(err, service.ErrEmailAlreadyExists) {
			return c.JSON(http.StatusConflict, model.ErrorResponse{Message: "email already exists"})
		}
		return c.JSON(http.StatusInternalServerError, model.ErrorResponse{Message: "registration failed"})
	}

	return c.JSON(http.StatusCreated, resp)
}

// Login godoc
// @Summary      Sign in with email and password
// @Description  Verifies credentials and returns a fresh access + refresh token pair.
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        body body model.LoginRequest true "Login payload"
// @Success      200 {object} model.AuthResponse
// @Failure      401 {object} model.ErrorResponse "Invalid credentials"
// @Failure      422 {object} model.ErrorResponse "Validation failed"
// @Router       /auth/login [post]
func (h *AuthHandler) Login(c echo.Context) error {
	req := new(model.LoginRequest)
	if err := c.Bind(req); err != nil {
		return c.JSON(http.StatusBadRequest, model.ErrorResponse{Message: "invalid request body"})
	}
	if err := c.Validate(req); err != nil {
		return c.JSON(http.StatusUnprocessableEntity, model.ErrorResponse{Message: err.Error()})
	}

	resp, err := h.authSvc.Login(c.Request().Context(), req)
	if err != nil {
		if errors.Is(err, service.ErrInvalidCredentials) {
			return c.JSON(http.StatusUnauthorized, model.ErrorResponse{Message: "invalid email or password"})
		}
		return c.JSON(http.StatusInternalServerError, model.ErrorResponse{Message: "login failed"})
	}

	return c.JSON(http.StatusOK, resp)
}

// Refresh godoc
// @Summary      Rotate access and refresh tokens
// @Description  Validates the refresh token against Redis and issues a new pair. Old tokens are revoked.
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        body body model.RefreshRequest true "Refresh payload"
// @Success      200 {object} model.AuthResponse
// @Failure      401 {object} model.ErrorResponse "Invalid or expired refresh token"
// @Router       /auth/refresh [post]
func (h *AuthHandler) Refresh(c echo.Context) error {
	req := new(model.RefreshRequest)
	if err := c.Bind(req); err != nil {
		return c.JSON(http.StatusBadRequest, model.ErrorResponse{Message: "invalid request body"})
	}
	if err := c.Validate(req); err != nil {
		return c.JSON(http.StatusUnprocessableEntity, model.ErrorResponse{Message: err.Error()})
	}

	resp, err := h.authSvc.Refresh(c.Request().Context(), req.RefreshToken)
	if err != nil {
		if errors.Is(err, service.ErrInvalidToken) {
			return c.JSON(http.StatusUnauthorized, model.ErrorResponse{Message: "invalid or expired refresh token"})
		}
		return c.JSON(http.StatusInternalServerError, model.ErrorResponse{Message: "token refresh failed"})
	}

	return c.JSON(http.StatusOK, resp)
}

// Logout godoc
// @Summary      Revoke the current access token
// @Description  Adds the JWT JTI to the blacklist for its remaining TTL and deletes the refresh token.
// @Tags         auth
// @Produce      json
// @Security     BearerAuth
// @Success      200 {object} map[string]string
// @Failure      401 {object} model.ErrorResponse "Unauthorized"
// @Router       /auth/logout [post]
func (h *AuthHandler) Logout(c echo.Context) error {
	claims, err := middleware.GetClaims(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, model.ErrorResponse{Message: "unauthorized"})
	}

	// Calculate remaining TTL of the access token
	remaining := time.Until(claims.ExpiresAt.Time)
	if remaining < 0 {
		remaining = 0
	}

	if err := h.authSvc.Logout(c.Request().Context(), claims.UserID, claims.JTI, remaining); err != nil {
		return c.JSON(http.StatusInternalServerError, model.ErrorResponse{Message: "logout failed"})
	}

	return c.JSON(http.StatusOK, map[string]string{"message": "logged out successfully"})
}

// GetMe godoc
// @Summary      Return the authenticated user
// @Description  Echoes the user payload encoded in the access token claims.
// @Tags         users
// @Produce      json
// @Security     BearerAuth
// @Success      200 {object} model.UserDTO
// @Failure      401 {object} model.ErrorResponse "Unauthorized"
// @Router       /users/me [get]
func (h *AuthHandler) GetMe(c echo.Context) error {
	claims, err := middleware.GetClaims(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, model.ErrorResponse{Message: "unauthorized"})
	}

	return c.JSON(http.StatusOK, model.UserDTO{
		ID:    claims.UserID,
		Email: claims.Email,
	})
}
