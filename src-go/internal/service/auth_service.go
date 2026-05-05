// Package service implements business logic for authentication and user management.
package service

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"slices"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/react-go-quick-starter/server/internal/config"
	"github.com/react-go-quick-starter/server/internal/model"
	"golang.org/x/crypto/bcrypt"
)

// UserRepository defines the interface for user persistence operations.
type UserRepository interface {
	Create(ctx context.Context, user *model.User) error
	GetByEmail(ctx context.Context, email string) (*model.User, error)
	GetByID(ctx context.Context, id uuid.UUID) (*model.User, error)
}

// CacheRepository defines the interface for token caching operations.
type CacheRepository interface {
	SetRefreshToken(ctx context.Context, userID, token string, ttl time.Duration) error
	GetRefreshToken(ctx context.Context, userID string) (string, error)
	DeleteRefreshToken(ctx context.Context, userID string) error
	BlacklistToken(ctx context.Context, jti string, ttl time.Duration) error
	IsBlacklisted(ctx context.Context, jti string) (bool, error)
}

// RoleRepository abstracts the role/permission lookups the service needs.
// Optional: when nil, JWT claims are issued without role data (legacy mode).
type RoleRepository interface {
	AssignRoleByName(ctx context.Context, userID uuid.UUID, roleName string) error
	ListRolesForUser(ctx context.Context, userID uuid.UUID) ([]string, error)
	ListPermissionsForUser(ctx context.Context, userID uuid.UUID) ([]string, error)
}

// Claims holds custom JWT claims for access and refresh tokens. Roles and
// permissions are embedded so middleware can authorize without a DB roundtrip.
type Claims struct {
	UserID      string   `json:"sub"`
	Email       string   `json:"email"`
	JTI         string   `json:"jti"`
	Roles       []string `json:"roles,omitempty"`
	Permissions []string `json:"perms,omitempty"`
	jwt.RegisteredClaims
}

// HasRole reports whether the claims include the given role name.
func (c *Claims) HasRole(name string) bool {
	return slices.Contains(c.Roles, name)
}

// HasPermission reports whether the claims include the given permission.
func (c *Claims) HasPermission(name string) bool {
	return slices.Contains(c.Permissions, name)
}

type AuthService struct {
	userRepo  UserRepository
	cacheRepo CacheRepository
	roleRepo  RoleRepository // optional
	cfg       *config.Config
}

func NewAuthService(userRepo UserRepository, cacheRepo CacheRepository, cfg *config.Config) *AuthService {
	return &AuthService{userRepo: userRepo, cacheRepo: cacheRepo, cfg: cfg}
}

// WithRoleRepository attaches an RBAC backend so issued tokens carry role and
// permission claims. Pass nil at boot when the migration hasn't run yet.
func (s *AuthService) WithRoleRepository(roleRepo RoleRepository) *AuthService {
	s.roleRepo = roleRepo
	return s
}

// Register creates a new user and returns auth tokens.
func (s *AuthService) Register(ctx context.Context, req *model.RegisterRequest) (*model.AuthResponse, error) {
	// Check if email already exists
	existing, err := s.userRepo.GetByEmail(ctx, req.Email)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("check existing user: %w", err)
	}
	if existing != nil {
		return nil, ErrEmailAlreadyExists
	}

	// Hash password
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("hash password: %w", err)
	}

	user := &model.User{
		ID:       uuid.New(),
		Email:    req.Email,
		Password: string(hash),
		Name:     req.Name,
	}

	if err := s.userRepo.Create(ctx, user); err != nil {
		return nil, fmt.Errorf("create user: %w", err)
	}

	// Assign the default "user" role so freshly registered accounts carry
	// at least the read-only permissions. Failure here is non-fatal: the
	// account exists, login still works, an admin can fix it later.
	if s.roleRepo != nil {
		if err := s.roleRepo.AssignRoleByName(ctx, user.ID, model.RoleUser); err != nil {
			slog.Warn("rbac: assign default role failed", "user", user.ID, "error", err)
		}
	}

	return s.issueTokens(ctx, user)
}

// Login validates credentials and returns auth tokens.
func (s *AuthService) Login(ctx context.Context, req *model.LoginRequest) (*model.AuthResponse, error) {
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

	return s.issueTokens(ctx, user)
}

