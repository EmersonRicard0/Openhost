package sshx

import (
	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/agent"

	"shellvault/internal/apperr"
	"shellvault/internal/model"
	"shellvault/internal/session"
)

type authState struct {
	o  Options
	ix session.Interactor
	dl deadline
	// failure guarda o motivo real (prompt cancelado, agent ausente), que prevalece sobre o
	// "unable to authenticate" genérico.
	failure error
	// usedPassword: a senha guardada já respondeu um prompt keyboard-interactive.
	usedPassword bool
}

// methods monta os métodos na ordem da 001: o da credencial primeiro, keyboard-interactive
// como alternativa.
func (a *authState) methods() ([]ssh.AuthMethod, func(), error) {
	noop := func() {}
	kbd := ssh.KeyboardInteractive(a.keyboardInteractive)
	switch a.o.Auth.Method {
	case model.AuthPassword:
		return []ssh.AuthMethod{ssh.Password(a.o.Auth.Password), kbd}, noop, nil
	case model.AuthKey:
		signer, err := a.keySigner()
		if err != nil {
			return nil, noop, err
		}
		return []ssh.AuthMethod{ssh.PublicKeys(signer), kbd}, noop, nil
	case model.AuthAgent:
		open := a.o.Agent
		if open == nil {
			open = openSystemAgent
		}
		conn, err := open()
		if err != nil {
			return nil, noop, apperr.New(apperr.AgentUnavailable)
		}
		ag := agent.NewClient(conn)
		signers := func() ([]ssh.Signer, error) {
			list, err := ag.Signers()
			if err != nil {
				a.failure = apperr.New(apperr.AgentUnavailable)
				return nil, err
			}
			for i, s := range list {
				list[i] = a.restrict(s)
			}
			return list, nil
		}
		return []ssh.AuthMethod{ssh.PublicKeysCallback(signers), kbd}, func() { _ = conn.Close() }, nil
	case model.AuthAsk:
		if a.o.AgentFirst {
			open := a.o.Agent
			if open == nil {
				open = openSystemAgent
			}
			if conn, err := open(); err == nil {
				ag := agent.NewClient(conn)
				signers := func() ([]ssh.Signer, error) {
					list, err := ag.Signers()
					if err != nil {
						// O agent é opcional na conexão rápida; uma falha dele ainda deve
						// permitir o método de senha que vem em seguida.
						return []ssh.Signer{}, nil
					}
					for i, signer := range list {
						list[i] = a.restrict(signer)
					}
					return list, nil
				}
				return []ssh.AuthMethod{ssh.PublicKeysCallback(signers), kbd, ssh.PasswordCallback(a.askPassword)}, func() { _ = conn.Close() }, nil
			}
		}
		return []ssh.AuthMethod{kbd, ssh.PasswordCallback(a.askPassword)}, noop, nil
	}
	return nil, noop, apperr.New(apperr.InvalidInput)
}

func (a *authState) keySigner() (ssh.Signer, error) {
	raw := []byte(a.o.Auth.PrivateKey)
	var signer ssh.Signer
	var err error
	if a.o.Auth.Passphrase != nil {
		signer, err = ssh.ParsePrivateKeyWithPassphrase(raw, []byte(*a.o.Auth.Passphrase))
	} else {
		signer, err = ssh.ParsePrivateKey(raw)
	}
	if err != nil {
		return nil, apperr.New(apperr.KeyUnsupported)
	}
	return a.restrict(signer), nil
}

// restrict tira a assinatura ssh-rsa (SHA-1) das chaves RSA, a não ser em hosts legados.
func (a *authState) restrict(s ssh.Signer) ssh.Signer {
	as, ok := s.(ssh.AlgorithmSigner)
	if !ok || s.PublicKey().Type() != ssh.KeyAlgoRSA {
		return s
	}
	r, err := ssh.NewSignerWithAlgorithms(as, algorithmsFor(ssh.KeyAlgoRSA, a.o.LegacyAlgorithms))
	if err != nil {
		return s
	}
	return r
}
