package model

// Built-in role names. Migrations seed these; service layer hands them to the
// JWT claims at login time.
const (
	RoleAdmin = "admin"
	RoleUser  = "user"
)

// Built-in permission names. RequirePermission middleware uses these as the
// authorization key.
const (
	PermUsersRead   = "users:read"
	PermUsersWrite  = "users:write"
	PermAdminAccess = "admin:access"
)

// Role is the persistence shape; rarely needed at the service layer because
// claims carry the flattened role-name list.
type Role struct {
	ID          int    `db:"id"`
	Name        string `db:"name"`
	Description string `db:"description"`
}
