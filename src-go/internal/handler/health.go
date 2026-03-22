package handler

import (
	"net/http"
	"time"

	"github.com/labstack/echo/v4"
)

type HealthHandler struct {
	version string
	env     string
}

func NewHealthHandler(version, env string) *HealthHandler {
	return &HealthHandler{version: version, env: env}
}

func (h *HealthHandler) Health(c echo.Context) error {
	return c.JSON(http.StatusOK, map[string]string{
		"status": "ok",
		"time":   time.Now().UTC().Format(time.RFC3339),
	})
}

func (h *HealthHandler) HealthV1(c echo.Context) error {
	return c.JSON(http.StatusOK, map[string]string{
		"status":  "ok",
		"version": h.version,
		"env":     h.env,
		"time":    time.Now().UTC().Format(time.RFC3339),
	})
}
