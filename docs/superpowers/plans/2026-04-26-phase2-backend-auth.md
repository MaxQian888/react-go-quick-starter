# Phase 2: Backend Auth Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Go backend with email verification, password reset, OAuth (GitHub/Google), and TOTP 2FA, backed by three new DB migrations and a mailer abstraction.

**Architecture:** All new features follow the existing layered pattern: `model` → `repository` → `service` → `handler` → registered in `server.go`. New DB tables persist refresh tokens and verification tokens. The login endpoint gains a two-step TOTP flow (returns 202 + session_token when 2FA is enabled). OAuth uses `golang.org/x/oauth2`; TOTP uses `pquerna/otp`. The mailer defaults to `NoopMailer` in dev (logs to slog) and `SMTPMailer` in production.

**Tech Stack:** Go 1.25, Echo v4, pgx v5, golang.org/x/oauth2, pquerna/otp, net/smtp, golang-migrate

---

## File Map

| Action | Path |
|--------|------|
| Create | `src-go/migrations/002_create_refresh_tokens.up.sql` |
| Create | `src-go/migrations/002_create_refresh_tokens.down.sql` |
| Create | `src-go/migrations/003_create_verification_tokens.up.sql` |
| Create | `src-go/migrations/003_create_verification_tokens.down.sql` |
| Create | `src-go/migrations/004_add_users_auth_fields.up.sql` |
| Create | `src-go/migrations/004_add_users_auth_fields.down.sql` |
| Modify | `src-go/internal/config/config.go` |
| Modify | `src-go/internal/model/user.go` |
| Create | `src-go/internal/model/auth.go` |
| Create | `src-go/internal/mailer/mailer.go` |
| Create | `src-go/internal/mailer/noop.go` |
| Create | `src-go/internal/mailer/smtp.go` |
| Create | `src-go/internal/mailer/templates/verify_email.html` |
| Create | `src-go/internal/mailer/templates/reset_password.html` |
| Create | `src-go/internal/repository/token_repository.go` |
| Create | `src-go/internal/repository/token_repository_test.go` |
| Create | `src-go/internal/crypto/totp.go` |
| Create | `src-go/internal/service/verification_service.go` |
| Create | `src-go/internal/service/verification_service_test.go` |
| Create | `src-go/internal/service/oauth_service.go` |
| Create | `src-go/internal/service/totp_service.go` |
| Create | `src-go/internal/service/totp_service_test.go` |
| Create | `src-go/internal/handler/verification.go` |
| Create | `src-go/internal/handler/oauth.go` |
| Create | `src-go/internal/handler/totp.go` |
| Modify | `src-go/internal/handler/auth.go` |
| Modify | `src-go/internal/service/auth_service.go` |
| Modify | `src-go/internal/server/server.go` |
| Modify | `src-go/go.mod` / `go.sum` |
| Modify | `.env.example` |

---

## Task 1: Add Go dependencies

**Files:**
- Modify: `src-go/go.mod`, `src-go/go.sum`

- [ ] **Step 1: Add packages**

```bash
cd src-go && go get golang.org/x/oauth2@latest && go get github.com/pquerna/otp@latest && go mod tidy
```

Expected: `go.mod` gains `golang.org/x/oauth2` and `github.com/pquerna/otp` in `require` block.

- [ ] **Step 2: Verify compilation**

```bash
cd src-go && go build ./...
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd src-go && git add go.mod go.sum
git commit -m "chore(go): add golang.org/x/oauth2 and pquerna/otp dependencies"
```

---

## Task 2: Add database migrations

**Files:**
- Create: `src-go/migrations/002_create_refresh_tokens.{up,down}.sql`
- Create: `src-go/migrations/003_create_verification_tokens.{up,down}.sql`
- Create: `src-go/migrations/004_add_users_auth_fields.{up,down}.sql`

- [ ] **Step 1: Create migration 002 up**

`src-go/migrations/002_create_refresh_tokens.up.sql`:

```sql
CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
```

- [ ] **Step 2: Create migration 002 down**

`src-go/migrations/002_create_refresh_tokens.down.sql`:

```sql
DROP TABLE IF EXISTS refresh_tokens;
```

- [ ] **Step 3: Create migration 003 up**

`src-go/migrations/003_create_verification_tokens.up.sql`:

```sql
CREATE TABLE verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('email_verify', 'password_reset')),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_verification_tokens_user_id ON verification_tokens(user_id);
```

- [ ] **Step 4: Create migration 003 down**

`src-go/migrations/003_create_verification_tokens.down.sql`:

```sql
DROP TABLE IF EXISTS verification_tokens;
```

- [ ] **Step 5: Create migration 004 up**

`src-go/migrations/004_add_users_auth_fields.up.sql`:

```sql
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS totp_secret TEXT,
  ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS oauth_provider TEXT,
  ADD COLUMN IF NOT EXISTS oauth_provider_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_oauth
  ON users(oauth_provider, oauth_provider_id)
  WHERE oauth_provider IS NOT NULL;
```

- [ ] **Step 6: Create migration 004 down**

`src-go/migrations/004_add_users_auth_fields.down.sql`:

```sql
DROP INDEX IF EXISTS idx_users_oauth;
ALTER TABLE users
  DROP COLUMN IF EXISTS oauth_provider_id,
  DROP COLUMN IF EXISTS oauth_provider,
  DROP COLUMN IF EXISTS totp_enabled,
  DROP COLUMN IF EXISTS totp_secret,
  DROP COLUMN IF EXISTS email_verified_at;
```

- [ ] **Step 7: Commit**

```bash
git add src-go/migrations/
git commit -m "feat(db): add migrations 002-004 for refresh tokens, verification tokens, and user auth fields"
```

---

## Task 3: Extend config and environment

**Files:**
- Modify: `src-go/internal/config/config.go`
- Modify: `.env.example`

- [ ] **Step 1: Update `config.go`**

Replace `src-go/internal/config/config.go` with:

```go
package config

import (
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

	// Mailer
	SMTPHost     string
	SMTPPort     string
	SMTPFrom     string
	SMTPPassword string

	// OAuth
	GitHubClientID       string
	GitHubClientSecret   string
	GoogleClientID       string
	GoogleClientSecret   string
	OAuthRedirectBaseURL string
}

func Load() *Config {
	viper.AutomaticEnv()
	viper.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))

	viper.SetConfigFile(".env")
	viper.SetConfigType("env")
	_ = viper.ReadInConfig()

	viper.SetDefault("PORT", "7777")
	viper.SetDefault("ENV", "development")
	viper.SetDefault("JWT_ACCESS_TTL", "15m")
	viper.SetDefault("JWT_REFRESH_TTL", "168h")
	viper.SetDefault("ALLOW_ORIGINS", "http://localhost:3000,tauri://localhost,http://localhost:1420")
	viper.SetDefault("REDIS_URL", "redis://localhost:6379")
	viper.SetDefault("SMTP_PORT", "587")
	viper.SetDefault("SMTP_FROM", "noreply@example.com")
	viper.SetDefault("OAUTH_REDIRECT_BASE_URL", "http://localhost:7777")

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

		SMTPHost:     viper.GetString("SMTP_HOST"),
		SMTPPort:     viper.GetString("SMTP_PORT"),
		SMTPFrom:     viper.GetString("SMTP_FROM"),
		SMTPPassword: viper.GetString("SMTP_PASSWORD"),

		GitHubClientID:       viper.GetString("GITHUB_CLIENT_ID"),
		GitHubClientSecret:   viper.GetString("GITHUB_CLIENT_SECRET"),
		GoogleClientID:       viper.GetString("GOOGLE_CLIENT_ID"),
		GoogleClientSecret:   viper.GetString("GOOGLE_CLIENT_SECRET"),
		OAuthRedirectBaseURL: viper.GetString("OAUTH_REDIRECT_BASE_URL"),
	}
}
```

