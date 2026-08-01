package main

import (
	"encoding/json"
	"os"
	"testing"
)

func TestRecoverState(t *testing.T) {
	stateFile = "test_state.json"
	defer os.Remove(stateFile)

	active := map[string]string{
		"exec1": "/tmp/1",
		"exec2": "/tmp/2",
	}
	data, _ := json.Marshal(active)
	os.WriteFile(stateFile, data, 0644)

	RecoverState()

	if len(activeIDs) != 0 {
		t.Errorf("Expected 0 active IDs after recover, got %d", len(activeIDs))
	}

	// Test no state file
	os.Remove(stateFile)
	RecoverState()
	if len(activeIDs) != 0 {
		t.Error("Expected 0 active IDs")
	}

	// Test invalid JSON
	os.WriteFile(stateFile, []byte("invalid json"), 0644)
	RecoverState()
	if len(activeIDs) != 0 {
		t.Error("Expected 0 active IDs on invalid json")
	}
}

func TestStateManagement(t *testing.T) {
	stateFile = "test_state2.json"
	defer os.Remove(stateFile)
	activeIDs = make(map[string]string)

	AddActiveExecution("test1", "/tmp/1")
	if activeIDs["test1"] != "/tmp/1" {
		t.Error("test1 not added")
	}

	RemoveActiveExecution("test1")
	if activeIDs["test1"] != "" {
		t.Error("test1 not removed")
	}
}
