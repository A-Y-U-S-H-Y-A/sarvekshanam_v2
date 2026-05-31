package main

import (
	"bufio"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
)

type contextKey string
const jwtPayloadKey contextKey = "jwt_payload"

type ModuleParameter struct {
	Name        string `json:"name"`
	Type        string `json:"type"`
	Required    bool   `json:"required"`
	Description string `json:"description"`
}

type ModuleConfig struct {
	ID                     string            `json:"id"`
	Name                   string            `json:"name"`
	ModuleName             string            `json:"module_name"` // Alias for Name
	Description            string            `json:"description"`
	Entry                  string            `json:"entry"` // Old alias
	Executable             string            `json:"executable"` // Takes precedence over language/entry
	Language               string            `json:"language"`
	BaseExecutionTimeMs    int               `json:"base_execution_time_ms"`
	RequiresStrictApproval bool              `json:"requires_strict_approval"`
	TimePenaltyEstimated   int               `json:"time_penalty_estimated"`
	Parameters             []ModuleParameter `json:"parameters"`
}

type RunRequest struct {
	Module        string   `json:"module"`
	Args          []string `json:"args"`
	EncryptedArgs string   `json:"encrypted_args"`
	ProxyConfig   string   `json:"proxy_config,omitempty"`
}

type RunBulkRequest struct {
	Module        string   `json:"module"`
	Targets       []string `json:"targets"`
	Args          []string `json:"args"`
	EncryptedArgs string   `json:"encrypted_args"`
	ProxyConfig   string   `json:"proxy_config,omitempty"`
}

var (
	port          string
	maxConcurrent int
	globalProxy   string
	moduleCache   []ModuleConfig
	moduleMutex   sync.RWMutex
	proxyMutex    sync.Mutex
)

func init() {
	flag.StringVar(&port, "port", "8080", "Port to run the HTTP server on")
	flag.IntVar(&maxConcurrent, "max-concurrent", 5, "Maximum number of concurrent module executions")
	flag.StringVar(&globalProxy, "proxy", "", "Global proxy for all module executions")
}

// authMiddleware validates JWT tokens via JWKS.
// If no JWKS keys are loaded (e.g. no jwks_urls.json), requests are allowed
// unauthenticated with a warning (development mode).
func authMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Allow ping without auth
		if r.URL.Path == "/ping" {
			next(w, r)
			return
		}

		// If no JWKS keys loaded, try to refresh once
		if !jwksValidator.HasKeys() {
			jwksValidator.refreshKeys()
		}

		// If still no JWKS keys loaded, fail closed (secure)
		if !jwksValidator.HasKeys() {
			http.Error(w, `{"error":"Unauthorized: Server not configured for authentication"}`, http.StatusUnauthorized)
			return
		}

		authHeader := r.Header.Get("Authorization")
		if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
			http.Error(w, `{"error":"Authorization header required"}`, http.StatusUnauthorized)
			return
		}

		token := strings.TrimPrefix(authHeader, "Bearer ")

		// Validate JWT via JWKS
		payload, err := jwksValidator.ValidateJWT(token)
		if err != nil && strings.Contains(err.Error(), "unknown key ID") {
			// Backend might have restarted with new keys. Refresh and try again.
			jwksValidator.refreshKeys()
			payload, err = jwksValidator.ValidateJWT(token)
		}
		if err != nil {
			log.Printf("[Auth] JWT validation failed: %v", err)
			http.Error(w, fmt.Sprintf(`{"error":"Invalid token: %s"}`, err.Error()), http.StatusUnauthorized)
			return
		}

		// Attach payload to request context so handlers can access it
		ctx := r.Context()
		ctx = context.WithValue(ctx, jwtPayloadKey, payload)
		next(w, r.WithContext(ctx))
	}
}

func loadModulesFromDisk() ([]ModuleConfig, error) {
	modules := []ModuleConfig{}
	entries, err := os.ReadDir("modules")
	if err != nil {
		if os.IsNotExist(err) {
			return modules, nil
		}
		return nil, err
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		jsonPath := filepath.Join("modules", entry.Name(), "module.json")
		data, err := os.ReadFile(jsonPath)
		if err != nil {
			// Try manifest.json as well
			jsonPath = filepath.Join("modules", entry.Name(), "manifest.json")
			data, err = os.ReadFile(jsonPath)
			if err != nil {
				continue
			}
		}

		var modConfig ModuleConfig
		if err := json.Unmarshal(data, &modConfig); err != nil {
			log.Printf("Failed to parse %s: %v", jsonPath, err)
			continue
		}
		if modConfig.Name == "" && modConfig.ModuleName != "" {
			modConfig.Name = modConfig.ModuleName
		}
		if modConfig.Entry == "" && modConfig.Executable != "" {
			modConfig.Entry = modConfig.Executable
		}
		modules = append(modules, modConfig)
	}

	return modules, nil
}

