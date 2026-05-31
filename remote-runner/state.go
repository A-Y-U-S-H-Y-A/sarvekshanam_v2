package main

import (
	"encoding/json"
	"log"
	"os"
	"sync"
)

var (
	stateFile  = "state.json"
	stateMutex sync.Mutex
	activeIDs  = make(map[string]string) // sandboxID -> path
)

// AddActiveExecution registers an active sandbox in state.json
func AddActiveExecution(sandboxID, path string) {
	stateMutex.Lock()
	defer stateMutex.Unlock()

	activeIDs[sandboxID] = path
	saveState()
}

// RemoveActiveExecution removes a sandbox from state.json
func RemoveActiveExecution(sandboxID string) {
	stateMutex.Lock()
	defer stateMutex.Unlock()

	delete(activeIDs, sandboxID)
	saveState()
}

// saveState writes the current active map to state.json
// Must be called with stateMutex held.
func saveState() {
	data, err := json.Marshal(activeIDs)
	if err == nil {
		if err := os.WriteFile(stateFile, data, 0644); err != nil { log.Printf("[State] Failed to persist state: %v", err) }
	}
}

// RecoverState runs on startup to clean up any orphaned sandboxes
func RecoverState() {
	stateMutex.Lock()
	defer stateMutex.Unlock()

	data, err := os.ReadFile(stateFile)
	if err != nil {
		if !os.IsNotExist(err) {
			log.Printf("[State] Failed to read state.json: %v", err)
		}
		return
	}

	var orphaned map[string]string
	if err := json.Unmarshal(data, &orphaned); err != nil {
		log.Printf("[State] Failed to parse state.json: %v", err)
		return
	}

	cleanedCount := 0
	for id, path := range orphaned {
		log.Printf("[State] Found orphaned sandbox %s. Cleaning up...", id)
		if err := os.RemoveAll(path); err != nil {
			log.Printf("[State] Failed to remove orphaned sandbox %s: %v", id, err)
		} else {
			cleanedCount++
		}
	}

	if cleanedCount > 0 {
		log.Printf("[State] Cleaned %d orphaned sandboxes.", cleanedCount)
	}

	// Reset state
	activeIDs = make(map[string]string)
	saveState()
}