- [ ] **Step 2: Append new vars to `.env.example`**

Add to the end of `.env.example`:

```bash
# Mailer (leave blank in dev to use NoopMailer that logs to stdout)
SMTP_HOST=
SMTP_PORT=587
SMTP_FROM=noreply@example.com
SMTP_PASSWORD=

# OAuth providers (register at github.com/settings/applications and console.cloud.google.com)
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
OAUTH_REDIRECT_BASE_URL=http://localhost:7777
```

- [ ] **Step 3: Verify compilation**

```bash
cd src-go && go build ./...
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src-go/internal/config/config.go .env.example
git commit -m "feat(config): add SMTP and OAuth config fields"
```

---

## Task 4: Extend User model and add auth model types

**Files:**
- Modify: `src-go/internal/model/user.go`
- Create: `src-go/internal/model/auth.go`

- [ ] **Step 1: Update `model/user.go` — add new fields to User struct**

Replace the `User` struct and `ToDTO` in `src-go/internal/model/user.go`:

```go
type User struct {
	ID              uuid.UUID  `db:"id"`
	Email           string     `db:"email"`
	Password        string     `db:"password"`
	Name            string     `db:"name"`
	EmailVerifiedAt *time.Time `db:"email_verified_at"`
	TOTPSecret      *string    `db:"totp_secret"`
	TOTPEnabled     bool       `db:"totp_enabled"`
	OAuthProvider   *string    `db:"oauth_provider"`
	OAuthProviderID *string    `db:"oauth_provider_id"`
	CreatedAt       time.Time  `db:"created_at"`
	UpdatedAt       time.Time  `db:"updated_at"`
}

type UserDTO struct {
	ID              string     `json:"id"`
	Email           string     `json:"email"`
	Name            string     `json:"name"`
	EmailVerified   bool       `json:"emailVerified"`
	TOTPEnabled     bool       `json:"totpEnabled"`
	CreatedAt       time.Time  `json:"createdAt"`
}

func (u *User) ToDTO() UserDTO {
	return UserDTO{
		ID:            u.ID.String(),
		Email:         u.Email,
		Name:          u.Name,
		EmailVerified: u.EmailVerifiedAt != nil,
		TOTPEnabled:   u.TOTPEnabled,
		CreatedAt:     u.CreatedAt,
	}
}
```

- [ ] **Step 2: Create `src-go/internal/model/auth.go`** — new request/response types

```go
package model

type VerifyEmailRequest struct {
	Token string `json:"token" validate:"required"`
}

type ForgotPasswordRequest struct {
	Email string `json:"email" validate:"required,email"`
}

type ResetPasswordRequest struct {
	Token    string `json:"token" validate:"required"`
	Password string `json:"password" validate:"required,min=8"`
}

type TOTPSetupResponse struct {
	Secret  string `json:"secret"`
	QRCodeURI string `json:"qrCodeUri"`
}

type TOTPVerifyRequest struct {
	Code string `json:"code" validate:"required,len=6"`
}

type TOTPDisableRequest struct {
	Password string `json:"password" validate:"required"`
}

type TOTPConfirmRequest struct {
	SessionToken string `json:"sessionToken" validate:"required"`
	Code         string `json:"code" validate:"required,len=6"`
}

type TOTPLoginResponse struct {
	TOTPRequired bool   `json:"totpRequired"`
	SessionToken string `json:"sessionToken"`
}

type OAuthUserInfo struct {
	ID       string
	Email    string
	Name     string
	Provider string
}
```

- [ ] **Step 3: Verify compilation**

```bash
cd src-go && go build ./...
```

- [ ] **Step 4: Commit**

```bash
git add src-go/internal/model/
git commit -m "feat(model): extend User with auth fields; add TOTP/OAuth/verification request types"
```

---

## Task 5: Add mailer package

**Files:**
- Create: `src-go/internal/mailer/mailer.go`
- Create: `src-go/internal/mailer/noop.go`
- Create: `src-go/internal/mailer/smtp.go`
- Create: `src-go/internal/mailer/templates/verify_email.html`
- Create: `src-go/internal/mailer/templates/reset_password.html`

- [ ] **Step 1: Create `mailer.go` — interface**

```go
package mailer

type Mailer interface {
	SendVerification(to, name, token string) error
	SendPasswordReset(to, name, token string) error
}
```

- [ ] **Step 2: Create `noop.go` — dev implementation**

```go
package mailer

import "log/slog"

type NoopMailer struct{}

func NewNoopMailer() *NoopMailer { return &NoopMailer{} }

func (m *NoopMailer) SendVerification(to, name, token string) error {
	slog.Info("NOOP: send verification email", "to", to, "name", name, "token", token)
	return nil
}

func (m *NoopMailer) SendPasswordReset(to, name, token string) error {
	slog.Info("NOOP: send password reset email", "to", to, "name", name, "token", token)
	return nil
}
```

- [ ] **Step 3: Create `smtp.go` — production implementation**

```go
package mailer

import (
	"bytes"
	"crypto/tls"
	"fmt"
	"html/template"
	"net/smtp"
	"path/filepath"
	"runtime"
)

type SMTPMailer struct {
	host     string
	port     string
	from     string
	password string
	tmplDir  string
}

func NewSMTPMailer(host, port, from, password string) *SMTPMailer {
	_, file, _, _ := runtime.Caller(0)
	tmplDir := filepath.Join(filepath.Dir(file), "templates")
	return &SMTPMailer{host: host, port: port, from: from, password: password, tmplDir: tmplDir}
}

func (m *SMTPMailer) send(to, subject, body string) error {
	addr := fmt.Sprintf("%s:%s", m.host, m.port)
	auth := smtp.PlainAuth("", m.from, m.password, m.host)

	msg := fmt.Sprintf(
		"From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n%s",
		m.from, to, subject, body,
	)

	tlsCfg := &tls.Config{ServerName: m.host}
	conn, err := tls.Dial("tcp", addr, tlsCfg)
	if err != nil {
		// Fallback to plain SMTP for local dev SMTP servers
		return smtp.SendMail(addr, auth, m.from, []string{to}, []byte(msg))
	}
	defer conn.Close()

	client, err := smtp.NewClient(conn, m.host)
	if err != nil {
		return err
	}
	defer client.Close()
	if err = client.Auth(auth); err != nil {
		return err
	}
	if err = client.Mail(m.from); err != nil {
		return err
	}
	if err = client.Rcpt(to); err != nil {
		return err
	}
	w, err := client.Data()
	if err != nil {
		return err
	}
	_, err = fmt.Fprint(w, msg)
	if err != nil {
		return err
	}
	return w.Close()
}

func (m *SMTPMailer) render(name string, data any) (string, error) {
	tmpl, err := template.ParseFiles(filepath.Join(m.tmplDir, name))
	if err != nil {
		return "", err
	}
	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		return "", err
	}
	return buf.String(), nil
}

func (m *SMTPMailer) SendVerification(to, name, token string) error {
	body, err := m.render("verify_email.html", map[string]string{"Name": name, "Token": token})
	if err != nil {
		return err
	}
	return m.send(to, "Verify your email address", body)
}

func (m *SMTPMailer) SendPasswordReset(to, name, token string) error {
	body, err := m.render("reset_password.html", map[string]string{"Name": name, "Token": token})
	if err != nil {
		return err
	}
	return m.send(to, "Reset your password", body)
}
```

- [ ] **Step 4: Create `templates/verify_email.html`**