func refreshModuleCache() {
	modules, err := loadModulesFromDisk()
	if err != nil {
		log.Printf("[Watcher] Error reloading modules: %v", err)
		return
	}
	moduleMutex.Lock()
	moduleCache = modules
	moduleMutex.Unlock()
}

func getModules() ([]ModuleConfig, error) {
	moduleMutex.RLock()
	defer moduleMutex.RUnlock()
	
	// Create a copy to prevent race conditions on the returned slice
	result := make([]ModuleConfig, len(moduleCache))
	copy(result, moduleCache)
	
	return result, nil
}

func modulesHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	modules, err := getModules()
	if err != nil {
		http.Error(w, "Failed to read modules", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(modules); err != nil { log.Printf("[Modules] Failed to encode response: %v", err) }
}

func schemaHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	modules, err := getModules()
	if err != nil {
		http.Error(w, "Failed to read modules", http.StatusInternalServerError)
		return
	}

	var schemas []map[string]interface{}
	for _, mod := range modules {
		properties := make(map[string]interface{})
		var required []string

		for _, param := range mod.Parameters {
			properties[param.Name] = map[string]string{
				"type":        param.Type,
				"description": param.Description,
			}
			if param.Required {
				required = append(required, param.Name)
			}
		}

		schema := map[string]interface{}{
			"type": "function",
			"function": map[string]interface{}{
				"name":        mod.ID,
				"description": mod.Description,
				"parameters": map[string]interface{}{
					"type":       "object",
					"properties": properties,
					"required":   required,
				},
				"base_execution_time_ms":   mod.BaseExecutionTimeMs,
				"time_penalty_estimated":   mod.TimePenaltyEstimated,
				"requires_strict_approval": mod.RequiresStrictApproval,
			},
		}
		schemas = append(schemas, schema)
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(schemas); err != nil { log.Printf("[Modules] Failed to encode response: %v", err) }
}

func scrubArgs(args []string) error {
	for _, arg := range args {
		// Prevent reverse shell or tunneling flags
		// Match exact flags or prefixes for specific flags
		lower := strings.ToLower(strings.TrimSpace(arg))
		if lower == "-l" || lower == "-r" || lower == "-d" || 
			strings.HasPrefix(lower, "-l=") || strings.HasPrefix(lower, "-r=") || strings.HasPrefix(lower, "-d=") {
			return fmt.Errorf("security violation: forbidden tunneling flag detected: %s", arg)
		}
		
		// Block dangerous commands if they appear as standalone arguments
		if lower == "ssh" || lower == "scp" || lower == "sftp" || lower == "nc" || lower == "netcat" {
			return fmt.Errorf("security violation: forbidden command detected: %s", arg)
		}

		// Prevent null bytes and newlines which might cause execution anomalies
		if strings.ContainsAny(arg, "\x00\n\r") {
			return fmt.Errorf("security violation: invalid characters (null, newline, or carriage return) in argument")
		}
	}
	return nil
}

func runHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if err := AcquireSemaphore(); err != nil {
		http.Error(w, "Too many requests. Runner is at maximum capacity.", http.StatusTooManyRequests)
		return
	}
	defer ReleaseSemaphore()

	var req RunRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON body", http.StatusBadRequest)
		return
	}

	// If args are encrypted, decrypt them
	if req.EncryptedArgs != "" && len(req.Args) == 0 {
		decrypted, err := DecryptPayload(req.EncryptedArgs)
		if err != nil {
			log.Printf("Failed to decrypt args: %v", err)
			http.Error(w, "Failed to decrypt payload", http.StatusBadRequest)
			return
		}
		if err := json.Unmarshal([]byte(decrypted), &req.Args); err != nil {
			log.Printf("Failed to parse decrypted args: %v", err)
			http.Error(w, "Invalid decrypted payload", http.StatusBadRequest)
			return
		}
	}

	if err := scrubArgs(req.Args); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	modules, err := getModules()
	if err != nil {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	var targetMod *ModuleConfig
	var moduleDir string
	for _, mod := range modules {
		if mod.ID == req.Module {
			targetMod = &mod
			moduleDir = filepath.Join("modules", mod.ID)
			break
		}
	}

	if targetMod == nil {
		http.Error(w, "Module not found", http.StatusNotFound)
		return
	}

	sandbox, err := CreateSandbox(moduleDir)
	if err != nil {
		http.Error(w, "Failed to create sandbox: "+err.Error(), http.StatusInternalServerError)
		return
	}
	// Schedule cleanup after 60 minutes
	time.AfterFunc(60*time.Minute, func() { sandbox.Cleanup() })

	entryFile := targetMod.Executable
	if entryFile == "" {
		entryFile = targetMod.Entry
	}

	cleanEntryPath := filepath.Clean(filepath.Join(sandbox.Path, entryFile))
	rel, err := filepath.Rel(sandbox.Path, cleanEntryPath)
	if err != nil || strings.HasPrefix(rel, "..") || rel == ".." {
		http.Error(w, "Path traversal attempt detected in module entry", http.StatusBadRequest)
		return
	}
	entryPath := cleanEntryPath
	
	// Determine language executable
	langExec := "python"
	
	flusher, ok := w.(http.Flusher)
	if !ok {
		log.Printf("[Warning] ResponseWriter does not implement http.Flusher")
	}

	if targetMod.Language != "" {
		switch strings.ToLower(targetMod.Language) {
		case "python", "python3":
			langExec = "python"
		case "node", "javascript", "js":
			langExec = "node"
		case "bash", "sh":
			langExec = "bash"
			cmdArgs := append([]string{"--", entryPath}, req.Args...)
			cmd := exec.Command(langExec, cmdArgs...)
			cmd.Dir = sandbox.Path
			executeCmd(w, flusher, cmd, sandbox, targetMod, req.ProxyConfig)
			return
		case "go":
			langExec = "go"
			cmdArgs := append([]string{"run", entryPath}, req.Args...)
			// codeql[go/command-injection] Intentional: Remote runner executes modules with user-provided arguments safely via slice.
			cmd := exec.Command(langExec, cmdArgs...)
			cmd.Dir = sandbox.Path
			executeCmd(w, flusher, cmd, sandbox, targetMod, req.ProxyConfig)
			return
		case "binary":
			// Execute the file directly
			// codeql[go/command-injection] Intentional: Remote runner executes modules with user-provided arguments safely via slice.
			cmd := exec.Command(entryPath, req.Args...)
			cmd.Dir = sandbox.Path
			executeCmd(w, flusher, cmd, sandbox, targetMod, req.ProxyConfig)
			return
		}
	} else if targetMod.Executable != "" {
		// Use Executable directly if language is not set
		// codeql[go/command-injection] Intentional: Remote runner executes modules with user-provided arguments safely via slice.
		cmd := exec.Command(entryPath, req.Args...)
		cmd.Dir = sandbox.Path
		executeCmd(w, flusher, cmd, sandbox, targetMod, req.ProxyConfig)
		return
	}

	cmdArgs := append([]string{entryPath}, req.Args...)
	// codeql[go/command-injection] Intentional: Remote runner executes modules with user-provided arguments safely via slice.
	cmd := exec.Command(langExec, cmdArgs...)
	cmd.Dir = sandbox.Path

	executeCmd(w, flusher, cmd, sandbox, targetMod, req.ProxyConfig)
}

