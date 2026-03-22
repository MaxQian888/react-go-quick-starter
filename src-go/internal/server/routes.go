package server

import (
	"github.com/labstack/echo/v4"
	"github.com/react-go-quick-starter/server/internal/config"
	"github.com/react-go-quick-starter/server/internal/handler"
	appMiddleware "github.com/react-go-quick-starter/server/internal/middleware"
	"github.com/react-go-quick-starter/server/internal/repository"
	"github.com/react-go-quick-starter/server/internal/service"
)

func RegisterRoutes(e *echo.Echo, cfg *config.Config, authSvc *service.AuthService, cache *repository.CacheRepository) {
	jwtMw := appMiddleware.JWTMiddleware(cfg.JWTSecret, cache)

	// Health
	healthH := handler.NewHealthHandler("1.0.0", cfg.Env)
	e.GET("/health", healthH.Health)

	// v1 group
	v1 := e.Group("/api/v1")
	v1.GET("/health", healthH.HealthV1)

	// Auth routes (public)
	authH := handler.NewAuthHandler(authSvc, cfg.JWTAccessTTL)
	auth := v1.Group("/auth")
	auth.POST("/register", authH.Register)
	auth.POST("/login", authH.Login)
	auth.POST("/refresh", authH.Refresh)
	auth.POST("/logout", authH.Logout, jwtMw)

	// User routes (protected)
	users := v1.Group("/users", jwtMw)
	users.GET("/me", authH.GetMe)

	// WebSocket
	wsH := handler.NewWSHandler(cfg.JWTSecret)
	e.GET("/ws", wsH.HandleWS)
}
