package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"testing"
)

func TestRunHandlerMain(t *testing.T) {
	InitSemaphore(10)
	moduleMutex.Lock()
	moduleCache = []ModuleConfig{{ID: "valid_mod", Executable: "echo"}}
	moduleMutex.Unlock()
	
	// Valid POST
	bodyBytes := []byte(`{"module":"valid_mod", "args":["a", "b"]}`)
	req := httptest.NewRequest("POST", "/run", bytes.NewBuffer(bodyBytes))
	w := httptest.NewRecorder()
	runHandler(w, req)
	
	// Invalid Method
	req2 := httptest.NewRequest("GET", "/run", nil)
	w2 := httptest.NewRecorder()
	runHandler(w2, req2)
	
	// Invalid JSON
	req3 := httptest.NewRequest("POST", "/run", bytes.NewBuffer([]byte(`{`)))
	w3 := httptest.NewRecorder()
	runHandler(w3, req3)
}

func TestRunBulkHandlerMain(t *testing.T) {
	InitSemaphore(10)
	moduleMutex.Lock()
	moduleCache = []ModuleConfig{{ID: "valid_mod", Executable: "echo"}}
	moduleMutex.Unlock()
	
	bodyBytes := []byte(`{"executions":[{"id":"1", "module":"valid_mod"}]}`)
	req := httptest.NewRequest("POST", "/run-bulk", bytes.NewBuffer(bodyBytes))
	w := httptest.NewRecorder()
	runBulkHandler(w, req)
	
	// Invalid Method
	req2 := httptest.NewRequest("GET", "/run-bulk", nil)
	w2 := httptest.NewRecorder()
	runBulkHandler(w2, req2)
	
	// Invalid JSON
	req3 := httptest.NewRequest("POST", "/run-bulk", bytes.NewBuffer([]byte(`{`)))
	w3 := httptest.NewRecorder()
	runBulkHandler(w3, req3)
}

func TestPubkeyHandler(t *testing.T) {
	req := httptest.NewRequest("GET", "/pubkey", nil)
	w := httptest.NewRecorder()
	pubkeyHandler(w, req)
	
	req2 := httptest.NewRequest("POST", "/pubkey", nil)
	w2 := httptest.NewRecorder()
	pubkeyHandler(w2, req2)
}

func TestWriteProxychainsConf(t *testing.T) {
	sandboxDir := t.TempDir()
	confPath := sandboxDir + "/proxychains.conf"
	
	writeProxychainsConf(confPath, "socks5://127.0.0.1:9050")

	data, err := os.ReadFile(confPath)
	if err != nil {
		t.Fatalf("Failed to read config: %v", err)
	}

	content := string(data)
	if !bytes.Contains([]byte(content), []byte("socks5 127.0.0.1 9050")) {
		t.Errorf("Config missing proxy details: %s", content)
	}

	// Test auth
	confPathAuth := sandboxDir + "/proxychains_auth.conf"
	writeProxychainsConf(confPathAuth, "http://user:pass@proxy:8080")
	dataAuth, _ := os.ReadFile(confPathAuth)
	if !bytes.Contains(dataAuth, []byte("http proxy 8080 user pass")) {
		t.Errorf("Config missing proxy auth details: %s", string(dataAuth))
	}
}

func TestApplyOSProxy(t *testing.T) {
	cleanup := applyOSProxy("http://localhost:3128")
	cleanup()
}

func TestRunCmdHandler(t *testing.T) {
	payload := &JWTPayload{RunnerID: "test-runner", Action: "admin_approved_cmd"}
	ctx := context.WithValue(context.Background(), jwtPayloadKey, payload)

	// Invalid Method
	req := httptest.NewRequest("GET", "/run-cmd", nil).WithContext(ctx)
	w := httptest.NewRecorder()
	runCmdHandler(w, req)

	// Valid POST
	body := RunCmdRequest{Command: "echo hello"}
	bodyBytes, _ := json.Marshal(body)
	req = httptest.NewRequest("POST", "/run-cmd", bytes.NewBuffer(bodyBytes)).WithContext(ctx)
	w = httptest.NewRecorder()
	
	InitSemaphore(10)
	runCmdHandler(w, req)
	
	// Invalid JSON
	req = httptest.NewRequest("POST", "/run-cmd", bytes.NewBuffer([]byte(`{`))).WithContext(ctx)
	w = httptest.NewRecorder()
	runCmdHandler(w, req)
	
	// Unauthorized
	ctxUnauth := context.WithValue(context.Background(), jwtPayloadKey, &JWTPayload{})
	req = httptest.NewRequest("POST", "/run-cmd", bytes.NewBuffer(bodyBytes)).WithContext(ctxUnauth)
	w = httptest.NewRecorder()
	runCmdHandler(w, req)
}

func TestFilesHandler(t *testing.T) {
	req := httptest.NewRequest("GET", "/files?sandboxId=nonexistent", nil)
	w := httptest.NewRecorder()
	filesHandler(w, req)
	if w.Result().StatusCode != http.StatusNotFound {
		t.Errorf("Expected 404 for missing sandbox, got %d", w.Result().StatusCode)
	}
}

func TestApplyProxy(t *testing.T) {
	proxy := "socks5://127.0.0.1:9050"
	cmd := exec.Command("echo", "test")
	
	cleanup := applyProxy(cmd, proxy)
	if cleanup != nil {
		cleanup()
	}
}

func TestModulesHandler(t *testing.T) {
	req := httptest.NewRequest("GET", "/modules", nil)
	w := httptest.NewRecorder()
	modulesHandler(w, req)
	if w.Result().StatusCode != http.StatusOK {
		t.Errorf("Expected 200 for modules handler, got %d", w.Result().StatusCode)
	}
}

// Removed duplicate TestPubkeyHandler
