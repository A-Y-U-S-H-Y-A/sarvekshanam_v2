package main

import (
	"encoding/json"
	"io/ioutil"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

func setupTestApp() *http.ServeMux {
	// Disable auth for testing
	jwksValidator.mu.Lock()
	jwksValidator.keys = nil
	jwksValidator.mu.Unlock()

	InitSemaphore(3)

	mux := http.NewServeMux()
	mux.HandleFunc("/ping", pingHandler)
	mux.HandleFunc("/modules", authMiddleware(modulesHandler))
	mux.HandleFunc("/modules/schema", authMiddleware(schemaHandler))
	mux.HandleFunc("/run", authMiddleware(runHandler))
	mux.HandleFunc("/run-bulk", authMiddleware(runBulkHandler))
	mux.HandleFunc("/files/", authMiddleware(filesHandler))
	return mux
}

func TestIntegration(t *testing.T) {
	if _, err := os.Stat("modules"); err == nil {
		os.Rename("modules", "modules_backup")
		defer os.Rename("modules_backup", "modules")
	}
	
	os.Mkdir("modules", 0755)
	defer os.RemoveAll("modules")

	mod1 := filepath.Join("modules", "test-mod")
	os.Mkdir(mod1, 0755)
	validJSON := `{ 
		"id": "test-mod", 
		"name": "Test Mod", 
		"language": "node", 
		"executable": "run.js",
		"parameters": [
			{"name": "target", "type": "string", "required": true, "description": "Target URL"}
		]
	}`
	os.WriteFile(filepath.Join(mod1, "module.json"), []byte(validJSON), 0644)
	os.WriteFile(filepath.Join(mod1, "run.js"), []byte("const fs = require('fs');\nconsole.log('Target: ' + process.argv[2]);\nfs.writeFileSync('out.txt', 'data');\n"), 0755)

	refreshModuleCache()

	mux := setupTestApp()
	ts := httptest.NewServer(mux)
	defer ts.Close()

	// 1. GET /ping
	resp, err := http.Get(ts.URL + "/ping")
	if err != nil { t.Fatal(err) }
	defer resp.Body.Close()
	if resp.StatusCode != 200 { t.Errorf("Expected 200 for /ping, got %d", resp.StatusCode) }
	body, _ := ioutil.ReadAll(resp.Body)
	if string(body) != "pong" { t.Errorf("Expected 'pong', got %s", string(body)) }

	// 2. GET /modules
	resp, err = http.Get(ts.URL + "/modules")
	if err != nil { t.Fatal(err) }
	defer resp.Body.Close()
	if resp.StatusCode != 200 { t.Errorf("Expected 200 for /modules, got %d", resp.StatusCode) }
	var mods []ModuleConfig
	json.NewDecoder(resp.Body).Decode(&mods)
	if len(mods) != 1 || mods[0].ID != "test-mod" { t.Errorf("Expected 1 module, got %v", mods) }

	// 3. POST /run valid module
	reqBody := `{"module": "test-mod", "args": ["hello-target"]}`
	resp, err = http.Post(ts.URL+"/run", "application/json", strings.NewReader(reqBody))
	if err != nil { t.Fatal(err) }
	defer resp.Body.Close()
	if resp.StatusCode != 200 { t.Errorf("Expected 200 for /run, got %d", resp.StatusCode) }
	body, _ = ioutil.ReadAll(resp.Body)
	if !strings.Contains(string(body), "hello-target") { t.Errorf("Expected output to contain 'hello-target'") }
	
	// Extract sandbox ID for file test
	var sandboxID string
	lines := strings.Split(string(body), "\n")
	for _, line := range lines {
		if strings.HasPrefix(line, "data: ") {
			var msg SSEMessage
			json.Unmarshal([]byte(strings.TrimPrefix(line, "data: ")), &msg)
			if msg.Type == "done" && msg.SandboxID != "" {
				sandboxID = msg.SandboxID
			}
		}
	}

	// 4. POST /run invalid module
	reqBody = `{"module": "invalid-mod", "args": []}`
	resp, err = http.Post(ts.URL+"/run", "application/json", strings.NewReader(reqBody))
	if err != nil { t.Fatal(err) }
	defer resp.Body.Close()
	if resp.StatusCode != 404 { t.Errorf("Expected 404 for invalid module, got %d", resp.StatusCode) }

	// 5. POST /run-bulk
	reqBody = `{"module": "test-mod", "targets": ["t1", "t2"], "args": []}`
	resp, err = http.Post(ts.URL+"/run-bulk", "application/json", strings.NewReader(reqBody))
	if err != nil { t.Fatal(err) }
	defer resp.Body.Close()
	if resp.StatusCode != 200 { t.Errorf("Expected 200 for /run-bulk, got %d", resp.StatusCode) }
	body, _ = ioutil.ReadAll(resp.Body)
	if !strings.Contains(string(body), "Target: t1") || !strings.Contains(string(body), "Target: t2") {
		t.Errorf("Expected bulk output to contain both targets, got %s", string(body))
	}

	// 6. GET /modules/schema
	resp, err = http.Get(ts.URL + "/modules/schema")
	if err != nil { t.Fatal(err) }
	defer resp.Body.Close()
	if resp.StatusCode != 200 { t.Errorf("Expected 200 for /modules/schema, got %d", resp.StatusCode) }
	var schemas []map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&schemas)
	if len(schemas) != 1 { t.Errorf("Expected 1 schema, got %d", len(schemas)) }

	// 7. GET /files/:id/:name
	if sandboxID != "" {
		resp, err = http.Get(ts.URL + "/files/" + sandboxID + "/out.txt")
		if err != nil { t.Fatal(err) }
		defer resp.Body.Close()
		if resp.StatusCode != 200 { t.Errorf("Expected 200 for file download, got %d", resp.StatusCode) }
		fileBody, _ := ioutil.ReadAll(resp.Body)
		if strings.TrimSpace(string(fileBody)) != "data" { t.Errorf("Expected file body 'data', got '%s'", string(fileBody)) }
	} else {
		t.Errorf("Sandbox ID not found in /run response")
	}

	// 8. Concurrent stress: 10 parallel /run requests with max-concurrent=3 -> verify 3 execute, 7 get 429
	slowMod := filepath.Join("modules", "slow-mod")
	os.Mkdir(slowMod, 0755)
	os.WriteFile(filepath.Join(slowMod, "module.json"), []byte(`{ "id": "slow-mod", "name": "Slow", "language": "node", "executable": "run.js" }`), 0644)
	os.WriteFile(filepath.Join(slowMod, "run.js"), []byte("setTimeout(() => console.log('done'), 1000);\n"), 0755)
	refreshModuleCache()

	var wg sync.WaitGroup
	var mu sync.Mutex
	statusCodes := make(map[int]int)

	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			reqBody := `{"module": "slow-mod", "args": []}`
			resp, err := http.Post(ts.URL+"/run", "application/json", strings.NewReader(reqBody))
			if err != nil {
				return
			}
			defer resp.Body.Close()
			mu.Lock()
			statusCodes[resp.StatusCode]++
			mu.Unlock()
		}()
	}
	wg.Wait()

	if statusCodes[429] == 0 {
		t.Errorf("Expected some 429s in concurrent stress test, got none: %v", statusCodes)
	}
	if statusCodes[200] == 0 {
		t.Errorf("Expected some 200s in concurrent stress test, got none: %v", statusCodes)
	}
	if statusCodes[200] > 3 {
		t.Errorf("Expected max 3 concurrent 200s, got %d", statusCodes[200])
	}
}