// Refresh validates a refresh token and rotates both tokens.
func (s *AuthService) Refresh(ctx context.Context, refreshToken string) (*model.AuthResponse, error) {
	// Parse and validate the refresh token (we sign it as a JWT too)
	claims := &Claims{}
	token, err := jwt.ParseWithClaims(refreshToken, claims, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return []byte(s.cfg.JWTSecret), nil
	})
	if err != nil || !token.Valid {
		return nil, ErrInvalidToken
	}

	// Verify stored refresh token matches
	stored, err := s.cacheRepo.GetRefreshToken(ctx, claims.UserID)
	if err != nil || stored != refreshToken {
		return nil, ErrInvalidToken
	}

	// Load user
	userID, err := uuid.Parse(claims.UserID)
	if err != nil {
		return nil, ErrInvalidToken
	}
	user, err := s.userRepo.GetByID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("get user: %w", err)
	}

	// Delete old refresh token before issuing new ones
	_ = s.cacheRepo.DeleteRefreshToken(ctx, claims.UserID)

	return s.issueTokens(ctx, user)
}

// Logout blacklists the access token JTI and removes the refresh token.
func (s *AuthService) Logout(ctx context.Context, userID, jti string, accessTokenTTL time.Duration) error {
	// Add JTI to blacklist
	if err := s.cacheRepo.BlacklistToken(ctx, jti, accessTokenTTL); err != nil {
		return fmt.Errorf("blacklist token: %w", err)
	}
	// Remove refresh token
	_ = s.cacheRepo.DeleteRefreshToken(ctx, userID)
	return nil
}

// issueTokens creates and stores access + refresh tokens for a user.
func (s *AuthService) issueTokens(ctx context.Context, user *model.User) (*model.AuthResponse, error) {
	now := time.Now()
	userID := user.ID.String()

	// Best-effort RBAC enrichment. A failure here doesn't block login — we
	// just issue a token with empty role/perm arrays and log it.
	var roles, perms []string
	if s.roleRepo != nil {
		var err error
		roles, err = s.roleRepo.ListRolesForUser(ctx, user.ID)
		if err != nil {
			slog.Warn("rbac: list roles failed, issuing token without roles", "user", userID, "error", err)
			roles = nil
		}
		perms, err = s.roleRepo.ListPermissionsForUser(ctx, user.ID)
		if err != nil {
			slog.Warn("rbac: list perms failed", "user", userID, "error", err)
			perms = nil
		}
	}

	// Access token
	accessJTI := uuid.New().String()
	accessClaims := &Claims{
		UserID:      userID,
		Email:       user.Email,
		JTI:         accessJTI,
		Roles:       roles,
		Permissions: perms,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(s.cfg.JWTAccessTTL)),
			IssuedAt:  jwt.NewNumericDate(now),
			Subject:   userID,
		},
	}
	accessToken, err := jwt.NewWithClaims(jwt.SigningMethodHS256, accessClaims).SignedString([]byte(s.cfg.JWTSecret))
	if err != nil {
		return nil, fmt.Errorf("sign access token: %w", err)
	}

	// Refresh token (also a JWT for self-contained validation). Refresh tokens
	// intentionally omit roles/perms — they are re-fetched on each refresh so
	// privilege changes propagate within one access-token lifetime.
	refreshJTI := uuid.New().String()
	refreshClaims := &Claims{
		UserID: userID,
		Email:  user.Email,
		JTI:    refreshJTI,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(s.cfg.JWTRefreshTTL)),
			IssuedAt:  jwt.NewNumericDate(now),
			Subject:   userID,
		},
	}
	refreshToken, err := jwt.NewWithClaims(jwt.SigningMethodHS256, refreshClaims).SignedString([]byte(s.cfg.JWTSecret))
	if err != nil {
		return nil, fmt.Errorf("sign refresh token: %w", err)
	}

	// Store refresh token in Redis
	if err := s.cacheRepo.SetRefreshToken(ctx, userID, refreshToken, s.cfg.JWTRefreshTTL); err != nil {
		return nil, fmt.Errorf("store refresh token: %w", err)
	}

	return &model.AuthResponse{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		User:         user.ToDTO(),
	}, nil
}

// Sentinel errors
var (
	ErrEmailAlreadyExists = errors.New("email already exists")
	ErrInvalidCredentials = errors.New("invalid email or password")
	ErrInvalidToken       = errors.New("invalid or expired token")
)
