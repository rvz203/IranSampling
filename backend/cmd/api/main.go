package main

import (
	"bufio"
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"faracode/sampling/internal/app"
	"faracode/sampling/internal/database"
)

func loadEnv() {
	for _, path := range []string{"../.env", ".env"} {
		f, err := os.Open(path)
		if err != nil {
			continue
		}
		scanner := bufio.NewScanner(f)
		for scanner.Scan() {
			line := strings.TrimPrefix(strings.TrimSpace(scanner.Text()), "\ufeff")
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}
			k, v, ok := strings.Cut(line, "=")
			if ok && os.Getenv(k) == "" {
				os.Setenv(k, strings.Trim(v, "\"'"))
			}
		}
		f.Close()
	}
}

func main() {
	loadEnv()
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		slog.Error("DATABASE_URL is required; see .env.example")
		os.Exit(1)
	}
	pool, err := database.Open(ctx, url)
	if err != nil {
		slog.Error("database unavailable", "error", err)
		os.Exit(1)
	}
	defer pool.Close()
	if err = database.Migrate(ctx, pool); err != nil {
		slog.Error("migration failed", "error", err)
		os.Exit(1)
	}
	demo := os.Getenv("ENABLE_DEMO") == "true" && os.Getenv("APP_ENV") != "production"
	if demo {
		if err = database.Seed(ctx, pool); err != nil {
			slog.Error("demo seed failed", "error", err)
			os.Exit(1)
		}
	}
	mapData := os.Getenv("MAP_DATA_DIR")
	if mapData == "" {
		mapData = "../.local/maps"
	}
	server := app.New(pool, app.Config{
		Demo: demo, Production: os.Getenv("APP_ENV") == "production",
		UploadDir: os.Getenv("UPLOAD_DIR"), MapDataDir: mapData,
	})
	if err = server.BootstrapAdmin(ctx, os.Getenv("ADMIN_EMAIL"), os.Getenv("ADMIN_PASSWORD")); err != nil {
		slog.Error("admin bootstrap failed", "error", err)
		os.Exit(1)
	}
	go func() {
		ticker := time.NewTicker(10 * time.Second)
		defer ticker.Stop()
		for {
			closeCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
			if err := server.FinalizeDueShifts(closeCtx); err != nil && ctx.Err() == nil {
				slog.Error("shift closeout failed", "error", err)
			}
			cancel()
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
			}
		}
	}()
	go func() {
		ticker := time.NewTicker(time.Hour)
		defer ticker.Stop()
		for {
			pruneCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
			if err := server.PruneTracking(pruneCtx); err != nil && ctx.Err() == nil {
				slog.Error("location retention cleanup failed", "error", err)
			}
			cancel()
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
			}
		}
	}()
	port := os.Getenv("API_PORT")
	if port == "" {
		port = "8080"
	}
	srv := &http.Server{Addr: ":" + port, Handler: server.Handler(), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 20 * time.Second, WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 1 << 20}
	go func() {
		slog.Info("FaraCode API ready", "address", "http://127.0.0.1:"+port, "demo", demo)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server failed", "error", err)
			stop()
		}
	}()
	<-ctx.Done()
	shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	srv.Shutdown(shutdown)
}
