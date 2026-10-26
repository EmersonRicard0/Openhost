package appwin

// restrictDir: no Windows o diretório herda a ACL de %APPDATA%, que já é só do usuário.
func restrictDir(string) error { return nil }
