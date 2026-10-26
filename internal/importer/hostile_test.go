package importer

import (
	"bytes"
	"fmt"
	"math/rand"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"shellvault/internal/apperr"
	"shellvault/internal/model"
)

// Entradas hostis (T047): nenhuma pode causar pânico, travar ou estourar a memória. Cada
// leitor devolve uma prévia ou um erro conhecido da importação.

var importErrors = map[apperr.Code]bool{
	apperr.ImportTooLarge: true, apperr.ImportUnreadable: true, apperr.InvalidInput: true,
}

func TestHostileFilesTooLarge(t *testing.T) {
	dir := t.TempDir()
	// 11 MB de linhas válidas: o limite vale antes de qualquer interpretação.
	line := "Host h\n  HostName 192.0.2.1\n"
	big := bytes.Repeat([]byte(line), 11*1024*1024/len(line)+1)
	for name, load := range hostileLoaders(dir) {
		path := filepath.Join(dir, name+"-grande")
		if err := os.WriteFile(path, big, 0o600); err != nil {
			t.Fatal(err)
		}
		if _, err := load(path); apperr.CodeOf(err) != apperr.ImportTooLarge {
			t.Errorf("%s com 11 MB = %v", name, err)
		}
	}
}

func TestHostileGiantLines(t *testing.T) {
	dir := t.TempDir()
	cases := map[string][]byte{
		// Uma linha de 9 MB, abaixo do limite do arquivo mas acima de qualquer linha real.
		"linha-gigante": []byte("Host " + strings.Repeat("a", 9*1024*1024) + "\n"),
		"aspas-abertas": []byte("nome;endereco\n\"" + strings.Repeat("x;", 2*1024*1024) + "\n"),
		"sem-quebra":    bytes.Repeat([]byte("; "), 4*1024*1024),
	}
	for name, data := range cases {
		path := filepath.Join(dir, name)
		if err := os.WriteFile(path, data, 0o600); err != nil {
			t.Fatal(err)
		}
		for loader, load := range hostileLoaders(dir) {
			before := heapInUse()
			p, err := load(path)
			if err != nil && !importErrors[apperr.CodeOf(err)] {
				t.Errorf("%s via %s: erro inesperado %v", name, loader, err)
			}
			if p != nil {
				p.Zero()
			}
			// Folga generosa: o arquivo tem até 9 MB; a leitura não pode multiplicar isso.
			if grew := heapInUse() - before; grew > 200<<20 {
				t.Errorf("%s via %s: memória cresceu %d MB", name, loader, grew>>20)
			}
		}
	}
}

func TestHostileRandomBytes(t *testing.T) {
	dir := t.TempDir()
	rng := rand.New(rand.NewSource(3003))
	for i := 0; i < 40; i++ {
		data := make([]byte, rng.Intn(64*1024))
		rng.Read(data)
		// Metade dos casos mistura separadores e aspas para chegar mais fundo nos leitores.
		if i%2 == 0 {
			for j := range data {
				switch data[j] % 7 {
				case 0:
					data[j] = ';'
				case 1:
					data[j] = '"'
				case 2:
					data[j] = '\n'
				}
			}
		}
		path := filepath.Join(dir, "aleatorio")
		if err := os.WriteFile(path, data, 0o600); err != nil {
			t.Fatal(err)
		}
		for loader, load := range hostileLoaders(dir) {
			func() {
				defer func() {
					if r := recover(); r != nil {
						t.Fatalf("pânico em %s com entrada %d: %v", loader, i, r)
					}
				}()
				if p, err := load(path); err == nil {
					p.Zero()
				}
			}()
		}
	}
}

func hostileLoaders(home string) map[string]func(string) (*ImportPreview, error) {
	return map[string]func(string) (*ImportPreview, error){
		"csv": func(path string) (*ImportPreview, error) {
			return LoadCSV(path, nil, model.EmptyContent())
		},
		"openssh": func(path string) (*ImportPreview, error) {
			return LoadOpenSSH(path, OpenSSHOptions{HomeDir: home, LocalUser: "local"}, model.EmptyContent())
		},
		"mobaxterm": func(path string) (*ImportPreview, error) {
			return LoadMobaXterm(path, model.EmptyContent())
		},
		"securecrt": func(path string) (*ImportPreview, error) {
			return LoadSecureCRT(path, model.EmptyContent())
		},
	}
}

// XML hostil no SecureCRT (T047): entidades em cascata, entidade externa apontando para um
// arquivo local e aninhamento profundo. Nada pode expandir, ler o arquivo nem estourar a pilha.
func TestHostileSecureCRTXML(t *testing.T) {
	dir := t.TempDir()
	secret := filepath.Join(dir, "segredo.txt")
	if err := os.WriteFile(secret, []byte("NAO-PODE-APARECER"), 0o600); err != nil {
		t.Fatal(err)
	}
	session := `<key name="Sessions"><key name="s"><string name="Protocol Name">SSH2</string>` +
		`<string name="Hostname">%s</string></key></key>`
	laughs := `<?xml version="1.0"?><!DOCTYPE VanDyke [<!ENTITY a "hahahahahahahahahaha">` +
		`<!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;"><!ENTITY c "&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;">` +
		`<!ENTITY d "&c;&c;&c;&c;&c;&c;&c;&c;&c;&c;">]><VanDyke>` + fmt.Sprintf(session, "&d;") + `</VanDyke>`
	external := `<?xml version="1.0"?><!DOCTYPE VanDyke [<!ENTITY x SYSTEM "file:///` +
		filepath.ToSlash(secret) + `">]><VanDyke>` + fmt.Sprintf(session, "&x;") + `</VanDyke>`
	depth := 2_000_000 // 10 MB de <key>: sem limite, a recursão do decodificador estoura a pilha
	deep := "<VanDyke>" + strings.Repeat("<key>", depth) + strings.Repeat("</key>", depth) + "</VanDyke>"
	for name, data := range map[string]string{"entidades": laughs, "externa": external, "profundo": deep} {
		path := filepath.Join(dir, name+".xml")
		if err := os.WriteFile(path, []byte(data), 0o600); err != nil {
			t.Fatal(err)
		}
		p, err := LoadSecureCRT(path, model.EmptyContent())
		if err != nil && !importErrors[apperr.CodeOf(err)] {
			t.Errorf("%s: erro inesperado %v", name, err)
		}
		if p != nil {
			for _, row := range p.View().Rows {
				if strings.Contains(row.Address, "haha") || strings.Contains(row.Address, "NAO-PODE") {
					t.Errorf("%s: entidade expandida no endereço %q", name, row.Address)
				}
			}
			p.Zero()
		}
	}
}

func heapInUse() int64 {
	runtime.GC()
	var m runtime.MemStats
	runtime.ReadMemStats(&m)
	return int64(m.HeapInuse)
}
