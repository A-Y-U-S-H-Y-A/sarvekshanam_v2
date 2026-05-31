package main

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"fmt"
	"sync"
)

// CryptoManager handles RSA keypair generation and payload decryption.
// The keypair is generated once on startup and kept in memory only.
type CryptoManager struct {
	mu         sync.RWMutex
	privateKey *rsa.PrivateKey
	publicPEM  string
}

var cryptoMgr = &CryptoManager{}

// InitCrypto generates an RSA-2048 keypair on startup.
func InitCrypto() error {
	privKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return fmt.Errorf("failed to generate RSA keypair: %w", err)
	}

	pubKeyBytes, err := x509.MarshalPKIXPublicKey(&privKey.PublicKey)
	if err != nil {
		return fmt.Errorf("failed to marshal public key: %w", err)
	}

	pubPEM := pem.EncodeToMemory(&pem.Block{
		Type:  "PUBLIC KEY",
		Bytes: pubKeyBytes,
	})

	cryptoMgr.mu.Lock()
	defer cryptoMgr.mu.Unlock()

	cryptoMgr.privateKey = privKey
	cryptoMgr.publicPEM = string(pubPEM)

	return nil
}

// GetPublicKeyPEM returns the PEM-encoded public key for the /pubkey endpoint.
func GetPublicKeyPEM() string {
	cryptoMgr.mu.RLock()
	defer cryptoMgr.mu.RUnlock()
	return cryptoMgr.publicPEM
}

// DecryptPayload decrypts a Base64-encoded ciphertext that was encrypted
// with our public key using RSA-OAEP with SHA-256.
func DecryptPayload(base64Ciphertext string) (string, error) {
	if len(base64Ciphertext) > 512 {
		return "", fmt.Errorf("ciphertext too large")
	}

	cryptoMgr.mu.RLock()
	privKey := cryptoMgr.privateKey
	cryptoMgr.mu.RUnlock()

	if privKey == nil {
		return "", fmt.Errorf("crypto not initialized")
	}

	ciphertext, err := base64.StdEncoding.DecodeString(base64Ciphertext)
	if err != nil {
		return "", fmt.Errorf("failed to decode base64: %w", err)
	}

	plaintext, err := rsa.DecryptOAEP(sha256.New(), rand.Reader, privKey, ciphertext, nil)
	if err != nil {
		return "", fmt.Errorf("decryption failed: %w", err)
	}

	return string(plaintext), nil
}
