package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestGetModules(t *testing.T) {
	// Move the real modules dir temporarily if it exists
	if _, err := os.Stat("modules"); err == nil {
		os.Rename("modules", "modules_backup")
		defer os.Rename("modules_backup", "modules")
	}
	
	// 1. Missing dir
	modules, err := loadModulesFromDisk()
	if err != nil {
		t.Errorf("loadModulesFromDisk error for missing dir: %v", err)
	}
	if len(modules) != 0 {
		t.Errorf("Expected 0 modules, got %d", len(modules))
	}

	// Create modules folder
	os.Mkdir("modules", 0755)
	defer os.RemoveAll("modules")

	// 2. Empty dir
	modules, err = loadModulesFromDisk()
	if err != nil {
		t.Errorf("loadModulesFromDisk error for empty dir: %v", err)
	}
	if len(modules) != 0 {
		t.Errorf("Expected 0 modules, got %d", len(modules))
	}

	// 3. Valid dir
	mod1 := filepath.Join("modules", "mod1")
	os.Mkdir(mod1, 0755)
	validJSON := `{ "id": "mod1", "name": "Module 1", "executable": "run.sh" }`
	os.WriteFile(filepath.Join(mod1, "module.json"), []byte(validJSON), 0644)

	// 4. Invalid JSON
	mod2 := filepath.Join("modules", "mod2")
	os.Mkdir(mod2, 0755)
	os.WriteFile(filepath.Join(mod2, "module.json"), []byte(`{ invalid json`), 0644)

	// 5. Nested dirs (should be ignored or just process the folder if no module.json exists)
	mod3 := filepath.Join("modules", "mod3")
	os.MkdirAll(filepath.Join(mod3, "nested"), 0755)
	// no module.json in mod3

	modules, err = loadModulesFromDisk()
	if err != nil {
		t.Errorf("loadModulesFromDisk error: %v", err)
	}
	if len(modules) != 1 {
		t.Errorf("Expected 1 valid module, got %d", len(modules))
	} else if modules[0].ID != "mod1" {
		t.Errorf("Expected module ID 'mod1', got %s", modules[0].ID)
	}
}
