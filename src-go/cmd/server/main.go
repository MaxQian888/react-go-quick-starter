package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"runtime"
	"syscall"
	"time"

	"github.com/react-go-quick-starter/server/internal/config"
	"github.com/react-go-quick-starter/server/internal/repository"
	"github.com/react-go-quick-starter/server/internal/server"
	"github.com/react-go-quick-starter/server/internal/service"
	"github.com/react-go-quick-starter/server/pkg/database"
)

func main() {
	// CLI flags — override env vars when passed (e.g. by Tauri sidecar)
	portFlag := flag.String("port", "", "HTTP port to listen on (overrides PORT env var)")
	flag.Parse()

	// Apply --port flag before loading config
	if *portFlag != "" {
		os.Setenv("PORT", *portFlag)
	}

	cfg := config.Load()

	// Dev fallback: auto-generate a secret so the server starts without config.
	// NEVER use this in production.
	if cfg.JWTSecret == "" {
		if cfg.Env == "production" {
			log.Fatal("JWT_SECRET environment variable is required in production")
		}
		cfg.JWTSecret = "dev-secret-change-me-in-production-32ch"
		log.Println("WARNING: JWT_SECRET not set — using insecure dev default. Set JWT_SECRET for real usage.")
	}

	// Connect to PostgreSQL (optional — server starts in degraded mode if unavailable)
	db, err := database.NewPostgres(cfg.PostgresURL)
	if err != nil {
		log.Printf("Warning: PostgreSQL unavailable: %v (auth endpoints will not work)", err)
		db = nil
	}

	// Connect to Redis (optional)
	rdb, err := database.NewRedis(cfg.RedisURL)
	if err != nil {
		log.Printf("Warning: Redis unavailable: %v (token cache disabled)", err)
		rdb = nil
	}

	// Run database migrations if DB is available
	if db != nil {
		migrationsPath := migrationsDir()
		if err := database.RunMigrations(cfg.PostgresURL, migrationsPath); err != nil {
			log.Printf("Warning: migration error: %v", err)
		}
	}

	// Wire up dependencies
	userRepo := repository.NewUserRepository(db)
	cacheRepo := repository.NewCacheRepository(rdb)
	authSvc := service.NewAuthService(userRepo, cacheRepo, cfg)

	// Create Echo instance and register routes
	e := server.New(cfg, cacheRepo)
	server.RegisterRoutes(e, cfg, authSvc, cacheRepo)

	// Graceful shutdown on SIGINT / SIGTERM
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-quit
		log.Println("Shutting down server...")
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := e.Shutdown(ctx); err != nil {
			e.Logger.Error(err)
		}
		if db != nil {
			db.Close()
		}
		if rdb != nil {
			_ = rdb.Close()
		}
	}()

	addr := fmt.Sprintf(":%s", cfg.Port)
	log.Printf("Starting server on %s (env=%s)", addr, cfg.Env)

	if err := e.Start(addr); err != nil && err != http.ErrServerClosed {
		e.Logger.Fatal(err)
	}

	log.Println("Server stopped")
}

// migrationsDir returns the path to the migrations directory.
// Compiled binary: relative to executable. go run: relative to source file.
func migrationsDir() string {
	exe, err := os.Executable()
	if err == nil {
		candidate := filepath.Join(filepath.Dir(exe), "migrations")
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
	}
	_, filename, _, _ := runtime.Caller(0)
	return filepath.Join(filepath.Dir(filename), "..", "..", "migrations")
}
