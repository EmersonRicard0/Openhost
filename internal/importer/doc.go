// Package importer lê hosts, grupos e chaves de outros programas e monta a prévia da importação
// (specs/003-host-import-export). Cada origem fica num arquivo próprio; nada é gravado no cofre
// antes de Commit, e o conteúdo das chaves nunca sai deste pacote para a interface.
package importer
