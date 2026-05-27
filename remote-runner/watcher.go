package main

import (
	"log"
	"os"
	"path/filepath"
	"time"

	"github.com/fsnotify/fsnotify"
)

// WatchConfig polls a specific file (like jwks_urls.json) for changes and reloads when modified.
// Uses simple stat-based polling (no external dependencies).
// Poll interval: 5 seconds.
func WatchConfig(configPath string, onReload func()) {
	go func() {
		var lastMod time.Time

		// Get initial mod time
		if info, err := os.Stat(configPath); err == nil {
			lastMod = info.ModTime()
		}

		absPath, _ := filepath.Abs(configPath)
		log.Printf("[Watcher] Watching %s for changes (polling every 5s)", absPath)

		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()

		for range ticker.C {
			info, err := os.Stat(configPath)
			if err != nil {
				continue
			}

			if info.ModTime().After(lastMod) {
				lastMod = info.ModTime()
				log.Printf("[Watcher] %s changed — reloading", configPath)
				onReload()
			}
		}
	}()
}

// WatchDirectory uses fsnotify to watch a directory for any changes and triggers onReload.
func WatchDirectory(dirPath string, onReload func(event string, filename string)) {
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		log.Printf("[Watcher] Failed to create fsnotify watcher: %v", err)
		return
	}

	absPath, _ := filepath.Abs(dirPath)
	log.Printf("[Watcher] Watching directory %s for changes using fsnotify", absPath)

	go func() {
		defer watcher.Close()
		// Debounce reloads
		var timer *time.Timer
		for {
			select {
			case event, ok := <-watcher.Events:
				if !ok {
					return
				}
				if event.Op&fsnotify.Write == fsnotify.Write || event.Op&fsnotify.Create == fsnotify.Create || event.Op&fsnotify.Remove == fsnotify.Remove || event.Op&fsnotify.Rename == fsnotify.Rename {
					if timer != nil {
						timer.Stop()
					}
					timer = time.AfterFunc(500*time.Millisecond, func() {
						onReload(event.Op.String(), event.Name)
					})
				}
			case err, ok := <-watcher.Errors:
				if !ok {
					return
				}
				log.Printf("[Watcher] Error: %v", err)
			}
		}
	}()

	err = watcher.Add(dirPath)
	if err != nil {
		log.Printf("[Watcher] Failed to watch directory %s: %v", dirPath, err)
	}

	// Also watch subdirectories (modules/modulename)
	entries, err := os.ReadDir(dirPath)
	if err == nil {
		for _, entry := range entries {
			if entry.IsDir() {
				subPath := filepath.Join(dirPath, entry.Name())
				watcher.Add(subPath)
			}
		}
	}
}
