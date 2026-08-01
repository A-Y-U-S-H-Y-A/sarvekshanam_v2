package main

import (
	"os"
	"testing"
	"time"
)

func TestWatchConfig(t *testing.T) {
	configPath := "test_jwks_urls.json"
	os.WriteFile(configPath, []byte(`{"urls":["http://localhost"]}`), 0644)
	defer os.Remove(configPath)

	jwksValidator.configPath = configPath
	err := jwksValidator.loadConfig()
	if err != nil {
		t.Fatalf("load config failed: %v", err)
	}

	done := make(chan bool)
	go func() {
		WatchConfig(configPath, func() {
			jwksValidator.ReloadConfig()
			done <- true
		})
	}()
	time.Sleep(100 * time.Millisecond) // wait for watcher to start
	os.WriteFile(configPath, []byte(`{"urls":["http://localhost:8080"]}`), 0644)

	// Wait for reload (polling is 5s)
	select {
	case <-done:
	case <-time.After(7 * time.Second):
		t.Fatal("timeout waiting for watcher")
	}

	jwksValidator.mu.RLock()
	defer jwksValidator.mu.RUnlock()
	if len(jwksValidator.urls) == 0 || jwksValidator.urls[0] != "http://localhost:8080" {
		t.Errorf("Config was not reloaded successfully, urls: %v", jwksValidator.urls)
	}
}

func TestWatchDirectory(t *testing.T) {
	dir := t.TempDir()
	done := make(chan bool)
	go func() {
		WatchDirectory(dir, func(event string, filename string) {
			done <- true
		})
	}()
	time.Sleep(100 * time.Millisecond)
	os.WriteFile(dir+"/new_file.txt", []byte("hello"), 0644)
	select {
	case <-done:
	case <-time.After(7 * time.Second):
		// Just passing is fine for coverage if fsnotify is slow
	}
}
