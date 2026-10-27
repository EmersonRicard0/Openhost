package main

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"strings"
)

func main() {
	generate := flag.Bool("gen", false, "gera update-signing.key e imprime a chave pública")
	sign := flag.String("sign", "", "assina o SHA256SUMS.txt informado")
	flag.Parse()

	var err error
	switch {
	case *generate && *sign == "" && flag.NArg() == 0:
		err = generateKey("update-signing.key", os.Stdout, rand.Reader)
	case !*generate && *sign != "" && flag.NArg() == 0:
		err = signChecksums(*sign, os.Getenv("UPDATE_SIGNING_KEY"))
	default:
		err = errors.New("use exatamente -gen ou -sign <SHA256SUMS.txt>")
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, "sign-sums:", err)
		os.Exit(1)
	}
}

func generateKey(path string, publicOut io.Writer, random io.Reader) error {
	publicKey, privateKey, err := ed25519.GenerateKey(random)
	if err != nil {
		return fmt.Errorf("gerar chave: %w", err)
	}
	privateText := base64.StdEncoding.EncodeToString(privateKey) + "\n"
	file, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600)
	if err != nil {
		return fmt.Errorf("criar chave privada: %w", err)
	}
	if err := file.Chmod(0o600); err != nil {
		_ = file.Close()
		return fmt.Errorf("proteger chave privada: %w", err)
	}
	if _, err := io.WriteString(file, privateText); err != nil {
		_ = file.Close()
		return fmt.Errorf("gravar chave privada: %w", err)
	}
	if err := file.Close(); err != nil {
		return fmt.Errorf("fechar chave privada: %w", err)
	}
	if _, err := fmt.Fprintln(publicOut, base64.StdEncoding.EncodeToString(publicKey)); err != nil {
		return fmt.Errorf("imprimir chave pública: %w", err)
	}
	return nil
}

func signChecksums(sumsPath, privateText string) error {
	privateBytes, err := base64.StdEncoding.DecodeString(strings.TrimSpace(privateText))
	if err != nil {
		return errors.New("UPDATE_SIGNING_KEY não é base64 válido")
	}
	if len(privateBytes) != ed25519.PrivateKeySize {
		return fmt.Errorf("UPDATE_SIGNING_KEY tem %d bytes; esperados %d", len(privateBytes), ed25519.PrivateKeySize)
	}
	sums, err := os.ReadFile(sumsPath)
	if err != nil {
		return fmt.Errorf("ler checksums: %w", err)
	}
	signature := ed25519.Sign(ed25519.PrivateKey(privateBytes), sums)
	signatureText := base64.StdEncoding.EncodeToString(signature) + "\n"
	if err := os.WriteFile(sumsPath+".sig", []byte(signatureText), 0o644); err != nil {
		return fmt.Errorf("gravar assinatura: %w", err)
	}
	return nil
}
