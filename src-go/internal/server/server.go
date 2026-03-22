// Package server configures the Echo HTTP server with middleware and settings.
package server

import (
	"github.com/labstack/echo/v4"
	echomiddleware "github.com/labstack/echo/v4/middleware"
	"github.com/labstack/gommon/log"
	"github.com/react-go-quick-starter/server/internal/config"
	"github.com/react-go-quick-starter/server/internal/repository"
)

func New(cfg *config.Config, cache *repository.CacheRepository) *echo.Echo {
	e := echo.New()
	e.HideBanner = true
	e.HidePort = false

	if cfg.Env == "production" {
		e.Logger.SetLevel(log.WARN)
	} else {
		e.Logger.SetLevel(log.DEBUG)
	}

	// Middleware stack (order matters)
	e.Use(echomiddleware.Recover())
	e.Use(echomiddleware.RequestID())
	e.Use(echomiddleware.RequestLoggerWithConfig(echomiddleware.RequestLoggerConfig{
		LogMethod:    true,
		LogURI:       true,
		LogStatus:    true,
		LogLatency:   true,
		LogRequestID: true,
		LogError:     true,
		HandleError:  true,
		LogValuesFunc: func(c echo.Context, v echomiddleware.RequestLoggerValues) error {
			if v.Error != nil {
				c.Logger().Errorf("method=%s uri=%s status=%d latency=%dms reqid=%s err=%v",
					v.Method, v.URI, v.Status, v.Latency.Milliseconds(), v.RequestID, v.Error)
			} else {
				c.Logger().Infof("method=%s uri=%s status=%d latency=%dms reqid=%s",
					v.Method, v.URI, v.Status, v.Latency.Milliseconds(), v.RequestID)
			}
			return nil
		},
	}))
	e.Use(echomiddleware.CORSWithConfig(echomiddleware.CORSConfig{
		AllowOrigins:     cfg.AllowOrigins,
		AllowMethods:     []string{echo.GET, echo.POST, echo.PUT, echo.DELETE, echo.OPTIONS, echo.PATCH},
		AllowHeaders:     []string{"Content-Type", "Authorization", "X-Request-ID", "Accept"},
		ExposeHeaders:    []string{"X-Request-ID"},
		AllowCredentials: true,
		MaxAge:           3600,
	}))
	e.Use(echomiddleware.SecureWithConfig(echomiddleware.SecureConfig{
		XSSProtection:      "1; mode=block",
		ContentTypeNosniff: "nosniff",
		XFrameOptions:      "DENY",
	}))
	e.Use(echomiddleware.GzipWithConfig(echomiddleware.GzipConfig{Level: 5}))

	return e
}
