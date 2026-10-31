package cloudsync

import (
	"encoding/json"
	"math/rand"
	"reflect"
	"testing"
	"time"

	"shellvault/internal/model"
)

const (
	deviceA = "aaaaaaaaaaaaaaaa"
	deviceB = "bbbbbbbbbbbbbbbb"
)

func version(key, value string, vector VersionVector) ItemVersion {
	return ItemVersion{Key: key, VV: vector, Data: json.RawMessage(value)}
}

func tombstone(key string, vector VersionVector, deletedAt time.Time) ItemVersion {
	return ItemVersion{Key: key, VV: vector, Deleted: true, DeletedAt: deletedAt.UTC().Format(time.RFC3339Nano)}
}

func TestMergeTable(t *testing.T) {
	now := time.Date(2026, 10, 27, 12, 0, 0, 0, time.UTC)
	a := version("settings:1", `{"v":"a"}`, VersionVector{deviceA: 1})
	a2 := version("settings:1", `{"v":"a2"}`, VersionVector{deviceA: 2})
	b := version("settings:1", `{"v":"b"}`, VersionVector{deviceB: 1})
	sameRemote := version("settings:1", `{"v":"a"}`, VersionVector{deviceB: 1})
	deleted := tombstone("settings:1", VersionVector{deviceB: 1}, now)
	cases := []struct {
		name          string
		local, remote ItemVersion
		wantData      string
		wantConflict  bool
		wantJoined    bool
	}{
		{"remoto domina", a, a2, `{"v":"a2"}`, false, false},
		{"local domina", a2, a, `{"v":"a2"}`, false, false},
		{"iguais", a, a, `{"v":"a"}`, false, false},
		{"concorrentes iguais", a, sameRemote, `{"v":"a"}`, false, true},
		{"concorrentes diferentes", a, b, `{"v":"a"}`, true, false},
		{"edição e exclusão", a, deleted, `{"v":"a"}`, true, false},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			result, err := Merge([]ItemVersion{test.local}, []ItemVersion{test.remote}, now)
			if err != nil {
				t.Fatal(err)
			}
			if len(result.Items) != 1 || string(result.Items[0].Data) != test.wantData || (len(result.Conflicts) == 1) != test.wantConflict {
				t.Fatalf("resultado = %+v", result)
			}
			if test.wantJoined && (result.Items[0].VV[deviceA] != 1 || result.Items[0].VV[deviceB] != 1) {
				t.Fatalf("vetores não foram unidos: %+v", result.Items[0].VV)
			}
			if test.wantConflict && (!reflect.DeepEqual(result.Conflicts[0].Local, test.local) || !reflect.DeepEqual(result.Conflicts[0].Remote, test.remote)) {
				t.Fatalf("conflito perdeu uma versão: %+v", result.Conflicts[0])
			}
		})
	}
}

func TestMergeExpiresTombstonesAfter180Days(t *testing.T) {
	now := time.Date(2026, 10, 27, 12, 0, 0, 0, time.UTC)
	old := tombstone("host:11111111-2222-4333-8444-555555555555", VersionVector{deviceA: 1}, now.Add(-181*24*time.Hour))
	recent := tombstone("host:22222222-3333-4444-8555-666666666666", VersionVector{deviceA: 1}, now.Add(-179*24*time.Hour))
	result, err := Merge([]ItemVersion{old, recent}, nil, now)
	if err != nil || len(result.Items) != 1 || result.Items[0].Key != recent.Key {
		t.Fatalf("retenção de lápides = %+v, %v", result, err)
	}
}

func TestMergeRepairsDependencies(t *testing.T) {
	now := time.Date(2026, 10, 27, 12, 0, 0, 0, time.UTC)
	groupID := "11111111-2222-4333-8444-555555555555"
	credentialID := "22222222-3333-4444-8555-666666666666"
	hostID := "33333333-4444-4555-8666-777777777777"
	host := model.Host{ID: hostID, Label: "Host", Address: "example.com", Port: 22, Username: "user", AuthMethod: model.AuthPassword, CredentialID: &credentialID, GroupID: &groupID, OSIcon: model.OSIconAuto, CreatedAt: now.Format(time.RFC3339), UpdatedAt: now.Format(time.RFC3339)}
	hostData, _ := json.Marshal(host)
	rule := model.ForwardRule{ID: "44444444-5555-4666-8777-888888888888", HostID: "55555555-6666-4777-8888-999999999999", BindAddress: "127.0.0.1", BindPort: 2200, DestHost: "db.local", DestPort: 5432}
	ruleData, _ := json.Marshal(rule)
	items := []ItemVersion{
		version("host:"+hostID, string(hostData), VersionVector{deviceA: 1}),
		version("forward:"+rule.ID, string(ruleData), VersionVector{deviceA: 1}),
		tombstone("group:"+groupID, VersionVector{deviceA: 2}, now),
		tombstone("credential:"+credentialID, VersionVector{deviceA: 2}, now),
	}
	result, err := Merge(items, nil, now)
	if err != nil {
		t.Fatal(err)
	}
	for _, item := range result.Items {
		if item.Key == "forward:"+rule.ID {
			t.Fatal("regra órfã sobreviveu")
		}
		if item.Key == "host:"+hostID {
			var got model.Host
			if err := json.Unmarshal(item.Data, &got); err != nil {
				t.Fatal(err)
			}
			if got.GroupID != nil || got.CredentialID != nil || got.AuthMethod != model.AuthAsk {
				t.Fatalf("dependências do host não foram reparadas: %+v", got)
			}
		}
	}
}

func TestMergePropertyNoVersionDisappearsWithoutConflict(t *testing.T) {
	random := rand.New(rand.NewSource(67))
	now := time.Date(2026, 10, 27, 12, 0, 0, 0, time.UTC)
	for iteration := 0; iteration < 2000; iteration++ {
		localVector := VersionVector{deviceA: uint64(random.Intn(4) + 1)}
		if count := uint64(random.Intn(4)); count > 0 {
			localVector[deviceB] = count
		}
		local := version("settings:1", `{"side":"local"}`, localVector)
		remoteData := `{"side":"remote"}`
		if random.Intn(2) == 0 {
			remoteData = string(local.Data)
		}
		remoteVector := VersionVector{deviceB: uint64(random.Intn(4) + 1)}
		if count := uint64(random.Intn(4)); count > 0 {
			remoteVector[deviceA] = count
		}
		remote := version("settings:1", remoteData, remoteVector)
		result, err := Merge([]ItemVersion{local}, []ItemVersion{remote}, now)
		if err != nil || len(result.Items) != 1 {
			t.Fatalf("iteração %d: %+v, %v", iteration, result, err)
		}
		merged := result.Items[0]
		if len(result.Conflicts) == 0 {
			if !VectorDominatesOrEquals(merged.VV, local.VV) || !VectorDominatesOrEquals(merged.VV, remote.VV) {
				t.Fatalf("iteração %d perdeu versão sem conflito: local=%v remote=%v merged=%v", iteration, local.VV, remote.VV, merged.VV)
			}
		} else if len(result.Conflicts) != 1 || !reflect.DeepEqual(result.Conflicts[0].Local, local) || !reflect.DeepEqual(result.Conflicts[0].Remote, remote) {
			t.Fatalf("iteração %d não preservou ambos os lados: %+v", iteration, result.Conflicts)
		}
	}
}
