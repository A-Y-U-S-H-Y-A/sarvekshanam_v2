package main

import (
	"encoding/json"
	"fmt"
	"net/http"
)

// SSEMessage represents a single event to be sent via Server-Sent Events.
type SSEMessage struct {
	Type      string      `json:"type"`                // "stdout", "stderr", "done"
	Line      string      `json:"line,omitempty"`      // For stdout/stderr
	ExitCode  *int        `json:"exit_code,omitempty"` // For done
	Files     []FileMeta  `json:"files,omitempty"`     // For chunked file transfer later
	SandboxID string      `json:"sandbox_id,omitempty"`// To fetch files later
	Error     string      `json:"error,omitempty"`     // For execution errors
	Target    string      `json:"target,omitempty"`    // For bulk mode
}

type FileMeta struct {
	Name string `json:"name"`
	Size int64  `json:"size"`
	Path string `json:"path"`
}

// SendSSE serializes a message to JSON and writes it to the ResponseWriter in SSE format.
func SendSSE(w http.ResponseWriter, flusher http.Flusher, msg SSEMessage) error {
	data, err := json.Marshal(msg)
	if err != nil {
		return err
	}
	_, err = fmt.Fprintf(w, "data: %s\n\n", string(data))
	if err != nil {
		return err
	}
	if flusher != nil {
		flusher.Flush()
	}
	return nil
}

// WriteSSEHeaders sets the required headers for SSE streaming
func WriteSSEHeaders(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	// Allow CORS if needed
	w.Header().Set("Access-Control-Allow-Origin", "*")
}
