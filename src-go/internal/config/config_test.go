// src-go/internal/config/config_test.go
package config_test

import (
	"os"
	"strings"
	"testing"

	"github.com/react-go-quick-starter/server/internal/config"
	"github.com/spf13/viper"
)

// resetViper clears viper's global state and changes to a temp dir so that
// any src-go/.env file on disk does not pollute the test.
func resetViper(t *testing.T) {
	t.Helper()
	viper.Reset()
	tmp := t.TempDir()
	orig, _ := os.Getwd()
	if err := os.Chdir(tmp); err != nil {
		t.Fatalf("chdir to temp: %v", err)
	}
	t.Cleanup(func() {
		viper.Reset()
		_ = os.Chdir(orig)
	})
}

func TestLoad_Defaults(t *testing.T) {
	resetViper(t)

	cfg := config.Load()

	if cfg.Port != "7777" {
		t.Errorf("Port: want 7777, got %s", cfg.Port)
	}
	if cfg.Env != "development" {
		t.Errorf("Env: want development, got %s", cfg.Env)
	}
	if cfg.JWTAccessTTL.Minutes() != 15 {
		t.Errorf("JWTAccessTTL: want 15m, got %v", cfg.JWTAccessTTL)
	}
	if cfg.JWTRefreshTTL.Hours() != 168 {
		t.Errorf("JWTRefreshTTL: want 168h, got %v", cfg.JWTRefreshTTL)
	}
	if len(cfg.AllowOrigins) == 0 {
		t.Error("AllowOrigins: want non-empty slice, got empty")
	}
	if cfg.MetricsBind == "" {
		t.Error("MetricsBind: want default, got empty")
	}
}

func TestLoad_PortEnvOverride(t *testing.T) {
	resetViper(t)
	t.Setenv("PORT", "9999")

	cfg := config.Load()
	if cfg.Port != "9999" {
		t.Errorf("Port: want 9999 after env override, got %s", cfg.Port)
	}
}

func TestLoad_RedisURLDefault(t *testing.T) {
	resetViper(t)

	cfg := config.Load()
	if cfg.RedisURL == "" {
		t.Error("RedisURL: want non-empty default, got empty")
	}
}

func TestValidate_DevPasses(t *testing.T) {
	resetViper(t)

	cfg := config.Load()
	if err := cfg.Validate(); err != nil {
		t.Errorf("dev defaults should validate, got %v", err)
	}
}

func TestValidate_ProductionRequiresSecret(t *testing.T) {
	resetViper(t)
	t.Setenv("ENV", "production")
	t.Setenv("POSTGRES_URL", "postgres://example/db")

	cfg := config.Load()
	err := cfg.Validate()
	if err == nil {
		t.Fatal("expected validation error for missing JWT_SECRET in production")
	}
	if !strings.Contains(err.Error(), "JWT_SECRET") {
		t.Errorf("error should mention JWT_SECRET, got: %v", err)
	}
}

func TestValidate_ProductionRequiresPostgres(t *testing.T) {
	resetViper(t)
	t.Setenv("ENV", "production")
	t.Setenv("JWT_SECRET", "this-is-thirty-two-characters-yo")

	cfg := config.Load()
	err := cfg.Validate()
	if err == nil {
		t.Fatal("expected validation error for missing POSTGRES_URL in production")
	}
	if !strings.Contains(err.Error(), "POSTGRES_URL") {
		t.Errorf("error should mention POSTGRES_URL, got: %v", err)
	}
}

func TestValidate_ProductionRejectsWildcardOrigin(t *testing.T) {
	resetViper(t)
	t.Setenv("ENV", "production")
	t.Setenv("JWT_SECRET", "this-is-thirty-two-characters-yo")
	t.Setenv("POSTGRES_URL", "postgres://example/db")
	t.Setenv("ALLOW_ORIGINS", "*")

	cfg := config.Load()
	err := cfg.Validate()
	if err == nil || !strings.Contains(err.Error(), "ALLOW_ORIGINS") {
		t.Errorf("expected wildcard-origin rejection in production, got %v", err)
	}
}

func TestValidate_RefreshTTLMustExceedAccess(t *testing.T) {
	resetViper(t)
	t.Setenv("JWT_ACCESS_TTL", "1h")
	t.Setenv("JWT_REFRESH_TTL", "30m")

	cfg := config.Load()
	err := cfg.Validate()
	if err == nil || !strings.Contains(err.Error(), "JWT_REFRESH_TTL") {
		t.Errorf("expected refresh<=access rejection, got %v", err)
	}
}

func TestString_RedactsCredentials(t *testing.T) {
	resetViper(t)
	t.Setenv("POSTGRES_URL", "postgres://user:secret@localhost:5432/db")

	cfg := config.Load()
	out := cfg.String()
	if strings.Contains(out, "secret") {
		t.Errorf("String() should redact credentials, got %s", out)
	}
}
