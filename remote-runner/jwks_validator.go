package main

import (
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math/big"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

// JWK represents a single JSON Web Key (RSA public key).
type JWK struct {
	Kty string `json:"kty"`
	Kid string `json:"kid"`
	Alg string `json:"alg"`
	Use string `json:"use"`
	N   string `json:"n"`
	E   string `json:"e"`
}

// JWKS represents a JSON Web Key Set.
type JWKS struct {
	Keys []JWK `json:"keys"`
}

// JWTHeader represents a JWT header.
type JWTHeader struct {
	Alg string `json:"alg"`
	Kid string `json:"kid"`
	Typ string `json:"typ"`
}

// JWTPayload represents the relevant JWT claims.
type JWTPayload struct {
	Iss      string `json:"iss"`
	Iat      int64  `json:"iat"`
	Exp      int64  `json:"exp"`
	RunnerID string `json:"runnerId"`
	Action   string `json:"action"`
}

// JWKSValidator fetches and caches JWKS from configured master URLs,
// and validates RS256-signed JWTs using the cached keys.
type JWKSValidator struct {
	mu        sync.RWMutex
	keys      map[string]*rsa.PublicKey // kid → public key
	urls      []string                 // JWKS endpoint URLs
	configPath string
	lastLoad  time.Time
}

var jwksValidator = &JWKSValidator{
	keys:       make(map[string]*rsa.PublicKey),
	configPath: "jwks_urls.json",
}

// JWKSConfig is the structure of jwks_urls.json.
type JWKSConfig struct {
	URLs []string `json:"urls"`
}

// InitJWKS loads the JWKS URLs config and fetches initial keys.
func InitJWKS() error {
	if err := jwksValidator.loadConfig(); err != nil {
		return err
	}
	// Fetch keys from all configured URLs
	jwksValidator.refreshKeys()

	// Start background refresh every 5 minutes
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			jwksValidator.refreshKeys()
		}
	}()

	return nil
}

// loadConfig reads jwks_urls.json.
func (v *JWKSValidator) loadConfig() error {
	data, err := os.ReadFile(v.configPath)
	if err != nil {
		if os.IsNotExist(err) {
			log.Printf("[JWKS] No %s found — JWKS validation disabled", v.configPath)
			v.mu.Lock()
			v.urls = nil
			v.mu.Unlock()
			return nil
		}
		return fmt.Errorf("failed to read %s: %w", v.configPath, err)
	}

	var cfg JWKSConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return fmt.Errorf("failed to parse %s: %w", v.configPath, err)
	}

	v.mu.Lock()
	v.urls = cfg.URLs
	v.lastLoad = time.Now()
	v.mu.Unlock()

	log.Printf("[JWKS] Loaded %d JWKS URL(s) from %s", len(cfg.URLs), v.configPath)
	return nil
}

// ReloadConfig re-reads the config file (called on file change).
func (v *JWKSValidator) ReloadConfig() {
	if err := v.loadConfig(); err != nil {
		log.Printf("[JWKS] Failed to reload config: %v", err)
		return
	}
	v.refreshKeys()
}

// refreshKeys fetches JWKS from all configured URLs and updates the key cache.
func (v *JWKSValidator) refreshKeys() {
	v.mu.RLock()
	urls := make([]string, len(v.urls))
	copy(urls, v.urls)
	v.mu.RUnlock()

	newKeys := make(map[string]*rsa.PublicKey)

	for _, url := range urls {
		keys, err := fetchJWKS(url)
		if err != nil {
			log.Printf("[JWKS] Failed to fetch from %s: %v", url, err)
			continue
		}
		for kid, key := range keys {
			newKeys[kid] = key
		}
	}

	if len(newKeys) > 0 {
		v.mu.Lock()
		v.keys = newKeys
		v.mu.Unlock()
		log.Printf("[JWKS] Cached %d signing key(s)", len(newKeys))
	}
}

