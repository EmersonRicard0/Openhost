package exporter

import (
	"strconv"
	"strings"

	"shellvault/internal/model"
)

// CSVHeader é o mesmo cabeçalho do modelo de importação (FR-329).
const CSVHeader = "nome;endereco;porta;usuario;grupo;chave"

// MarshalCSV gera a planilha em UTF-8 com BOM, separador ";" e fim de linha CRLF, para o
// Excel em pt-BR abrir sem perguntar nada. O grupo usa "/" entre níveis e "chave" fica vazia.
func MarshalCSV(content *model.Content) []byte {
	paths := groupPaths(content.Groups)
	var b strings.Builder
	b.WriteString("\xEF\xBB\xBF" + CSVHeader + "\r\n")
	for _, host := range content.Hosts {
		group := ""
		if host.GroupID != nil {
			group = strings.ReplaceAll(paths[*host.GroupID], " / ", "/")
		}
		fields := []string{host.Label, host.Address, strconv.Itoa(host.Port), host.Username, group, ""}
		for i, field := range fields {
			if i > 0 {
				b.WriteByte(';')
			}
			b.WriteString(csvField(field))
		}
		b.WriteString("\r\n")
	}
	return []byte(b.String())
}

func csvField(v string) string {
	if !strings.ContainsAny(v, ";\"\r\n") && strings.TrimSpace(v) == v {
		return v
	}
	return `"` + strings.ReplaceAll(v, `"`, `""`) + `"`
}
