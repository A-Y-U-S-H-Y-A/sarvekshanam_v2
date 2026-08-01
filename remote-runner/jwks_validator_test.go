package main

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"
)

func TestJWKSValidator_Lifecycle(t *testing.T) {
	// 1. Generate a test RSA key
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("Failed to generate RSA key: %v", err)
	}
	pubKey := &privateKey.PublicKey

	nBytes := pubKey.N.Bytes()
	eBytes := []byte{1, 0, 1} // 65537

	jwk := JWK{
		Kty: "RSA",
		Kid: "test-key-1",
		Alg: "RS256",
		Use: "sig",
		N:   base64.RawURLEncoding.EncodeToString(nBytes),
		E:   base64.RawURLEncoding.EncodeToString(eBytes),
	}
	jwks := JWKS{Keys: []JWK{jwk}}

	// 2. Start a mock server to serve JWKS
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(jwks)
	}))
	defer server.Close()

	// 3. Create a temp config file
	configPath := "temp_jwks_urls.json"
	configData, _ := json.Marshal(JWKSConfig{URLs: []string{server.URL}})
	os.WriteFile(configPath, configData, 0644)
	defer os.Remove(configPath)

	// 4. Initialize validator
	v := &JWKSValidator{
		keys:       make(map[string]*rsa.PublicKey),
		configPath: configPath,
	}

	err = v.loadConfig()
	if err != nil {
		t.Fatalf("Failed to load config: %v", err)
	}

	v.refreshKeys()

	if !v.HasKeys() {
		t.Fatal("Expected keys to be cached")
	}

	// 5. Test reloading config
	v.ReloadConfig()

	// 6. Test valid JWT validation
	header := JWTHeader{Alg: "RS256", Kid: "test-key-1", Typ: "JWT"}
	payload := JWTPayload{Iss: "sarvekshanam-master", Iat: time.Now().Unix(), Exp: time.Now().Add(1 * time.Hour).Unix(), RunnerID: "123", Action: "run"}

	headerBytes, _ := json.Marshal(header)
	payloadBytes, _ := json.Marshal(payload)

	signingInput := base64.RawURLEncoding.EncodeToString(headerBytes) + "." + base64.RawURLEncoding.EncodeToString(payloadBytes)
	hash := sha256.Sum256([]byte(signingInput))
	signature, _ := rsa.SignPKCS1v15(rand.Reader, privateKey, crypto.SHA256, hash[:])

	token := signingInput + "." + base64.RawURLEncoding.EncodeToString(signature)

	parsedPayload, err := v.ValidateJWT(token)
	if err != nil {
		t.Fatalf("Expected token to be valid, got: %v", err)
	}
	if parsedPayload.RunnerID != "123" {
		t.Errorf("Expected RunnerID '123', got %s", parsedPayload.RunnerID)
	}

	// 7. Test invalid tokens
	_, err = v.ValidateJWT("invalid")
	if err == nil {
		t.Fatal("Expected error for invalid format")
	}
	_, err = v.ValidateJWT(signingInput + ".invalid")
	if err == nil {
		t.Fatal("Expected error for invalid signature format")
	}

	payload.Exp = time.Now().Add(-1 * time.Hour).Unix()
	expiredPayloadBytes, _ := json.Marshal(payload)
	expiredInput := base64.RawURLEncoding.EncodeToString(headerBytes) + "." + base64.RawURLEncoding.EncodeToString(expiredPayloadBytes)
	expiredHash := sha256.Sum256([]byte(expiredInput))
	expiredSig, _ := rsa.SignPKCS1v15(rand.Reader, privateKey, crypto.SHA256, expiredHash[:])
	_, err = v.ValidateJWT(expiredInput + "." + base64.RawURLEncoding.EncodeToString(expiredSig))
	if err == nil || err.Error() != "token expired" {
		t.Errorf("Expected token expired error, got %v", err)
	}
}

func TestJWKSValidator_NoConfig(t *testing.T) {
	v := &JWKSValidator{
		keys:       make(map[string]*rsa.PublicKey),
		configPath: "does_not_exist.json",
	}
	err := v.loadConfig()
	if err != nil {
		t.Errorf("Expected no error when file is missing, got: %v", err)
	}
	if v.HasKeys() {
		t.Error("Should not have keys")
	}
}

func TestFetchJWKS_HTTPError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()

	_, err := fetchJWKS(server.URL)
	if err == nil {
		t.Error("Expected error from 500 status code")
	}
}

func TestJWKSValidator_InitJWKS(t *testing.T) {
	configPath := "jwks_urls.json"
	configData, _ := json.Marshal(JWKSConfig{URLs: []string{}})
	os.WriteFile(configPath, configData, 0644)
	defer os.Remove(configPath)
	
	jwksValidator.configPath = configPath
	err := InitJWKS()
	if err != nil {
		t.Errorf("Expected InitJWKS to succeed, got %v", err)
	}
}