func writeProxychainsConf(path, proxy string) {
	scheme := "http"
	if idx := strings.Index(proxy, "://"); idx != -1 {
		scheme = proxy[:idx]
		proxy = proxy[idx+3:]
	}
	auth := ""
	if idx := strings.Index(proxy, "@"); idx != -1 {
		auth = proxy[:idx]
		proxy = proxy[idx+1:]
		authParts := strings.SplitN(auth, ":", 2)
		if len(authParts) == 2 {
			auth = authParts[0] + " " + authParts[1]
		} else {
			auth = authParts[0] + " "
		}
	}
	host := proxy
	port := "80"
	if idx := strings.LastIndex(proxy, ":"); idx != -1 {
		host = proxy[:idx]
		port = proxy[idx+1:]
	}
	if scheme == "socks5h" {
		scheme = "socks5"
	}
	conf := fmt.Sprintf("strict_chain\nproxy_dns\nremote_dns_subnet 224\ntcp_read_time_out 15000\ntcp_connect_time_out 8000\n[ProxyList]\n%s %s %s %s\n", scheme, host, port, auth)
	os.WriteFile(path, []byte(conf), 0644)
}

func applyProxy(cmd *exec.Cmd, proxy string) func() {
	if proxy == "" {
		proxy = globalProxy
	}
	if proxy == "" {
		return func() {}
	}
	
	// Tier 1: Environment variables
	cmd.Env = append(os.Environ(), 
		"HTTP_PROXY="+proxy,
		"HTTPS_PROXY="+proxy,
		"http_proxy="+proxy,
		"https_proxy="+proxy,
	)

	// Tier 2: proxychains4 (OS-level routing)
	// If proxychains4 is available, we prepend it to the command.
	if pcPath, err := exec.LookPath("proxychains4"); err == nil {
		confPath := filepath.Join(cmd.Dir, "proxychains.conf")
		writeProxychainsConf(confPath, proxy)
		newArgs := append([]string{pcPath, "-q", "-f", confPath}, cmd.Args...)
		cmd.Path = pcPath
		cmd.Args = newArgs
		return func() {} // No global cleanup needed
	} else if pcPath, err := exec.LookPath("proxychains"); err == nil {
		confPath := filepath.Join(cmd.Dir, "proxychains.conf")
		writeProxychainsConf(confPath, proxy)
		newArgs := append([]string{pcPath, "-q", "-f", confPath}, cmd.Args...)
		cmd.Path = pcPath
		cmd.Args = newArgs
		return func() {} // No global cleanup needed
	}

	// Tier 2 Fallback: Windows Registry / macOS networksetup
	return applyOSProxy(proxy)
}

