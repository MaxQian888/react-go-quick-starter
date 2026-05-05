package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// TxBeginner is the subset of *pgxpool.Pool we need to start a transaction.
// Defining a narrow interface keeps tests honest (they pass pgxmock without
// importing the real pool) and avoids leaking pgxpool into service code.
type TxBeginner interface {
	Begin(ctx context.Context) (pgx.Tx, error)
}

// WithTx runs fn inside a database transaction. The transaction commits when
// fn returns nil; any returned error or panic causes a rollback. Repositories
// passed `tx` directly via their constructor (or via WithTx accessors) can
// participate in the same transaction.
//
// Example:
//
//	err := repository.WithTx(ctx, db, func(tx pgx.Tx) error {
//	    if err := userRepo.WithTx(tx).Create(ctx, u); err != nil { return err }
//	    return roleRepo.WithTx(tx).AssignRole(ctx, u.ID, "user")
//	})
func WithTx(ctx context.Context, pool TxBeginner, fn func(tx pgx.Tx) error) (err error) {
	if pool == nil {
		return ErrDatabaseUnavailable
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer func() {
		if p := recover(); p != nil {
			_ = tx.Rollback(ctx)
			panic(p)
		}
		if err != nil {
			_ = tx.Rollback(ctx)
		}
	}()

	if err = fn(tx); err != nil {
		return err
	}
	if err = tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit tx: %w", err)
	}
	return nil
}
