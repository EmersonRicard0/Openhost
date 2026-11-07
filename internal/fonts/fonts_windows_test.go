package fonts

import "testing"

func TestListFindsConsolasOnWindows(t *testing.T) {
	items, err := List()
	if err != nil {
		t.Fatal(err)
	}
	for _, item := range items {
		if item.Family == "Consolas" && item.Source == SourceSystem {
			return
		}
	}
	t.Fatal("Consolas não encontrada como fonte do sistema")
}
