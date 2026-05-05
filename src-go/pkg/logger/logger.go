// Package logger provides slog helpers that automatically pull request_id /
// user_id from context. Handlers and services accept context.Context already,
// so they can call logger.FromContext(ctx).Info("...") and emit structured
// logs that carry the request envelope without manual plumbing.
package logger

import (
	"context"
	"log/slog"
)

type ctxKey string

const (
	requestIDKey ctxKey = "request_id"
	userIDKey    ctxKey = "user_id"
)

// WithRequestID returns ctx annotated with the request id. Used by the Echo
// middleware that adapts the X-Request-ID header.
func WithRequestID(ctx context.Context, id string) context.Context {
	if id == "" {
		return ctx
	}
	return context.WithValue(ctx, requestIDKey, id)
}

// WithUserID returns ctx annotated with the authenticated user id. The JWT
// middleware sets this once token validation succeeds.
func WithUserID(ctx context.Context, id string) context.Context {
	if id == "" {
		return ctx
	}
	return context.WithValue(ctx, userIDKey, id)
}

// RequestIDFromContext extracts the request id, or "" if absent.
func RequestIDFromContext(ctx context.Context) string {
	v, _ := ctx.Value(requestIDKey).(string)
	return v
}

// UserIDFromContext extracts the user id, or "" if absent.
func UserIDFromContext(ctx context.Context) string {
	v, _ := ctx.Value(userIDKey).(string)
	return v
}

// FromContext returns a slog.Logger pre-decorated with request_id and user_id
// when present. The base logger is the slog default, so this respects whatever
// handler the application configured at startup.
func FromContext(ctx context.Context) *slog.Logger {
	logger := slog.Default()
	if rid := RequestIDFromContext(ctx); rid != "" {
		logger = logger.With("request_id", rid)
	}
	if uid := UserIDFromContext(ctx); uid != "" {
		logger = logger.With("user_id", uid)
	}
	return logger
}
