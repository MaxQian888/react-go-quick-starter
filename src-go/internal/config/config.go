// Package config loads application configuration from environment variables and .env files.
package config

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/spf13/viper"
)

type Config struct {
	Port          string
	PostgresURL   string
	RedisURL      string
	JWTSecret     string
	JWTAccessTTL  time.Duration
	JWTRefreshTTL time.Duration
	AllowOrigins  []string
	Env           string
	// MetricsBind controls where /metrics is exposed. Empty = disabled.
	// Defaults to localhost-only in dev/prod so the endpoint is not internet-facing.
	MetricsBind string
}

// Load reads configuration from env vars / .env and returns it without
// validating. Use Validate() to fail-fast at startup once defaults are merged.
func Load() *Config {
	viper.AutomaticEnv()
	viper.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))

	// Load .env file if it exists (ignore error if missing)
	viper.SetConfigFile(".env")
	viper.SetConfigType("env")
	_ = viper.ReadInConfig()

	// Defaults
	viper.SetDefault("PORT", "7777")
	viper.SetDefault("ENV", "development")
	viper.SetDefault("JWT_ACCESS_TTL", "15m")
	viper.SetDefault("JWT_REFRESH_TTL", "168h")
	viper.SetDefault("ALLOW_ORIGINS", "http://localhost:3000,tauri://localhost,http://localhost:1420")
	viper.SetDefault("REDIS_URL", "redis://localhost:6379")
	viper.SetDefault("METRICS_BIND", "127.0.0.1:9090")

	accessTTL, _ := time.ParseDuration(viper.GetString("JWT_ACCESS_TTL"))
	refreshTTL, _ := time.ParseDuration(viper.GetString("JWT_REFRESH_TTL"))

	origins := strings.Split(viper.GetString("ALLOW_ORIGINS"), ",")
	for i, o := range origins {
		origins[i] = strings.TrimSpace(o)
	}

	return &Config{
		Port:          viper.GetString("PORT"),
		PostgresURL:   viper.GetString("POSTGRES_URL"),
		RedisURL:      viper.GetString("REDIS_URL"),
		JWTSecret:     viper.GetString("JWT_SECRET"),
		JWTAccessTTL:  accessTTL,
		JWTRefreshTTL: refreshTTL,
		AllowOrigins:  origins,
		Env:           viper.GetString("ENV"),
		MetricsBind:   viper.GetString("METRICS_BIND"),
	}
}

// Validate enforces fail-fast invariants. Production deployments require a
// strong JWT secret and a real PostgreSQL URL; dev defaults are permissive so
// `pnpm dev:go` works against an empty .env. Returns a flat list of errors so
// the operator can fix everything at once.
func (c *Config) Validate() error {
	var errs []string

	if c.Port == "" {
		errs = append(errs, "PORT must be set")
	}
	if c.JWTAccessTTL <= 0 {
		errs = append(errs, "JWT_ACCESS_TTL must be a positive duration (e.g. 15m)")
	}
	if c.JWTRefreshTTL <= c.JWTAccessTTL {
		errs = append(errs, "JWT_REFRESH_TTL must be greater than JWT_ACCESS_TTL")
	}
	if len(c.AllowOrigins) == 0 || (len(c.AllowOrigins) == 1 && c.AllowOrigins[0] == "") {
		errs = append(errs, "ALLOW_ORIGINS must list at least one origin")
	}

	if c.IsProduction() {
		if len(c.JWTSecret) < 32 {
			errs = append(errs, "JWT_SECRET must be at least 32 characters in production")
		}
		if c.PostgresURL == "" {
			errs = append(errs, "POSTGRES_URL is required in production")
		}
		for _, o := range c.AllowOrigins {
			if o == "*" {
				errs = append(errs, `ALLOW_ORIGINS may not contain "*" in production`)
			}
		}
	}

	if len(errs) == 0 {
		return nil
	}
	return errors.New("invalid config:\n  - " + strings.Join(errs, "\n  - "))
}

// IsProduction returns true when the runtime environment is "production".
func (c *Config) IsProduction() bool {
	return strings.EqualFold(c.Env, "production")
}

// IsDevelopment returns true when the runtime environment is dev/local.
func (c *Config) IsDevelopment() bool {
	return !c.IsProduction()
}

// String returns a redacted summary of the loaded config, safe for logs.
func (c *Config) String() string {
	return fmt.Sprintf(
		"Config{Env=%s Port=%s Postgres=%s Redis=%s AllowOrigins=%v MetricsBind=%s JWT=<redacted>}",
		c.Env, c.Port, redactURL(c.PostgresURL), redactURL(c.RedisURL), c.AllowOrigins, c.MetricsBind,
	)
}

// redactURL strips credentials from a URL for log output. Best-effort: if the
// input doesn't look like "scheme://user:pass@host", it's returned unchanged.
func redactURL(u string) string {
	at := strings.LastIndex(u, "@")
	if at == -1 {
		return u
	}
	scheme := strings.Index(u, "://")
	if scheme == -1 || scheme > at {
		return u
	}
	return u[:scheme+3] + "***@" + u[at+1:]
}
