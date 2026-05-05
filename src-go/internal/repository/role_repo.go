package repository

import (
	"context"
	"fmt"
	"slices"

	"github.com/google/uuid"
)

// RoleRepository handles role assignments and permission lookups for users.
type RoleRepository struct {
	db DBTX
}

func NewRoleRepository(db DBTX) *RoleRepository {
	return &RoleRepository{db: db}
}

// WithTx scopes the repository to a transaction so role assignment can be
// performed atomically with user creation.
func (r *RoleRepository) WithTx(tx DBTX) *RoleRepository {
	return &RoleRepository{db: tx}
}

// AssignRoleByName grants the named role to a user. Idempotent: re-assigning
// an existing pair is a no-op thanks to the composite primary key.
func (r *RoleRepository) AssignRoleByName(ctx context.Context, userID uuid.UUID, roleName string) error {
	if r.db == nil {
		return ErrDatabaseUnavailable
	}
	const q = `
		INSERT INTO user_roles (user_id, role_id)
		SELECT $1, id FROM roles WHERE name = $2
		ON CONFLICT (user_id, role_id) DO NOTHING
	`
	_, err := r.db.Exec(ctx, q, userID, roleName)
	if err != nil {
		return fmt.Errorf("assign role %q to user %s: %w", roleName, userID, err)
	}
	return nil
}

// ListRolesForUser returns the role names assigned to a user. Empty slice
// when the user has no roles (e.g. legacy accounts created before RBAC).
func (r *RoleRepository) ListRolesForUser(ctx context.Context, userID uuid.UUID) ([]string, error) {
	if r.db == nil {
		return nil, ErrDatabaseUnavailable
	}
	rows, err := r.db.Query(ctx,
		`SELECT r.name FROM roles r
		 JOIN user_roles ur ON ur.role_id = r.id
		 WHERE ur.user_id = $1
		 ORDER BY r.name`, userID)
	if err != nil {
		return nil, fmt.Errorf("list roles for user %s: %w", userID, err)
	}
	defer rows.Close()

	roles := make([]string, 0)
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, fmt.Errorf("scan role row: %w", err)
		}
		roles = append(roles, name)
	}
	return roles, rows.Err()
}

// ListPermissionsForUser returns the union of permissions across the user's
// roles. Used to embed flattened permissions in the JWT claims.
func (r *RoleRepository) ListPermissionsForUser(ctx context.Context, userID uuid.UUID) ([]string, error) {
	if r.db == nil {
		return nil, ErrDatabaseUnavailable
	}
	rows, err := r.db.Query(ctx,
		`SELECT DISTINCT p.name
		 FROM permissions p
		 JOIN role_permissions rp ON rp.permission_id = p.id
		 JOIN user_roles ur ON ur.role_id = rp.role_id
		 WHERE ur.user_id = $1
		 ORDER BY p.name`, userID)
	if err != nil {
		return nil, fmt.Errorf("list perms for user %s: %w", userID, err)
	}
	defer rows.Close()

	perms := make([]string, 0)
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, fmt.Errorf("scan perm row: %w", err)
		}
		perms = append(perms, name)
	}
	return perms, rows.Err()
}

// HasPermission narrows a single check used by tests / programmatic gates.
func (r *RoleRepository) HasPermission(ctx context.Context, userID uuid.UUID, perm string) (bool, error) {
	perms, err := r.ListPermissionsForUser(ctx, userID)
	if err != nil {
		return false, err
	}
	return slices.Contains(perms, perm), nil
}
