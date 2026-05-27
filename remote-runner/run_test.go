package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRunHandler(t *testing.T) {
	InitSemaphore(5)

	// Set up temporary modules
	if _, err := os.Stat("modules"); err == nil {
		os.Rename("modules", "modules_backup")
		defer os.Rename("modules_backup", "modules")
	}
	
	os.Mkdir("modules", 0755)
	defer os.RemoveAll("modules")

	// Node module (was bash)
	mod1 := filepath.Join("modules", "test-bash")
	os.Mkdir(mod1, 0755)
	validJSON := `{ "id": "test-bash", "name": "Bash Test", "language": "node", "executable": "run.js" }`
	os.WriteFile(filepath.Join(mod1, "module.json"), []byte(validJSON), 0644)
	os.WriteFile(filepath.Join(mod1, "run.js"), []byte("console.log('hello bash')\n"), 0755)

	// Node module (was python)
	mod2 := filepath.Join("modules", "test-python")
	os.Mkdir(mod2, 0755)
	pyJSON := `{ "id": "test-python", "name": "Python Test", "language": "node", "executable": "run.js" }`
	os.WriteFile(filepath.Join(mod2, "module.json"), []byte(pyJSON), 0644)
	os.WriteFile(filepath.Join(mod2, "run.js"), []byte("console.log('hello python')\n"), 0644)

	refreshModuleCache()

	// 1. Valid Bash module
	reqBody := `{"module": "test-bash", "args": []}`
	req := httptest.NewRequest("POST", "/run", strings.NewReader(reqBody))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	
	runHandler(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d", rr.Code)
	}
	bodyStr := rr.Body.String()
	if !strings.Contains(bodyStr, "hello bash") {
		t.Errorf("Expected 'hello bash' in SSE output, got %s", bodyStr)
	}

	// 2. Missing module
	reqBody = `{"module": "non-existent", "args": []}`
	req = httptest.NewRequest("POST", "/run", strings.NewReader(reqBody))
	req.Header.Set("Content-Type", "application/json")
	rr = httptest.NewRecorder()
	
	runHandler(rr, req)
	if rr.Code != http.StatusNotFound {
		t.Errorf("Expected 404, got %d", rr.Code)
	}

	// 3. Invalid JSON
	req = httptest.NewRequest("POST", "/run", strings.NewReader(`{invalid`))
	req.Header.Set("Content-Type", "application/json")
	rr = httptest.NewRecorder()
	
	runHandler(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected 400 for invalid JSON, got %d", rr.Code)
	}

	// 4. Scrub args failure
	reqBody = `{"module": "test-bash", "args": ["-L", "8080:localhost:8080"]}`
	req = httptest.NewRequest("POST", "/run", strings.NewReader(reqBody))
	req.Header.Set("Content-Type", "application/json")
	rr = httptest.NewRecorder()
	
	runHandler(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Errorf("Expected 400 for scrubbed args, got %d", rr.Code)
	}

	// 5. Valid Python module
	reqBody = `{"module": "test-python", "args": []}`
	req = httptest.NewRequest("POST", "/run", strings.NewReader(reqBody))
	req.Header.Set("Content-Type", "application/json")
	rr = httptest.NewRecorder()
	
	runHandler(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected 200 for python, got %d", rr.Code)
	}
	bodyStr = rr.Body.String()
	if !strings.Contains(bodyStr, "hello python") {
		t.Errorf("Expected 'hello python' in SSE output, got %s", bodyStr)
	}
}

// Ensure scrubArgs works correctly
func TestScrubArgs(t *testing.T) {
	tests := []struct{
		args []string
		valid bool
	}{
		{[]string{"-h", "--help"}, true},
		{[]string{"-L", "8080:localhost:80", "user@host"}, false},
		{[]string{"-l=100"}, false}, // lowercase -l tunneling flag
		{[]string{"ssh", "user@host"}, false},
		{[]string{"scp", "file", "host:"}, false},
	}

	for _, tt := range tests {
		err := scrubArgs(tt.args)
		if tt.valid && err != nil {
			t.Errorf("Expected args %v to be valid, got error: %v", tt.args, err)
		} else if !tt.valid && err == nil {
			t.Errorf("Expected args %v to be invalid, got no error", tt.args)
		}
	}
}
