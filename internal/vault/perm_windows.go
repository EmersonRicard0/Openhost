package vault

// restrictFiles: no Windows o diretório do perfil já é só do usuário (ACL herdada de %APPDATA%).
func restrictFiles(string) error { return nil }