// fetchJWKS fetches a JWKS document from a URL and parses RSA public keys.
func fetchJWKS(url string) (map[string]*rsa.PublicKey, error) {
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	var jwks JWKS
	if err := json.NewDecoder(resp.Body).Decode(&jwks); err != nil {
		return nil, fmt.Errorf("failed to decode JWKS: %w", err)
	}

	keys := make(map[string]*rsa.PublicKey)
	for _, jwk := range jwks.Keys {
		if jwk.Kty != "RSA" || (jwk.Alg != "" && jwk.Alg != "RS256") {
			continue
		}
		pubKey, err := jwkToRSAPublicKey(jwk)
		if err != nil {
			log.Printf("[JWKS] Failed to parse key %s: %v", jwk.Kid, err)
			continue
		}
		keys[jwk.Kid] = pubKey
	}

	return keys, nil
}

// jwkToRSAPublicKey converts a JWK to an *rsa.PublicKey.
func jwkToRSAPublicKey(jwk JWK) (*rsa.PublicKey, error) {
	nBytes, err := base64URLDecode(jwk.N)
	if err != nil {
		return nil, fmt.Errorf("failed to decode N: %w", err)
	}
	eBytes, err := base64URLDecode(jwk.E)
	if err != nil {
		return nil, fmt.Errorf("failed to decode E: %w", err)
	}

	n := new(big.Int).SetBytes(nBytes)
	e := 0
	for _, b := range eBytes {
		e = e<<8 + int(b)
	}

	return &rsa.PublicKey{N: n, E: e}, nil
}

// ValidateJWT validates an RS256-signed JWT against cached JWKS keys.
// Returns the parsed payload on success.
func (v *JWKSValidator) ValidateJWT(tokenStr string) (*JWTPayload, error) {
	parts := strings.Split(tokenStr, ".")
	if len(parts) != 3 {
		return nil, errors.New("invalid JWT format")
	}

	// Decode header
	headerBytes, err := base64URLDecode(parts[0])
	if err != nil {
		return nil, fmt.Errorf("failed to decode header: %w", err)
	}
	var header JWTHeader
	if err := json.Unmarshal(headerBytes, &header); err != nil {
		return nil, fmt.Errorf("failed to parse header: %w", err)
	}
	if header.Alg != "RS256" {
		return nil, fmt.Errorf("unsupported algorithm: %s", header.Alg)
	}

	// Look up signing key by kid
	v.mu.RLock()
	pubKey, ok := v.keys[header.Kid]
	v.mu.RUnlock()
	if !ok {
		return nil, fmt.Errorf("unknown key ID: %s", header.Kid)
	}

	// Verify signature
	signingInput := parts[0] + "." + parts[1]
	signatureBytes, err := base64URLDecode(parts[2])
	if err != nil {
		return nil, fmt.Errorf("failed to decode signature: %w", err)
	}

	hash := sha256.Sum256([]byte(signingInput))
	if err := rsa.VerifyPKCS1v15(pubKey, crypto.SHA256, hash[:], signatureBytes); err != nil {
		return nil, fmt.Errorf("signature verification failed: %w", err)
	}

	// Decode and validate payload
	payloadBytes, err := base64URLDecode(parts[1])
	if err != nil {
		return nil, fmt.Errorf("failed to decode payload: %w", err)
	}
	var payload JWTPayload
	if err := json.Unmarshal(payloadBytes, &payload); err != nil {
		return nil, fmt.Errorf("failed to parse payload: %w", err)
	}

	// Check expiration
	now := time.Now().Unix()
	if payload.Exp > 0 && now > payload.Exp {
		return nil, errors.New("token expired")
	}

	// Check issuer
	if payload.Iss != "sarvekshanam-master" {
		return nil, fmt.Errorf("unexpected issuer: %s", payload.Iss)
	}

	return &payload, nil
}

// HasKeys returns true if at least one JWKS key is cached.
func (v *JWKSValidator) HasKeys() bool {
	v.mu.RLock()
	defer v.mu.RUnlock()
	return len(v.keys) > 0
}

// base64URLDecode decodes base64url-encoded data (no padding).
func base64URLDecode(s string) ([]byte, error) {
	// Add padding if needed
	switch len(s) % 4 {
	case 2:
		s += "=="
	case 3:
		s += "="
	}
	return base64.URLEncoding.DecodeString(s)
}
