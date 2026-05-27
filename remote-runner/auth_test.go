package main

import (
	"crypto/rsa"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAuthMiddleware(t *testing.T) {
	handler := authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	// 1. No keys loaded (dev mode) -> allows unauthenticated
	jwksValidator.mu.Lock()
	jwksValidator.keys = nil
	jwksValidator.mu.Unlock()

	req := httptest.NewRequest("GET", "/modules", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected 200 in dev mode, got %d", rr.Code)
	}

	// 2. Keys loaded -> requires auth
	jwksValidator.mu.Lock()
	jwksValidator.keys = map[string]*rsa.PublicKey{
		"dummy": {}, // fake key
	}
	jwksValidator.mu.Unlock()

	// Missing header
	req = httptest.NewRequest("GET", "/modules", nil)
	rr = httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	if rr.Code != http.StatusUnauthorized {
		t.Errorf("Expected 401 for missing header, got %d", rr.Code)
	}

	// Invalid token format
	req = httptest.NewRequest("GET", "/modules", nil)
	req.Header.Set("Authorization", "Bearer invalid-token")
	rr = httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	if rr.Code != http.StatusUnauthorized {
		t.Errorf("Expected 401 for invalid token format, got %d", rr.Code)
	}

	// 3. /ping endpoint always allowed
	req = httptest.NewRequest("GET", "/ping", nil)
	rr = httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Errorf("Expected 200 for /ping, got %d", rr.Code)
	}
}
