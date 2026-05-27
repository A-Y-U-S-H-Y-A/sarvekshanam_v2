package main

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"testing"
)

func TestCrypto(t *testing.T) {
	// Initialize crypto
	err := InitCrypto()
	if err != nil {
		t.Fatalf("InitCrypto failed: %v", err)
	}

	pubKeyPEM := GetPublicKeyPEM()
	if pubKeyPEM == "" {
		t.Fatal("Expected public key PEM, got empty")
	}

	// Encrypt a payload with the generated public key
	cryptoMgr.mu.RLock()
	pubKey := &cryptoMgr.privateKey.PublicKey
	cryptoMgr.mu.RUnlock()

	plaintext := "secret-args-for-test"
	ciphertextBytes, err := rsa.EncryptOAEP(sha256.New(), rand.Reader, pubKey, []byte(plaintext), nil)
	if err != nil {
		t.Fatalf("Failed to encrypt: %v", err)
	}
	
	base64Ciphertext := base64.StdEncoding.EncodeToString(ciphertextBytes)

	// DecryptPayload with valid key
	decrypted, err := DecryptPayload(base64Ciphertext)
	if err != nil {
		t.Errorf("DecryptPayload failed: %v", err)
	}
	if decrypted != plaintext {
		t.Errorf("Expected %s, got %s", plaintext, decrypted)
	}

	// DecryptPayload with invalid ciphertext
	_, err = DecryptPayload("invalid-base64")
	if err == nil {
		t.Error("Expected error for invalid base64, got nil")
	}

	// DecryptPayload with wrong key / broken ciphertext
	brokenCiphertext := base64.StdEncoding.EncodeToString([]byte("broken-ciphertext-data"))
	_, err = DecryptPayload(brokenCiphertext)
	if err == nil {
		t.Error("Expected error for broken ciphertext, got nil")
	}
}

func TestCryptoUninitialized(t *testing.T) {
	// Temporarily clear crypto
	cryptoMgr.mu.Lock()
	oldKey := cryptoMgr.privateKey
	oldPEM := cryptoMgr.publicPEM
	cryptoMgr.privateKey = nil
	cryptoMgr.publicPEM = ""
	cryptoMgr.mu.Unlock()

	defer func() {
		cryptoMgr.mu.Lock()
		cryptoMgr.privateKey = oldKey
		cryptoMgr.publicPEM = oldPEM
		cryptoMgr.mu.Unlock()
	}()

	_, err := DecryptPayload("some-data")
	if err == nil || err.Error() != "crypto not initialized" {
		t.Errorf("Expected 'crypto not initialized' error, got %v", err)
	}
}
