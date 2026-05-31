package main

import (
	"errors"
)

var (
	ErrSemaphoreFull = errors.New("semaphore full")
	concurrencySem   chan struct{}
)

// InitSemaphore initializes the concurrency semaphore with a given max limit.
func InitSemaphore(max int) {
	concurrencySem = make(chan struct{}, max)
}

// AcquireSemaphore attempts to acquire a slot. Returns ErrSemaphoreFull if full.
func AcquireSemaphore() error {
	select {
	case concurrencySem <- struct{}{}:
		return nil
	default:
		return ErrSemaphoreFull
	}
}

// ReleaseSemaphore releases a slot.
func ReleaseSemaphore() {
	select {
	case <-concurrencySem:
	default:
	}
}
