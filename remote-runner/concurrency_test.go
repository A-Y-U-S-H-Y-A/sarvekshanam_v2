package main

import (
	"testing"
)

func TestConcurrencySemaphore(t *testing.T) {
	InitSemaphore(2)

	// Should acquire 2 slots
	err := AcquireSemaphore()
	if err != nil {
		t.Errorf("Expected nil, got %v", err)
	}
	err = AcquireSemaphore()
	if err != nil {
		t.Errorf("Expected nil, got %v", err)
	}

	// 3rd should fail
	err = AcquireSemaphore()
	if err != ErrSemaphoreFull {
		t.Errorf("Expected ErrSemaphoreFull, got %v", err)
	}

	// Release 1
	ReleaseSemaphore()

	// Should be able to acquire 1 now
	err = AcquireSemaphore()
	if err != nil {
		t.Errorf("Expected nil after release, got %v", err)
	}
}