func applyOSProxy(proxy string) func() {
	proxyMutex.Lock()
	
	// Default cleanup just unlocks
	cleanup := func() {
		proxyMutex.Unlock()
	}

	if runtime.GOOS == "windows" {
		if err := exec.Command("reg", "add", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings", "/v", "ProxyEnable", "/t", "REG_DWORD", "/d", "1", "/f").Run(); err != nil { log.Printf("[Proxy] %v", err) }
		if err := exec.Command("reg", "add", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings", "/v", "ProxyServer", "/t", "REG_SZ", "/d", proxy, "/f").Run(); err != nil { log.Printf("[Proxy] %v", err) }
		
		cleanup = func() {
			if err := exec.Command("reg", "add", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings", "/v", "ProxyEnable", "/t", "REG_DWORD", "/d", "0", "/f").Run(); err != nil { log.Printf("[Proxy] %v", err) }
			proxyMutex.Unlock()
		}
	} else if runtime.GOOS == "darwin" {
		if err := exec.Command("networksetup", "-setwebproxy", "Wi-Fi", proxy, "8080").Run(); err != nil { log.Printf("[Proxy] %v", err) }
		if err := exec.Command("networksetup", "-setsecurewebproxy", "Wi-Fi", proxy, "8080").Run(); err != nil { log.Printf("[Proxy] %v", err) }
		
		cleanup = func() {
			if err := exec.Command("networksetup", "-setwebproxystate", "Wi-Fi", "off").Run(); err != nil { log.Printf("[Proxy] %v", err) }
			if err := exec.Command("networksetup", "-setsecurewebproxystate", "Wi-Fi", "off").Run(); err != nil { log.Printf("[Proxy] %v", err) }
			proxyMutex.Unlock()
		}
	}

	return cleanup
}

func executeCmd(w http.ResponseWriter, flusher http.Flusher, cmd *exec.Cmd, sandbox *Sandbox, targetMod *ModuleConfig, proxy string) {
	cleanup := applyProxy(cmd, proxy)
	defer cleanup()
	
	stdoutPipe, err := cmd.StdoutPipe()
	if err != nil {
		http.Error(w, "Failed to create stdout pipe", http.StatusInternalServerError)
		return
	}
	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		http.Error(w, "Failed to create stderr pipe", http.StatusInternalServerError)
		return
	}

	WriteSSEHeaders(w)

	if err := cmd.Start(); err != nil {
		SendSSE(w, flusher, SSEMessage{Type: "error", Error: err.Error()})
		return
	}

	var wg sync.WaitGroup
	wg.Add(2)

	go func() {
		defer wg.Done()
		scanner := bufio.NewScanner(stdoutPipe)
		for scanner.Scan() {
			SendSSE(w, flusher, SSEMessage{Type: "stdout", Line: scanner.Text()})
		}
	}()

	go func() {
		defer wg.Done()
		scanner := bufio.NewScanner(stderrPipe)
		for scanner.Scan() {
			SendSSE(w, flusher, SSEMessage{Type: "stderr", Line: scanner.Text()})
		}
	}()

	wg.Wait()
	err = cmd.Wait()

	exitCode := 0
	if err != nil {
		if exitError, ok := err.(*exec.ExitError); ok {
			exitCode = exitError.ExitCode()
		} else {
			exitCode = 1
			SendSSE(w, flusher, SSEMessage{Type: "error", Error: err.Error()})
		}
	}

	files := sandbox.DetectGeneratedFiles()
	SendSSE(w, flusher, SSEMessage{Type: "done", ExitCode: &exitCode, Files: files, SandboxID: sandbox.ID})
}

func runBulkHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if err := AcquireSemaphore(); err != nil {
		http.Error(w, "Too many requests. Runner is at maximum capacity.", http.StatusTooManyRequests)
		return
	}
	defer ReleaseSemaphore()

	var req RunBulkRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON body", http.StatusBadRequest)
		return
	}

	if req.EncryptedArgs != "" && len(req.Args) == 0 {
		decrypted, err := DecryptPayload(req.EncryptedArgs)
		if err != nil {
			http.Error(w, "Failed to decrypt payload", http.StatusBadRequest)
			return
		}
		if err := json.Unmarshal([]byte(decrypted), &req.Args); err != nil {
			http.Error(w, "Invalid decrypted payload", http.StatusBadRequest)
			return
		}
	}

	if err := scrubArgs(req.Args); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	modules, err := getModules()
	if err != nil {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	var targetMod *ModuleConfig
	var moduleDir string
	for _, mod := range modules {
		if mod.ID == req.Module {
			targetMod = &mod
			moduleDir = filepath.Join("modules", mod.ID)
			break
		}
	}

	if targetMod == nil {
		http.Error(w, "Module not found", http.StatusNotFound)
		return
	}

	WriteSSEHeaders(w)
	flusher, ok := w.(http.Flusher)
	if !ok {
		log.Printf("[Warning] ResponseWriter does not implement http.Flusher")
	}

	sandbox, err := CreateSandbox(moduleDir)
	if err != nil {
		http.Error(w, "Failed to create sandbox: "+err.Error(), http.StatusInternalServerError)
		return
	}
	// Schedule cleanup after 60 minutes
	time.AfterFunc(60*time.Minute, func() { sandbox.Cleanup() })

	entryFile := targetMod.Executable
	if entryFile == "" {
		entryFile = targetMod.Entry
	}

	cleanEntryPath := filepath.Clean(filepath.Join(sandbox.Path, entryFile))
	rel, err := filepath.Rel(sandbox.Path, cleanEntryPath)
	if err != nil || strings.HasPrefix(rel, "..") || rel == ".." {
		http.Error(w, "Path traversal attempt detected in module entry", http.StatusBadRequest)
		return
	}
	entryPath := cleanEntryPath

	for _, target := range req.Targets {
		func(target string) {
			var cmd *exec.Cmd
			
			// Determine language executable
			langExec := "python"
			if targetMod.Language != "" {
				switch strings.ToLower(targetMod.Language) {
				case "python", "python3":
					langExec = "python"
				case "node", "javascript", "js":
					langExec = "node"
				case "bash", "sh":
					langExec = "bash"
					cmdArgs := append([]string{"--", entryPath}, req.Args...)
					cmdArgs = append(cmdArgs, target)
					cmd = exec.Command(langExec, cmdArgs...)
				case "go":
					langExec = "go"
					cmdArgs := append([]string{"run", entryPath}, req.Args...)
					cmdArgs = append(cmdArgs, target)
					// codeql[go/command-injection] Intentional: Arguments are safely passed as slice elements
					cmd = exec.Command(langExec, cmdArgs...)
				case "binary":
					cmdArgs := append([]string{}, req.Args...)
					cmdArgs = append(cmdArgs, target)
					// codeql[go/command-injection] Intentional: Arguments are safely passed as slice elements
					cmd = exec.Command(entryPath, cmdArgs...)
				}
			} else if targetMod.Executable != "" {
				cmdArgs := append([]string{}, req.Args...)
				cmdArgs = append(cmdArgs, target)
				cmd = exec.Command(entryPath, cmdArgs...)
			}

			if cmd == nil {
				cmdArgs := append([]string{entryPath}, req.Args...)
				cmdArgs = append(cmdArgs, target)
				// codeql[go/command-injection] Intentional: Arguments are safely passed as slice elements
				cmd = exec.Command(langExec, cmdArgs...)
			}
			
			cmd.Dir = sandbox.Path
			cleanup := applyProxy(cmd, req.ProxyConfig)
			defer cleanup()

			stdoutPipe, err := cmd.StdoutPipe()
			if err != nil {
				SendSSE(w, flusher, SSEMessage{Type: "error", Target: target, Error: "Failed to create stdout pipe: " + err.Error()})
				return
			}
			stderrPipe, err := cmd.StderrPipe()
			if err != nil {
				SendSSE(w, flusher, SSEMessage{Type: "error", Target: target, Error: "Failed to create stderr pipe: " + err.Error()})
				return
			}

			if err := cmd.Start(); err != nil {
				SendSSE(w, flusher, SSEMessage{Type: "error", Target: target, Error: err.Error()})
				return
			}

			var wg sync.WaitGroup
			wg.Add(2)

			go func(t string) {
				defer wg.Done()
				scanner := bufio.NewScanner(stdoutPipe)
				for scanner.Scan() {
					SendSSE(w, flusher, SSEMessage{Type: "stdout", Target: t, Line: scanner.Text()})
				}
			}(target)

			go func(t string) {
				defer wg.Done()
				scanner := bufio.NewScanner(stderrPipe)
				for scanner.Scan() {
					SendSSE(w, flusher, SSEMessage{Type: "stderr", Target: t, Line: scanner.Text()})
				}
			}(target)

			wg.Wait()
			err = cmd.Wait()

			exitCode := 0
			if err != nil {
				if exitError, ok := err.(*exec.ExitError); ok {
					exitCode = exitError.ExitCode()
				} else {
					exitCode = 1
					SendSSE(w, flusher, SSEMessage{Type: "error", Target: target, Error: err.Error()})
				}
			}

			files := sandbox.DetectGeneratedFiles()
			SendSSE(w, flusher, SSEMessage{Type: "done", Target: target, ExitCode: &exitCode, Files: files, SandboxID: sandbox.ID})
		}(target)
	}
}

type RunCmdRequest struct {
	Command string `json:"command"`
}

func runCmdHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	payload, ok := r.Context().Value(jwtPayloadKey).(*JWTPayload)
	if !ok || payload == nil {
		// If JWKS is not configured, we might not have a payload, but for this secure endpoint we MUST enforce it.
		if !jwksValidator.HasKeys() {
			http.Error(w, "Server not configured for secure admin commands", http.StatusForbidden)
			return
		}
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if payload.Action != "admin_approved_cmd" {
		http.Error(w, "Forbidden: Action not approved", http.StatusForbidden)
		return
	}

	var req RunCmdRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON body", http.StatusBadRequest)
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		log.Printf("[Warning] ResponseWriter does not implement http.Flusher")
	}
	WriteSSEHeaders(w)

	// codeql[go/command-injection] Intentional: Admin-only command execution endpoint, validated via JWT payload
	cmd := exec.Command("cmd", "/c", req.Command)
	if runtime.GOOS != "windows" {
		// codeql[go/command-injection] Intentional: Admin-only command execution endpoint, validated via JWT payload
		cmd = exec.Command("bash", "-c", req.Command)
	}

	stdoutPipe, err := cmd.StdoutPipe()
	if err != nil {
		SendSSE(w, flusher, SSEMessage{Type: "error", Error: "Failed to create stdout pipe: " + err.Error()})
		return
	}
	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		SendSSE(w, flusher, SSEMessage{Type: "error", Error: "Failed to create stderr pipe: " + err.Error()})
		return
	}

	if err := cmd.Start(); err != nil {
		SendSSE(w, flusher, SSEMessage{Type: "error", Error: err.Error()})
		return
	}

	var wg sync.WaitGroup
	wg.Add(2)

	go func() {
		defer wg.Done()
		scanner := bufio.NewScanner(stdoutPipe)
		for scanner.Scan() {
			SendSSE(w, flusher, SSEMessage{Type: "stdout", Line: scanner.Text()})
		}
	}()

	go func() {
		defer wg.Done()
		scanner := bufio.NewScanner(stderrPipe)
		for scanner.Scan() {
			SendSSE(w, flusher, SSEMessage{Type: "stderr", Line: scanner.Text()})
		}
	}()

	wg.Wait()
	err = cmd.Wait()

	exitCode := 0
	if err != nil {
		if exitError, ok := err.(*exec.ExitError); ok {
			exitCode = exitError.ExitCode()
		} else {
			exitCode = 1
			SendSSE(w, flusher, SSEMessage{Type: "error", Error: err.Error()})
		}
	}

	SendSSE(w, flusher, SSEMessage{Type: "done", ExitCode: &exitCode})
}

