package sshx

import (
	"bytes"
	"context"
	"testing"
	"time"
)

func TestVendorSnifferForwardsAndLimitsOutput(t *testing.T) {
	var output bytes.Buffer
	sniffer := newVendorSniffer(&output, time.Hour)
	input := bytes.Repeat([]byte("x"), maxVendorTextBytes+257)
	if n, err := sniffer.Write(input); err != nil || n != len(input) {
		t.Fatalf("Write = %d, %v", n, err)
	}
	if !bytes.Equal(output.Bytes(), input) {
		t.Fatal("observador alterou a saída repassada")
	}
	got := sniffer.InitialOutput(context.Background())
	if len(got) != maxVendorTextBytes || !bytes.Equal(got, input[:maxVendorTextBytes]) {
		t.Fatalf("trecho capturado = %d bytes", len(got))
	}
	if again := sniffer.InitialOutput(context.Background()); again != nil {
		t.Fatalf("segunda leitura = %d bytes", len(again))
	}
}

func TestVendorSnifferClosesByTimeAndStopsAllocating(t *testing.T) {
	var output bytes.Buffer
	sniffer := newVendorSniffer(&output, 10*time.Millisecond)
	_, _ = sniffer.Write([]byte("JUNOS"))
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if got := string(sniffer.InitialOutput(ctx)); got != "JUNOS" {
		t.Fatalf("trecho = %q", got)
	}
	_, _ = sniffer.Write(bytes.Repeat([]byte("z"), maxVendorTextBytes*2))
	sniffer.mu.Lock()
	defer sniffer.mu.Unlock()
	if len(sniffer.buffer) != 0 || cap(sniffer.buffer) != 0 {
		t.Fatalf("buffer voltou a alocar depois da janela: len=%d cap=%d", len(sniffer.buffer), cap(sniffer.buffer))
	}
}
