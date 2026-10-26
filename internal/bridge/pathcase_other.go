//go:build !windows

package bridge

// pathsIgnoreCase: no Unix, a caixa faz parte do nome (o APFS sem caixa é resolvido por
// os.SameFile quando o arquivo existe).
const pathsIgnoreCase = false