func pingHandler(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("pong"))
}

// pubkeyHandler returns the PEM-encoded public key for this slave.
func pubkeyHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	pem := GetPublicKeyPEM()
	if pem == "" {
		http.Error(w, "Crypto not initialized", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/x-pem-file")
	w.Write([]byte(pem))
}

func filesHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/files/"), "/")
	if len(parts) != 2 {
		http.Error(w, "Invalid path format. Expected /files/:sandboxId/:filename", http.StatusBadRequest)
		return
	}
	sandboxID := parts[0]
	filename := parts[1]

	// Explicitly block backslashes which could bypass the '/' split on Windows
	if strings.Contains(filename, "\\") {
		http.Error(w, "Invalid filename format", http.StatusBadRequest)
		return
	}

	sandbox := GetSandbox(sandboxID)
	if sandbox == nil {
		http.Error(w, "Sandbox not found or expired", http.StatusNotFound)
		return
	}

	filePath := filepath.Join(sandbox.Path, filename)
	cleanPath := filepath.Clean(filePath)
	
	// Secure path traversal check: verify the resolved path is strictly within the sandbox directory
	rel, err := filepath.Rel(sandbox.Path, cleanPath)
	if err != nil || strings.HasPrefix(rel, "..") || rel == ".." {
		http.Error(w, "Path traversal attempt detected", http.StatusBadRequest)
		return
	}

	http.ServeFile(w, r, cleanPath)
}

