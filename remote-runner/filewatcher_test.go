package main

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestFileWatcher(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "watcher_test")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	eventCount := 0
	eventChan := make(chan struct{}, 10)

	WatchDirectory(tempDir, func(event string, filename string) {
		eventCount++
		eventChan <- struct{}{}
	})

	// Give watcher time to start
	time.Sleep(200 * time.Millisecond)

	// 1. Create a file
	filePath := filepath.Join(tempDir, "test.txt")
	os.WriteFile(filePath, []byte("hello"), 0644)

	select {
	case <-eventChan:
		// success
	case <-time.After(2 * time.Second):
		t.Error("Timeout waiting for create event")
	}

	// 2. Modify a file
	os.WriteFile(filePath, []byte("world"), 0644)

	select {
	case <-eventChan:
		// success
	case <-time.After(2 * time.Second):
		t.Error("Timeout waiting for modify event")
	}

	// 3. Remove a file
	os.Remove(filePath)

	select {
	case <-eventChan:
		// success
	case <-time.After(2 * time.Second):
		t.Error("Timeout waiting for remove event")
	}
}
