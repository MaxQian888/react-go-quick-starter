-- RBAC: roles, permissions, role-permission map, and user-role map.
-- Seeded with two roles: "admin" (full access) and "user" (default for new
-- registrations). Add new permissions/roles in subsequent migrations.

CREATE TABLE IF NOT EXISTS roles (
    id          SERIAL PRIMARY KEY,
    name        TEXT UNIQUE NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS permissions (
    id          SERIAL PRIMARY KEY,
    name        TEXT UNIQUE NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id       INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_roles (
    user_id    UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id    INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role_id);

-- Seed default roles.
INSERT INTO roles (name, description) VALUES
    ('admin', 'Full administrative access'),
    ('user',  'Default role for newly registered accounts')
ON CONFLICT (name) DO NOTHING;

-- Seed minimal permissions. The `users:*` permission gates everything under
-- the /api/v1/users tree; admin gets it automatically.
INSERT INTO permissions (name, description) VALUES
    ('users:read',   'Read user records'),
    ('users:write',  'Create or update user records'),
    ('admin:access', 'Access administrative endpoints')
ON CONFLICT (name) DO NOTHING;

-- Wire admin role to all permissions (catch-up on rerun if any added).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'admin'
ON CONFLICT DO NOTHING;

-- Wire user role to read-only permissions.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'user' AND p.name IN ('users:read')
ON CONFLICT DO NOTHING;