func main() {
	flag.Parse()

	// Initialize concurrency semaphore
	InitSemaphore(maxConcurrent)

	// Clean up any orphaned sandboxes from a previous crash
	RecoverState()

	// Initialize RSA keypair for asymmetric encryption
	if err := InitCrypto(); err != nil {
		log.Printf("WARNING: Crypto init failed: %v (encrypted payloads won't work)", err)
	} else {
		log.Println("RSA-2048 keypair generated for asymmetric encryption")
	}

	// Initialize JWKS validator (fetches master signing keys)
	if err := InitJWKS(); err != nil {
		log.Printf("WARNING: JWKS init failed: %v (JWT auth won't work)", err)
	}

	// Initial module load
	refreshModuleCache()

	// Watch jwks_urls.json for hot-reload
	WatchConfig("jwks_urls.json", func() {
		jwksValidator.ReloadConfig()
	})

	// Watch modules directory for hot-reload
	WatchDirectory("modules", func(event, filename string) {
		log.Printf("[Watcher] Detected %s on %s - refreshing modules", event, filename)
		refreshModuleCache()
	})

	http.HandleFunc("/ping", pingHandler) // Auth skipped by middleware
	http.HandleFunc("/modules", authMiddleware(modulesHandler))
	http.HandleFunc("/modules/schema", authMiddleware(schemaHandler))
	http.HandleFunc("/run", authMiddleware(runHandler))
	http.HandleFunc("/run-bulk", authMiddleware(runBulkHandler))
	http.HandleFunc("/run-cmd", authMiddleware(runCmdHandler))
	http.HandleFunc("/files/", authMiddleware(filesHandler))
	http.HandleFunc("/pubkey", authMiddleware(pubkeyHandler))

	addr := fmt.Sprintf(":%s", port)
	log.Printf("Starting remote runner on %s", addr)
	if err := http.ListenAndServe(addr, nil); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