```html
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Verify your email</title></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
  <h2>Hi {{.Name}},</h2>
  <p>Please verify your email address by clicking the button below.</p>
  <p style="margin:32px 0">
    <a href="http://localhost:3000/verify-email?token={{.Token}}"
       style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px">
      Verify Email
    </a>
  </p>
  <p style="color:#666;font-size:14px">This link expires in 24 hours. If you didn't create an account, ignore this email.</p>
</body>
</html>
```

- [ ] **Step 5: Create `templates/reset_password.html`**

```html
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Reset your password</title></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
  <h2>Hi {{.Name}},</h2>
  <p>You requested a password reset. Click the button below to choose a new password.</p>
  <p style="margin:32px 0">
    <a href="http://localhost:3000/reset-password?token={{.Token}}"
       style="background:#000;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px">
      Reset Password
    </a>
  </p>
  <p style="color:#666;font-size:14px">This link expires in 1 hour. If you didn't request this, ignore this email.</p>
</body>
</html>
```

- [ ] **Step 6: Build to verify**

```bash
cd src-go && go build ./...
```

Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src-go/internal/mailer/
git commit -m "feat(mailer): add Mailer interface, NoopMailer, SMTPMailer, and email templates"
```

---

## Task 6: Add token repository (DB persistence for refresh + verification tokens)

**Files:**
- Create: `src-go/internal/repository/token_repository.go`
- Create: `src-go/internal/repository/token_repository_test.go`

- [ ] **Step 1: Write failing test for `TokenRepository`**

Create `src-go/internal/repository/token_repository_test.go`:

```go
package repository_test

