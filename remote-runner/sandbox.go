package main

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

var (
	sandboxRegistry = make(map[string]*Sandbox)
	sandboxMutex    sync.RWMutex
)

// generateSandboxID creates a random UUID-like string
func generateSandboxID() string {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "fallback_id"
	}
	return hex.EncodeToString(bytes)
}

// Sandbox represents an active execution environment
type Sandbox struct {
	ID        string
	Path      string
	CreatedAt time.Time
	OriginalFiles map[string]bool
}

// CreateSandbox creates an ephemeral directory and copies the module files into it.
func CreateSandbox(moduleDir string) (*Sandbox, error) {
	sandboxID := generateSandboxID()
	sandboxPath := filepath.Join(os.TempDir(), fmt.Sprintf("sarv_%s", sandboxID))

	err := os.MkdirAll(sandboxPath, 0755)
	if err != nil {
		return nil, fmt.Errorf("failed to create sandbox dir: %w", err)
	}

	entries, err := os.ReadDir(moduleDir)
	if err != nil {
		return nil, fmt.Errorf("failed to read module dir: %w", err)
	}

	originalFiles := make(map[string]bool)

	for _, entry := range entries {
		srcPath := filepath.Join(moduleDir, entry.Name())
		destPath := filepath.Join(sandboxPath, entry.Name())

		cleanDest := filepath.Clean(destPath)
		if !strings.HasPrefix(cleanDest, filepath.Clean(sandboxPath)) {
			return nil, fmt.Errorf("path traversal attempt detected: %s", entry.Name())
		}

		info, err := entry.Info()
		if err != nil {
			continue
		}
		if info.Mode()&os.ModeSymlink != 0 {
			continue
		}

		if entry.IsDir() {
			continue
		}

		if err := copyFile(srcPath, destPath); err != nil {
			log.Printf("[Sandbox] Failed to copy %s: %v", srcPath, err)
		} else {
			originalFiles[entry.Name()] = true
		}
	}

	sandbox := &Sandbox{
		ID:            sandboxID,
		Path:          sandboxPath,
		CreatedAt:     time.Now(),
		OriginalFiles: originalFiles,
	}

	sandboxMutex.Lock()
	sandboxRegistry[sandboxID] = sandbox
	sandboxMutex.Unlock()

	AddActiveExecution(sandboxID, sandboxPath)

	return sandbox, nil
}

// GetSandbox retrieves a sandbox from the registry
func GetSandbox(id string) *Sandbox {
	sandboxMutex.RLock()
	defer sandboxMutex.RUnlock()
	return sandboxRegistry[id]
}

// Cleanup removes the ephemeral directory and removes it from the registry
func (s *Sandbox) Cleanup() {
	if err := os.RemoveAll(s.Path); err != nil {
		log.Printf("[Sandbox] Failed to cleanup sandbox %s: %v", s.Path, err)
	} else {
		log.Printf("[Sandbox] Cleaned up sandbox %s", s.ID)
	}
	sandboxMutex.Lock()
	delete(sandboxRegistry, s.ID)
	sandboxMutex.Unlock()

	RemoveActiveExecution(s.ID)
}

// DetectGeneratedFiles scans the sandbox for files that were not part of the original module.
func (s *Sandbox) DetectGeneratedFiles() []FileMeta {
	var files []FileMeta
	entries, err := os.ReadDir(s.Path)
	if err != nil {
		log.Printf("[Sandbox] Failed to read sandbox %s: %v", s.ID, err)
		return files
	}

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		
		if !s.OriginalFiles[entry.Name()] {
			info, err := entry.Info()
			if err != nil {
				continue
			}
			files = append(files, FileMeta{
				Name: entry.Name(),
				Size: info.Size(),
				Path: filepath.Join(s.Path, entry.Name()),
			})
		}
	}
	return files
}

// Helper to copy a file
func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()

	if _, err = io.Copy(out, in); err != nil {
		return err
	}
	return out.Sync()
}