import (
	"context"
	"testing"
	"time"

	"github.com/pashagolub/pgxmock/v4"
	"github.com/react-go-quick-starter/server/internal/repository"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTokenRepository_CreateVerificationToken(t *testing.T) {
	mock, err := pgxmock.NewPool()
	require.NoError(t, err)

	repo := repository.NewTokenRepository(mock)
	ctx := context.Background()

	mock.ExpectExec("INSERT INTO verification_tokens").
		WithArgs(pgxmock.AnyArg(), pgxmock.AnyArg(), "email_verify", pgxmock.AnyArg()).
		WillReturnResult(pgxmock.NewResult("INSERT", 1))

	err = repo.CreateVerificationToken(ctx, "user-uuid", "email_verify", 24*time.Hour)
	assert.NoError(t, err)
	assert.NoError(t, mock.ExpectationsWereMet())
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd src-go && go test ./internal/repository/... -run TestTokenRepository -v 2>&1 | tail -10
```

Expected: compile error (repository.NewTokenRepository undefined).

- [ ] **Step 3: Implement `token_repository.go`**

```go
package repository

import (
	"context"
	"crypto/sha256"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type DBPool interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

type TokenRepository struct {
	db DBPool
}

func NewTokenRepository(db DBPool) *TokenRepository {
	return &TokenRepository{db: db}
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return fmt.Sprintf("%x", sum)
}

// CreateVerificationToken inserts a new verification token record and returns the raw token.
func (r *TokenRepository) CreateVerificationToken(ctx context.Context, userID, tokenType string, ttl time.Duration) (string, error) {
	raw := uuid.New().String()
	hash := hashToken(raw)
	expiresAt := time.Now().Add(ttl)

	_, err := r.db.Exec(ctx,
		`INSERT INTO verification_tokens (user_id, token_hash, type, expires_at)
		 VALUES ($1, $2, $3, $4)`,
		userID, hash, tokenType, expiresAt,
	)
	if err != nil {
		return "", fmt.Errorf("create verification token: %w", err)
	}
	return raw, nil
}

// ConsumeVerificationToken validates the token, marks it used, and returns the user_id.
func (r *TokenRepository) ConsumeVerificationToken(ctx context.Context, rawToken, tokenType string) (string, error) {
	hash := hashToken(rawToken)
	var userID string
	var expiresAt time.Time
	var usedAt *time.Time

	err := r.db.QueryRow(ctx,
		`SELECT user_id, expires_at, used_at FROM verification_tokens
		 WHERE token_hash = $1 AND type = $2`,
		hash, tokenType,
	).Scan(&userID, &expiresAt, &usedAt)
	if err != nil {
		return "", fmt.Errorf("lookup verification token: %w", err)
	}
	if usedAt != nil {
		return "", fmt.Errorf("token already used")
	}
	if time.Now().After(expiresAt) {
		return "", fmt.Errorf("token expired")
	}

	now := time.Now()
	_, err = r.db.Exec(ctx,
		`UPDATE verification_tokens SET used_at = $1 WHERE token_hash = $2`,
		now, hash,
	)
	if err != nil {
		return "", fmt.Errorf("mark token used: %w", err)
	}
	return userID, nil
}

// CreateRefreshToken persists a hashed refresh token for a user.
func (r *TokenRepository) CreateRefreshToken(ctx context.Context, userID, rawToken string, expiresAt time.Time) error {
	hash := hashToken(rawToken)
	_, err := r.db.Exec(ctx,
		`INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)
		 ON CONFLICT (token_hash) DO NOTHING`,
		userID, hash, expiresAt,
	)
	return err
}

// DeleteRefreshTokensByUser removes all refresh tokens for a user (logout all devices).
func (r *TokenRepository) DeleteRefreshTokensByUser(ctx context.Context, userID string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM refresh_tokens WHERE user_id = $1`, userID)
	return err
}
```

**Note:** `pgconn.CommandTag` requires importing `github.com/jackc/pgx/v5/pgconn`. Add to imports:
```go
import "github.com/jackc/pgx/v5/pgconn"
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd src-go && go test ./internal/repository/... -run TestTokenRepository -v 2>&1 | tail -10
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-go/internal/repository/token_repository.go src-go/internal/repository/token_repository_test.go
git commit -m "feat(repository): add TokenRepository for refresh and verification tokens"
```

---

## Task 7: Add TOTP crypto helper

**Files:**
- Create: `src-go/internal/crypto/totp.go`

- [ ] **Step 1: Create `src-go/internal/crypto/totp.go`**

```go
package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
)

// deriveKey produces a 32-byte AES key from an arbitrary secret string.
func deriveKey(secret string) []byte {
	h := sha256.Sum256([]byte(secret))
	return h[:]
}

// EncryptTOTPSecret encrypts a TOTP secret using AES-256-GCM.
func EncryptTOTPSecret(plaintext, masterSecret string) (string, error) {
	key := deriveKey(masterSecret)
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("create cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("create GCM: %w", err)
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err = io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("generate nonce: %w", err)
	}
	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

// DecryptTOTPSecret decrypts a TOTP secret encrypted with EncryptTOTPSecret.
func DecryptTOTPSecret(encoded, masterSecret string) (string, error) {
	key := deriveKey(masterSecret)
	data, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return "", fmt.Errorf("decode base64: %w", err)
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("create cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("create GCM: %w", err)
	}
	if len(data) < gcm.NonceSize() {
		return "", errors.New("ciphertext too short")
	}
	nonce, ciphertext := data[:gcm.NonceSize()], data[gcm.NonceSize():]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", fmt.Errorf("decrypt: %w", err)
	}
	return string(plaintext), nil
}
```

- [ ] **Step 2: Verify compilation**

```bash
cd src-go && go build ./internal/crypto/...
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src-go/internal/crypto/
git commit -m "feat(crypto): add AES-256-GCM encrypt/decrypt for TOTP secrets"
```

---

## Task 8: Add UserRepository extensions (new DB columns)

**Files:**
- Modify: `src-go/internal/repository/user_repository.go` (find existing file)

- [ ] **Step 1: Find and check existing user repository**

```bash
ls src-go/internal/repository/
```

- [ ] **Step 2: Add `UpdateEmailVerified`, `UpdateTOTP`, `UpdateOAuth`, `UpdatePassword`, `FindByOAuth` methods**

Append to the existing user repository file:

```go
// MarkEmailVerified sets email_verified_at to NOW() for a user.
func (r *UserRepository) MarkEmailVerified(ctx context.Context, userID string) error {
	_, err := r.db.Exec(ctx,
		`UPDATE users SET email_verified_at = NOW(), updated_at = NOW() WHERE id = $1`,
		userID,
	)
	return err
}

// UpdatePassword replaces a user's hashed password.
func (r *UserRepository) UpdatePassword(ctx context.Context, userID, hash string) error {
	_, err := r.db.Exec(ctx,
		`UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2`,
		hash, userID,
	)
	return err
}

// SetTOTP saves (or clears) the encrypted TOTP secret and enabled flag.
func (r *UserRepository) SetTOTP(ctx context.Context, userID, encryptedSecret string, enabled bool) error {
	_, err := r.db.Exec(ctx,
		`UPDATE users SET totp_secret = $1, totp_enabled = $2, updated_at = NOW() WHERE id = $3`,
		encryptedSecret, enabled, userID,
	)
	return err
}

// FindByOAuth looks up a user by oauth_provider + oauth_provider_id.
func (r *UserRepository) FindByOAuth(ctx context.Context, provider, providerID string) (*model.User, error) {
	row := r.db.QueryRow(ctx,
		`SELECT id, email, password, name, email_verified_at, totp_secret, totp_enabled,
		        oauth_provider, oauth_provider_id, created_at, updated_at
		 FROM users WHERE oauth_provider = $1 AND oauth_provider_id = $2`,
		provider, providerID,
	)
	return scanUser(row)
}

// UpsertOAuthUser creates a new user from OAuth info, or returns existing one.
func (r *UserRepository) UpsertOAuthUser(ctx context.Context, info *model.OAuthUserInfo) (*model.User, error) {
	user, err := r.FindByOAuth(ctx, info.Provider, info.ID)
	if err == nil {
		return user, nil
	}
	// Check by email
	existing, err := r.GetByEmail(ctx, info.Email)
	if err == nil {
		// Link OAuth to existing account
		_, err = r.db.Exec(ctx,
			`UPDATE users SET oauth_provider = $1, oauth_provider_id = $2,
			 email_verified_at = COALESCE(email_verified_at, NOW()), updated_at = NOW()
			 WHERE id = $3`,
			info.Provider, info.ID, existing.ID,
		)
		existing.OAuthProvider = &info.Provider
		existing.OAuthProviderID = &info.ID
		return existing, err
	}
	// Create new user
	now := time.Now()
	newUser := &model.User{
		ID:              uuid.New(),
		Email:           info.Email,
		Name:            info.Name,
		Password:        "",
		EmailVerifiedAt: &now,
		OAuthProvider:   &info.Provider,
		OAuthProviderID: &info.ID,
	}
	err = r.Create(ctx, newUser)
	return newUser, err
}
```

- [ ] **Step 3: Add a `scanUser` helper if not already present**

Add below the existing scan logic (or create a shared helper):

```go
func scanUser(row pgx.Row) (*model.User, error) {
	u := &model.User{}
	err := row.Scan(
		&u.ID, &u.Email, &u.Password, &u.Name,
		&u.EmailVerifiedAt, &u.TOTPSecret, &u.TOTPEnabled,
		&u.OAuthProvider, &u.OAuthProviderID,
		&u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return u, nil
}
```

Also update the existing `GetByEmail` and `GetByID` scans to include the new columns. The SELECT must now include `email_verified_at, totp_secret, totp_enabled, oauth_provider, oauth_provider_id`.

- [ ] **Step 4: Build to check**

```bash
cd src-go && go build ./...
```

Fix any compile errors (missing imports: `time`, `github.com/google/uuid`).

- [ ] **Step 5: Commit**

```bash
git add src-go/internal/repository/
git commit -m "feat(repository): extend UserRepository with OAuth, TOTP, password, email-verify methods"
```

---

## Task 9: Add email verification and password reset service + handler

**Files:**
- Create: `src-go/internal/service/verification_service.go`
- Create: `src-go/internal/service/verification_service_test.go`
- Create: `src-go/internal/handler/verification.go`

- [ ] **Step 1: Write failing tests**

Create `src-go/internal/service/verification_service_test.go`:

```go
package service_test

import (
	"context"
	"testing"

	"github.com/react-go-quick-starter/server/internal/service"
	"github.com/stretchr/testify/assert"
)

type mockVerifRepo struct {
	createCalled  bool
	consumeCalled bool
	returnUserID  string
	returnErr     error
}

func (m *mockVerifRepo) CreateVerificationToken(ctx context.Context, userID, tokenType string, _ interface{}) (string, error) {
	m.createCalled = true
	return "raw-token", m.returnErr
}

func (m *mockVerifRepo) ConsumeVerificationToken(ctx context.Context, raw, tokenType string) (string, error) {
	m.consumeCalled = true
	return m.returnUserID, m.returnErr
}

func TestVerificationService_SendVerification(t *testing.T) {
	repo := &mockVerifRepo{}
	svc := service.NewVerificationService(repo, nil, nil)
	err := svc.SendVerification(context.Background(), "user-id", "user@example.com", "Alice")
	assert.NoError(t, err)
	assert.True(t, repo.createCalled)
}
```

- [ ] **Step 2: Run failing test**

```bash
cd src-go && go test ./internal/service/... -run TestVerificationService -v 2>&1 | tail -5
```

Expected: compile error (service.NewVerificationService undefined).

- [ ] **Step 3: Implement `verification_service.go`**

```go
package service

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/react-go-quick-starter/server/internal/mailer"
	"golang.org/x/crypto/bcrypt"
)

type VerifTokenRepo interface {
	CreateVerificationToken(ctx context.Context, userID, tokenType string, ttl time.Duration) (string, error)
	ConsumeVerificationToken(ctx context.Context, rawToken, tokenType string) (string, error)
}

type VerifUserRepo interface {
	GetByID(ctx context.Context, id uuid.UUID) (*modelUser, error)
	MarkEmailVerified(ctx context.Context, userID string) error
	UpdatePassword(ctx context.Context, userID, hash string) error
}

// modelUser is an alias so we avoid circular import — use the real model.User type.
type modelUser = struct {
	ID    uuid.UUID
	Email string
	Name  string
}

type VerificationService struct {
	tokenRepo VerifTokenRepo
	userRepo  VerifUserRepo
	mailer    mailer.Mailer
}

func NewVerificationService(tokenRepo VerifTokenRepo, userRepo VerifUserRepo, m mailer.Mailer) *VerificationService {
	return &VerificationService{tokenRepo: tokenRepo, userRepo: userRepo, mailer: m}
}

func (s *VerificationService) SendVerification(ctx context.Context, userID, email, name string) error {
	token, err := s.tokenRepo.CreateVerificationToken(ctx, userID, "email_verify", 24*time.Hour)
	if err != nil {
		return fmt.Errorf("create token: %w", err)
	}
	return s.mailer.SendVerification(email, name, token)
}

func (s *VerificationService) VerifyEmail(ctx context.Context, rawToken string) error {
	userID, err := s.tokenRepo.ConsumeVerificationToken(ctx, rawToken, "email_verify")
	if err != nil {
		return ErrInvalidToken
	}
	return s.userRepo.MarkEmailVerified(ctx, userID)
}

func (s *VerificationService) ForgotPassword(ctx context.Context, email string, getUserByEmail func(context.Context, string) (string, string, string, error)) error {
	userID, name, _, err := getUserByEmail(ctx, email)
	if err != nil {
		return nil // Don't reveal whether email exists
	}
	token, err := s.tokenRepo.CreateVerificationToken(ctx, userID, "password_reset", time.Hour)
	if err != nil {
		return fmt.Errorf("create reset token: %w", err)
	}
	return s.mailer.SendPasswordReset(email, name, token)
}

func (s *VerificationService) ResetPassword(ctx context.Context, rawToken, newPassword string) error {
	userID, err := s.tokenRepo.ConsumeVerificationToken(ctx, rawToken, "password_reset")
	if err != nil {
		return ErrInvalidToken
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}
	return s.userRepo.UpdatePassword(ctx, userID, string(hash))
}
```

- [ ] **Step 4: Run tests**

```bash
cd src-go && go test ./internal/service/... -run TestVerificationService -v 2>&1 | tail -5
```

Expected: PASS.

- [ ] **Step 5: Create `handler/verification.go`**

```go
package handler

import (
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/react-go-quick-starter/server/internal/middleware"
	"github.com/react-go-quick-starter/server/internal/model"
	"github.com/react-go-quick-starter/server/internal/service"
)

type VerificationHandler struct {
	svc     *service.VerificationService
	authSvc *service.AuthService
}

func NewVerificationHandler(svc *service.VerificationService, authSvc *service.AuthService) *VerificationHandler {
	return &VerificationHandler{svc: svc, authSvc: authSvc}
}

func (h *VerificationHandler) SendVerification(c echo.Context) error {
	claims, err := middleware.GetClaims(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, model.ErrorResponse{Message: "unauthorized"})
	}
	user, err := h.authSvc.GetUserByID(c.Request().Context(), claims.UserID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, model.ErrorResponse{Message: "user not found"})
	}
	if err := h.svc.SendVerification(c.Request().Context(), claims.UserID, user.Email, user.Name); err != nil {
		return c.JSON(http.StatusInternalServerError, model.ErrorResponse{Message: "failed to send verification"})
	}
	return c.JSON(http.StatusOK, map[string]string{"message": "verification email sent"})
}

func (h *VerificationHandler) VerifyEmail(c echo.Context) error {
	req := new(model.VerifyEmailRequest)
	if err := c.Bind(req); err != nil {
		return c.JSON(http.StatusBadRequest, model.ErrorResponse{Message: "invalid request"})
	}
	if err := h.svc.VerifyEmail(c.Request().Context(), req.Token); err != nil {
		return c.JSON(http.StatusBadRequest, model.ErrorResponse{Message: "invalid or expired token"})
	}
	return c.JSON(http.StatusOK, map[string]string{"message": "email verified"})
}

func (h *VerificationHandler) ForgotPassword(c echo.Context) error {
	req := new(model.ForgotPasswordRequest)
	if err := c.Bind(req); err != nil {
		return c.JSON(http.StatusBadRequest, model.ErrorResponse{Message: "invalid request"})
	}
	_ = h.svc.ForgotPassword(c.Request().Context(), req.Email, h.authSvc.GetEmailUserInfo)
	return c.JSON(http.StatusOK, map[string]string{"message": "if that email exists, a reset link has been sent"})
}

func (h *VerificationHandler) ResetPassword(c echo.Context) error {
	req := new(model.ResetPasswordRequest)
	if err := c.Bind(req); err != nil {
		return c.JSON(http.StatusBadRequest, model.ErrorResponse{Message: "invalid request"})
	}
	if err := c.Validate(req); err != nil {
		return c.JSON(http.StatusUnprocessableEntity, model.ErrorResponse{Message: err.Error()})
	}
	if err := h.svc.ResetPassword(c.Request().Context(), req.Token, req.Password); err != nil {
		return c.JSON(http.StatusBadRequest, model.ErrorResponse{Message: "invalid or expired token"})
	}
	return c.JSON(http.StatusOK, map[string]string{"message": "password updated"})
}
```

- [ ] **Step 6: Add `GetUserByID` and `GetEmailUserInfo` to `AuthService`**

Append to `src-go/internal/service/auth_service.go`:

```go
// GetUserByID fetches a user by UUID string. Used by handlers.
func (s *AuthService) GetUserByID(ctx context.Context, userID string) (*model.User, error) {
	id, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user id: %w", err)
	}
	return s.userRepo.GetByID(ctx, id)
}

// GetEmailUserInfo returns (userID, name, email, error) for a given email. Used by VerificationService.
func (s *AuthService) GetEmailUserInfo(ctx context.Context, email string) (string, string, string, error) {
	user, err := s.userRepo.GetByEmail(ctx, email)
	if err != nil {
		return "", "", "", err
	}
	return user.ID.String(), user.Name, user.Email, nil
}
```

- [ ] **Step 7: Build and commit**

```bash
cd src-go && go build ./...
git add src-go/internal/service/ src-go/internal/handler/verification.go
git commit -m "feat: add email verification and password reset service + handler"
```

---

## Task 10: Add OAuth service and handler

**Files:**
- Create: `src-go/internal/service/oauth_service.go`
- Create: `src-go/internal/handler/oauth.go`

- [ ] **Step 1: Create `service/oauth_service.go`**

```go
package service

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"

	"github.com/react-go-quick-starter/server/internal/config"
	"github.com/react-go-quick-starter/server/internal/model"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/github"
	"golang.org/x/oauth2/google"
)

type OAuthUserRepo interface {
	UpsertOAuthUser(ctx context.Context, info *model.OAuthUserInfo) (*model.User, error)
}

type OAuthCacheRepo interface {
	SetOAuthState(ctx context.Context, state string) error
	ValidateOAuthState(ctx context.Context, state string) (bool, error)
}

type OAuthService struct {
	cfg       *config.Config
	userRepo  OAuthUserRepo
	cacheRepo OAuthCacheRepo
	authSvc   *AuthService
}

func NewOAuthService(cfg *config.Config, userRepo OAuthUserRepo, cacheRepo OAuthCacheRepo, authSvc *AuthService) *OAuthService {
	return &OAuthService{cfg: cfg, userRepo: userRepo, cacheRepo: cacheRepo, authSvc: authSvc}
}

func (s *OAuthService) oauthConfig(provider string) (*oauth2.Config, error) {
	base := s.cfg.OAuthRedirectBaseURL
	switch provider {
	case "github":
		return &oauth2.Config{
			ClientID:     s.cfg.GitHubClientID,
			ClientSecret: s.cfg.GitHubClientSecret,
			Endpoint:     github.Endpoint,
			RedirectURL:  base + "/api/v1/auth/oauth/github/callback",
			Scopes:       []string{"user:email"},
		}, nil
	case "google":
		return &oauth2.Config{
			ClientID:     s.cfg.GoogleClientID,
			ClientSecret: s.cfg.GoogleClientSecret,
			Endpoint:     google.Endpoint,
			RedirectURL:  base + "/api/v1/auth/oauth/google/callback",
			Scopes:       []string{"openid", "email", "profile"},
		}, nil
	default:
		return nil, fmt.Errorf("unsupported provider: %s", provider)
	}
}

func (s *OAuthService) GenerateAuthURL(ctx context.Context, provider string) (string, error) {
	cfg, err := s.oauthConfig(provider)
	if err != nil {
		return "", err
	}
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	state := base64.URLEncoding.EncodeToString(b)
	if err := s.cacheRepo.SetOAuthState(ctx, state); err != nil {
		return "", fmt.Errorf("store state: %w", err)
	}
	return cfg.AuthCodeURL(state, oauth2.AccessTypeOnline), nil
}

func (s *OAuthService) HandleCallback(ctx context.Context, provider, code, state string) (*model.AuthResponse, error) {
	ok, err := s.cacheRepo.ValidateOAuthState(ctx, state)
	if err != nil || !ok {
		return nil, fmt.Errorf("invalid oauth state")
	}

	cfg, err := s.oauthConfig(provider)
	if err != nil {
		return nil, err
	}
	token, err := cfg.Exchange(ctx, code)
	if err != nil {
		return nil, fmt.Errorf("exchange code: %w", err)
	}

	info, err := s.fetchUserInfo(ctx, provider, cfg, token)
	if err != nil {
		return nil, fmt.Errorf("fetch user info: %w", err)
	}

	user, err := s.userRepo.UpsertOAuthUser(ctx, info)
	if err != nil {
		return nil, fmt.Errorf("upsert user: %w", err)
	}

	return s.authSvc.issueTokens(ctx, user)
}

func (s *OAuthService) fetchUserInfo(ctx context.Context, provider string, cfg *oauth2.Config, token *oauth2.Token) (*model.OAuthUserInfo, error) {
	client := cfg.Client(ctx, token)
	switch provider {
	case "github":
		resp, err := client.Get("https://api.github.com/user")
		if err != nil {
			return nil, err
		}
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		var gh struct {
			ID    int64  `json:"id"`
			Email string `json:"email"`
			Name  string `json:"name"`
			Login string `json:"login"`
		}
		_ = json.Unmarshal(body, &gh)
		name := gh.Name
		if name == "" {
			name = gh.Login
		}
		return &model.OAuthUserInfo{ID: fmt.Sprintf("%d", gh.ID), Email: gh.Email, Name: name, Provider: "github"}, nil
	case "google":
		resp, err := client.Get("https://www.googleapis.com/oauth2/v3/userinfo")
		if err != nil {
			return nil, err
		}
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		var g struct {
			Sub   string `json:"sub"`
			Email string `json:"email"`
			Name  string `json:"name"`
		}
		_ = json.Unmarshal(body, &g)
		return &model.OAuthUserInfo{ID: g.Sub, Email: g.Email, Name: g.Name, Provider: "google"}, nil
	default:
		return nil, fmt.Errorf("unsupported provider: %s", provider)
	}
}
```

- [ ] **Step 2: Add `SetOAuthState` and `ValidateOAuthState` to `CacheRepository`**

Append to the existing `CacheRepository` in `src-go/internal/repository/cache_repository.go`:

```go
func (r *CacheRepository) SetOAuthState(ctx context.Context, state string) error {
	return r.client.Set(ctx, "oauth:state:"+state, "1", 10*time.Minute).Err()
}

func (r *CacheRepository) ValidateOAuthState(ctx context.Context, state string) (bool, error) {
	val, err := r.client.GetDel(ctx, "oauth:state:"+state).Result()
	if err != nil {
		return false, err
	}
	return val == "1", nil
}
```

- [ ] **Step 3: Create `handler/oauth.go`**

```go
package handler

import (
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/react-go-quick-starter/server/internal/model"
	"github.com/react-go-quick-starter/server/internal/service"
)

type OAuthHandler struct {
	svc *service.OAuthService
}

func NewOAuthHandler(svc *service.OAuthService) *OAuthHandler {
	return &OAuthHandler{svc: svc}
}

func (h *OAuthHandler) Redirect(c echo.Context) error {
	provider := c.Param("provider")
	url, err := h.svc.GenerateAuthURL(c.Request().Context(), provider)
	if err != nil {
		return c.JSON(http.StatusBadRequest, model.ErrorResponse{Message: "unsupported provider"})
	}
	return c.Redirect(http.StatusTemporaryRedirect, url)
}

func (h *OAuthHandler) Callback(c echo.Context) error {
	provider := c.Param("provider")
	code := c.QueryParam("code")
	state := c.QueryParam("state")

	resp, err := h.svc.HandleCallback(c.Request().Context(), provider, code, state)
	if err != nil {
		return c.Redirect(http.StatusTemporaryRedirect,
			"http://localhost:3000/login?error=oauth_failed")
	}

	redirectURL := "http://localhost:3000/auth/callback" +
		"?accessToken=" + resp.AccessToken +
		"&refreshToken=" + resp.RefreshToken
	return c.Redirect(http.StatusTemporaryRedirect, redirectURL)
}
```

- [ ] **Step 4: Build**

```bash
cd src-go && go build ./...
```

- [ ] **Step 5: Commit**

```bash
git add src-go/internal/service/oauth_service.go src-go/internal/handler/oauth.go src-go/internal/repository/
git commit -m "feat: add OAuth service and handler (GitHub + Google)"
```

---

## Task 11: Add TOTP service and handler

**Files:**
- Create: `src-go/internal/service/totp_service.go`
- Create: `src-go/internal/service/totp_service_test.go`
- Create: `src-go/internal/handler/totp.go`

- [ ] **Step 1: Write failing test**

`src-go/internal/service/totp_service_test.go`:

```go
package service_test

import (
	"testing"

	"github.com/pquerna/otp/totp"
	"github.com/react-go-quick-starter/server/internal/service"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTOTPService_GenerateAndValidate(t *testing.T) {
	svc := service.NewTOTPService("test-master-secret")
	secret, qrURI, err := svc.GenerateSecret("user@example.com", "MyApp")
	require.NoError(t, err)
	assert.NotEmpty(t, secret)
	assert.Contains(t, qrURI, "otpauth://")

	code, err := totp.GenerateCode(secret, time.Now())
	require.NoError(t, err)
	assert.True(t, svc.ValidateCode(secret, code))
}
```

- [ ] **Step 2: Run failing test**

```bash
cd src-go && go test ./internal/service/... -run TestTOTPService -v 2>&1 | tail -5
```

Expected: compile error.

- [ ] **Step 3: Implement `service/totp_service.go`**

```go
package service

import (
	"context"
	"fmt"
	"time"

	"github.com/pquerna/otp/totp"
	"github.com/react-go-quick-starter/server/internal/crypto"
)

type TOTPUserRepo interface {
	GetByID(ctx context.Context, id interface{}) (interface{}, error)
	SetTOTP(ctx context.Context, userID, encryptedSecret string, enabled bool) error
}

type TOTPService struct {
	masterSecret string
}

func NewTOTPService(masterSecret string) *TOTPService {
	return &TOTPService{masterSecret: masterSecret}
}

func (s *TOTPService) GenerateSecret(email, issuer string) (rawSecret, qrURI string, err error) {
	key, err := totp.Generate(totp.GenerateOpts{
		Issuer:      issuer,
		AccountName: email,
	})
	if err != nil {
		return "", "", fmt.Errorf("generate totp: %w", err)
	}
	return key.Secret(), key.URL(), nil
}

func (s *TOTPService) ValidateCode(rawSecret, code string) bool {
	return totp.Validate(code, rawSecret)
}

func (s *TOTPService) Enable(ctx context.Context, userID, rawSecret, code string, setTOTP func(context.Context, string, string, bool) error) error {
	if !s.ValidateCode(rawSecret, code) {
		return fmt.Errorf("invalid TOTP code")
	}
	encrypted, err := crypto.EncryptTOTPSecret(rawSecret, s.masterSecret)
	if err != nil {
		return fmt.Errorf("encrypt secret: %w", err)
	}
	return setTOTP(ctx, userID, encrypted, true)
}

func (s *TOTPService) Disable(ctx context.Context, userID string, setTOTP func(context.Context, string, string, bool) error) error {
	return setTOTP(ctx, userID, "", false)
}

func (s *TOTPService) DecryptAndValidate(encryptedSecret, code string) bool {
	raw, err := crypto.DecryptTOTPSecret(encryptedSecret, s.masterSecret)
	if err != nil {
		return false
	}
	return totp.Validate(code, raw)
}

// ValidateLoginCode validates a TOTP code during the login TOTP-confirm step.
func (s *TOTPService) ValidateLoginCode(encryptedSecret, code string) bool {
	return s.DecryptAndValidate(encryptedSecret, code)
}
```

- [ ] **Step 4: Run test**

```bash
cd src-go && go test ./internal/service/... -run TestTOTPService -v 2>&1 | tail -5
```

Expected: PASS.

- [ ] **Step 5: Create `handler/totp.go`**

```go
package handler

import (
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/react-go-quick-starter/server/internal/middleware"
	"github.com/react-go-quick-starter/server/internal/model"
	"github.com/react-go-quick-starter/server/internal/service"
	"golang.org/x/crypto/bcrypt"
)

type TOTPHandler struct {
	totpSvc *service.TOTPService
	authSvc *service.AuthService
}

func NewTOTPHandler(totpSvc *service.TOTPService, authSvc *service.AuthService) *TOTPHandler {
	return &TOTPHandler{totpSvc: totpSvc, authSvc: authSvc}
}

func (h *TOTPHandler) Setup(c echo.Context) error {
	claims, err := middleware.GetClaims(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, model.ErrorResponse{Message: "unauthorized"})
	}
	user, err := h.authSvc.GetUserByID(c.Request().Context(), claims.UserID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, model.ErrorResponse{Message: "user not found"})
	}
	secret, qrURI, err := h.totpSvc.GenerateSecret(user.Email, "ReactGoStarter")
	if err != nil {
		return c.JSON(http.StatusInternalServerError, model.ErrorResponse{Message: "failed to generate TOTP"})
	}
	return c.JSON(http.StatusOK, model.TOTPSetupResponse{Secret: secret, QRCodeURI: qrURI})
}

func (h *TOTPHandler) Verify(c echo.Context) error {
	claims, err := middleware.GetClaims(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, model.ErrorResponse{Message: "unauthorized"})
	}
	req := new(model.TOTPVerifyRequest)
	if err := c.Bind(req); err != nil {
		return c.JSON(http.StatusBadRequest, model.ErrorResponse{Message: "invalid request"})
	}

	user, err := h.authSvc.GetUserByID(c.Request().Context(), claims.UserID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, model.ErrorResponse{Message: "user not found"})
	}

	// During setup, the secret is raw (not yet encrypted in DB).
	// The client sends the raw secret from Setup response alongside the code.
	rawSecretHeader := c.Request().Header.Get("X-TOTP-Secret")
	if rawSecretHeader == "" {
		return c.JSON(http.StatusBadRequest, model.ErrorResponse{Message: "missing TOTP secret"})
	}

	userRepoRef := h.authSvc.UserRepo()
	if err := h.totpSvc.Enable(c.Request().Context(), claims.UserID, rawSecretHeader, req.Code, userRepoRef.SetTOTP); err != nil {
		return c.JSON(http.StatusBadRequest, model.ErrorResponse{Message: "invalid TOTP code"})
	}
	_ = user
	return c.JSON(http.StatusOK, map[string]string{"message": "2FA enabled"})
}

func (h *TOTPHandler) Disable(c echo.Context) error {
	claims, err := middleware.GetClaims(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, model.ErrorResponse{Message: "unauthorized"})
	}
	req := new(model.TOTPDisableRequest)
	if err := c.Bind(req); err != nil {
		return c.JSON(http.StatusBadRequest, model.ErrorResponse{Message: "invalid request"})
	}
	user, err := h.authSvc.GetUserByID(c.Request().Context(), claims.UserID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, model.ErrorResponse{Message: "user not found"})
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)); err != nil {
		return c.JSON(http.StatusUnauthorized, model.ErrorResponse{Message: "incorrect password"})
	}
	userRepoRef := h.authSvc.UserRepo()
	if err := h.totpSvc.Disable(c.Request().Context(), claims.UserID, userRepoRef.SetTOTP); err != nil {
		return c.JSON(http.StatusInternalServerError, model.ErrorResponse{Message: "failed to disable 2FA"})
	}
	return c.JSON(http.StatusOK, map[string]string{"message": "2FA disabled"})
}
```

- [ ] **Step 6: Add `UserRepo()` accessor to `AuthService`**

Append to `src-go/internal/service/auth_service.go`:

```go
// UserRepo exposes the underlying user repository for use by handler layer.
func (s *AuthService) UserRepo() UserRepository {
	return s.userRepo
}
```

- [ ] **Step 7: Build**

```bash
cd src-go && go build ./...
```

- [ ] **Step 8: Commit**

```bash
git add src-go/internal/service/totp_service.go src-go/internal/service/totp_service_test.go src-go/internal/handler/totp.go
git commit -m "feat: add TOTP service (generate, validate, encrypt/decrypt) and handler"
```

---

## Task 12: Modify login flow for TOTP two-step

**Files:**
- Modify: `src-go/internal/service/auth_service.go`
- Modify: `src-go/internal/handler/auth.go`

- [ ] **Step 1: Add TOTP session token to cache repository**

Append to `src-go/internal/repository/cache_repository.go`:

```go
func (r *CacheRepository) SetTOTPSession(ctx context.Context, sessionToken, userID string) error {
	return r.client.Set(ctx, "totp:session:"+sessionToken, userID, 5*time.Minute).Err()
}

func (r *CacheRepository) GetTOTPSession(ctx context.Context, sessionToken string) (string, error) {
	return r.client.GetDel(ctx, "totp:session:"+sessionToken).Result()
}
```

- [ ] **Step 2: Modify `AuthService.Login` to detect TOTP**

Replace the `Login` method in `auth_service.go`:

```go
func (s *AuthService) Login(ctx context.Context, req *model.LoginRequest) (any, error) {
	user, err := s.userRepo.GetByEmail(ctx, req.Email)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrInvalidCredentials
		}
		return nil, fmt.Errorf("get user: %w", err)
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)); err != nil {
		return nil, ErrInvalidCredentials
	}

	if user.TOTPEnabled && user.TOTPSecret != nil {
		// Issue a short-lived session token; full JWT will be issued after TOTP confirm.
		sessionToken := uuid.New().String()
		if err := s.cacheRepo.SetTOTPSession(ctx, sessionToken, user.ID.String()); err != nil {
			return nil, fmt.Errorf("store totp session: %w", err)
		}
		return &model.TOTPLoginResponse{TOTPRequired: true, SessionToken: sessionToken}, nil
	}

	return s.issueTokens(ctx, user)
}
```

- [ ] **Step 3: Add `ConfirmTOTP` to `AuthService`**

Append to `auth_service.go`:

```go
func (s *AuthService) ConfirmTOTP(ctx context.Context, req *model.TOTPConfirmRequest, totpSvc *TOTPServiceIface) (*model.AuthResponse, error) {
	userID, err := s.cacheRepo.GetTOTPSession(ctx, req.SessionToken)
	if err != nil {
		return nil, ErrInvalidToken
	}
	id, err := uuid.Parse(userID)
	if err != nil {
		return nil, ErrInvalidToken
	}
	user, err := s.userRepo.GetByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("get user: %w", err)
	}
	if user.TOTPSecret == nil || !totpSvc.DecryptAndValidate(*user.TOTPSecret, req.Code) {
		return nil, ErrInvalidCredentials
	}
	return s.issueTokens(ctx, user)
}
```

- [ ] **Step 4: Update `handler/auth.go` — Login and ConfirmTOTP handlers**

Update `Login` handler to handle the `any` return:

```go
func (h *AuthHandler) Login(c echo.Context) error {
	req := new(model.LoginRequest)
	if err := c.Bind(req); err != nil {
		return c.JSON(http.StatusBadRequest, model.ErrorResponse{Message: "invalid request body"})
	}
	if err := c.Validate(req); err != nil {
		return c.JSON(http.StatusUnprocessableEntity, model.ErrorResponse{Message: err.Error()})
	}

	result, err := h.authSvc.Login(c.Request().Context(), req)
	if err != nil {
		if errors.Is(err, service.ErrInvalidCredentials) {
			return c.JSON(http.StatusUnauthorized, model.ErrorResponse{Message: "invalid email or password"})
		}
		return c.JSON(http.StatusInternalServerError, model.ErrorResponse{Message: "login failed"})
	}

	if totpResp, ok := result.(*model.TOTPLoginResponse); ok {
		return c.JSON(http.StatusAccepted, totpResp)
	}
	return c.JSON(http.StatusOK, result)
}
```

Add `ConfirmTOTP` handler to `AuthHandler` (add `totpSvc` field and update constructor):

```go
type AuthHandler struct {
	authSvc      *service.AuthService
	totpSvc      *service.TOTPService
	jwtAccessTTL time.Duration
}

func NewAuthHandler(authSvc *service.AuthService, totpSvc *service.TOTPService, jwtAccessTTL time.Duration) *AuthHandler {
	return &AuthHandler{authSvc: authSvc, totpSvc: totpSvc, jwtAccessTTL: jwtAccessTTL}
}

func (h *AuthHandler) ConfirmTOTP(c echo.Context) error {
	req := new(model.TOTPConfirmRequest)
	if err := c.Bind(req); err != nil {
		return c.JSON(http.StatusBadRequest, model.ErrorResponse{Message: "invalid request"})
	}
	resp, err := h.authSvc.ConfirmTOTP(c.Request().Context(), req, h.totpSvc)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, model.ErrorResponse{Message: "invalid session or TOTP code"})
	}
	return c.JSON(http.StatusOK, resp)
}

func (h *AuthHandler) LogoutAll(c echo.Context) error {
	claims, err := middleware.GetClaims(c)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, model.ErrorResponse{Message: "unauthorized"})
	}
	if err := h.authSvc.LogoutAll(c.Request().Context(), claims.UserID); err != nil {
		return c.JSON(http.StatusInternalServerError, model.ErrorResponse{Message: "failed to logout all sessions"})
	}
	return c.JSON(http.StatusOK, map[string]string{"message": "all sessions terminated"})
}
```

- [ ] **Step 5: Add `LogoutAll` to `AuthService`**

```go
func (s *AuthService) LogoutAll(ctx context.Context, userID string) error {
	return s.cacheRepo.DeleteRefreshToken(ctx, userID)
}
```

- [ ] **Step 6: Build**

```bash
cd src-go && go build ./...
```

Fix any compile errors from the interface changes.

- [ ] **Step 7: Commit**

```bash
git add src-go/internal/service/auth_service.go src-go/internal/handler/auth.go src-go/internal/repository/
git commit -m "feat: modify login for TOTP two-step flow; add ConfirmTOTP and LogoutAll endpoints"
```

---

## Task 13: Register all new routes in server.go and wire dependencies in main.go

**Files:**
- Modify: `src-go/internal/server/server.go`
- Modify: `src-go/cmd/server/main.go`

- [ ] **Step 1: Update `server.go` to accept all new handlers**

Replace the `New` function signature and add route registration:

```go
func New(
	cfg *config.Config,
	cache *repository.CacheRepository,
	authH *handler.AuthHandler,
	verifH *handler.VerificationHandler,
	oauthH *handler.OAuthHandler,
	totpH *handler.TOTPHandler,
) *echo.Echo {
	e := echo.New()
	// ... existing middleware setup unchanged ...

	// Health
	e.GET("/health", handler.Health)
	e.GET("/api/v1/health", handler.HealthV1)
	e.GET("/ws", handler.WS)

	// Auth — public
	auth := e.Group("/api/v1/auth")
	jwtMw := middleware.JWT(cfg.JWTSecret, cache)
	rateLimiter := echomiddleware.RateLimiter(echomiddleware.NewRateLimiterMemoryStore(20))

	auth.POST("/register", authH.Register, rateLimiter)
	auth.POST("/login", authH.Login, rateLimiter)
	auth.POST("/login/totp-confirm", authH.ConfirmTOTP)
	auth.POST("/refresh", authH.Refresh)
	auth.POST("/forgot-password", verifH.ForgotPassword, rateLimiter)
	auth.POST("/reset-password", verifH.ResetPassword)
	auth.POST("/verify-email", verifH.VerifyEmail)

	// OAuth
	auth.GET("/oauth/:provider", oauthH.Redirect)
	auth.GET("/oauth/:provider/callback", oauthH.Callback)

	// Auth — protected
	auth.POST("/logout", authH.Logout, jwtMw)
	auth.DELETE("/sessions", authH.LogoutAll, jwtMw)
	auth.POST("/send-verification", verifH.SendVerification, jwtMw)

	// TOTP — protected
	auth.POST("/totp/setup", totpH.Setup, jwtMw)
	auth.POST("/totp/verify", totpH.Verify, jwtMw)
	auth.POST("/totp/disable", totpH.Disable, jwtMw)

	// Users — protected
	users := e.Group("/api/v1/users", jwtMw)
	users.GET("/me", authH.GetMe)

	return e
}
```

- [ ] **Step 2: Update `cmd/server/main.go` to wire all new dependencies**

Open `src-go/cmd/server/main.go` and update the construction block to:

```go
// Repositories
userRepo := repository.NewUserRepository(db)
cacheRepo := repository.NewCacheRepository(rdb)
tokenRepo := repository.NewTokenRepository(db)

// Mailer
var m mailer.Mailer
if cfg.SMTPHost != "" {
    m = mailer.NewSMTPMailer(cfg.SMTPHost, cfg.SMTPPort, cfg.SMTPFrom, cfg.SMTPPassword)
} else {
    m = mailer.NewNoopMailer()
}

// Services
authSvc := service.NewAuthService(userRepo, cacheRepo, cfg)
verifSvc := service.NewVerificationService(tokenRepo, userRepo, m)
totpSvc := service.NewTOTPService(cfg.JWTSecret)
oauthSvc := service.NewOAuthService(cfg, userRepo, cacheRepo, authSvc)

// Handlers
authH := handler.NewAuthHandler(authSvc, totpSvc, cfg.JWTAccessTTL)
verifH := handler.NewVerificationHandler(verifSvc, authSvc)
oauthH := handler.NewOAuthHandler(oauthSvc)
totpH := handler.NewTOTPHandler(totpSvc, authSvc)

e := server.New(cfg, cacheRepo, authH, verifH, oauthH, totpH)
```

Add missing imports: `mailer`, `service`, `handler` packages.

- [ ] **Step 3: Build the full binary**

```bash
cd src-go && go build ./cmd/server/
```

Expected: binary created in current directory (or `bin/server`). Fix any remaining compile errors.

- [ ] **Step 4: Run existing tests**

```bash
cd src-go && go test ./... 2>&1 | tail -20
```

Fix any test failures caused by changed signatures.

- [ ] **Step 5: Commit**

```bash
git add src-go/internal/server/ src-go/cmd/server/
git commit -m "feat: wire all new handlers and services in server.go and main.go"
```

---

**Phase 2 complete.** Proceed to `2026-04-26-phase3-frontend-pages.md`.
