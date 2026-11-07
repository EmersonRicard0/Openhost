// Barra de conexão rápida com sugestões de hosts salvos (specs/010, US1 e US3).
import { useMemo, useState } from 'react';
import type { HostView, QuickTarget } from '@shared/model/types';
import { t } from '../../i18n/pt-BR';
import { useHosts } from '../../stores/hosts';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { SearchIcon } from '../../ui/icons';
import { hostOs } from '../../ui/osIcons';
import { TextField } from '../../ui/TextField';
import { connectHost, connectQuick } from '../hosts/connect';
import { buildIndex, filterHosts, normalize } from '../hosts/search';
import { parseTarget, targetLabel, type ParsedTarget } from './quickTarget';
import s from './home.module.css';

const MAX_SUGGESTIONS = 6;
export const QUICK_INPUT_ID = 'quick-connect-input';

/** Host salvo com o mesmo destino (FR-1005). */
function savedMatch(hosts: readonly HostView[], target: ParsedTarget): HostView | undefined {
  const address = normalize(target.address);
  return hosts.find(
    (h) =>
      normalize(h.address) === address &&
      h.port === target.port &&
      (target.username === null || h.username === target.username),
  );
}

export function QuickConnectBar() {
  const hosts = useHosts((h) => h.hosts);
  const index = useMemo(() => buildIndex(hosts), [hosts]);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [askUser, setAskUser] = useState<ParsedTarget | null>(null);
  const suggestions = text.trim() ? filterHosts(index, text).slice(0, MAX_SUGGESTIONS) : [];
  const showList = open && suggestions.length > 0;

  function reset() {
    setText('');
    setOpen(false);
    setHighlight(-1);
  }

  function submit() {
    const chosen = showList ? suggestions[highlight] : undefined;
    if (chosen) {
      reset();
      void connectHost(chosen);
      return;
    }
    const parsed = parseTarget(text);
    if ('error' in parsed) {
      setError(t.home.targetErrors[parsed.error]);
      return;
    }
    const saved = savedMatch(hosts, parsed);
    reset();
    if (saved) void connectHost(saved);
    else if (parsed.username === null) setAskUser(parsed);
    else void connectQuick({ ...parsed, username: parsed.username });
  }

  const listId = `${QUICK_INPUT_ID}-list`;
  return (
    <div className={s.quick}>
      <div className={s.quickBox}>
        <SearchIcon className={s.quickIcon} aria-hidden />
        <input
          id={QUICK_INPUT_ID}
          className={s.quickInput}
          role="combobox"
          aria-label={t.home.quickLabel}
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            showList && highlight >= 0 ? `${listId}-${String(highlight)}` : undefined
          }
          aria-invalid={error ? true : undefined}
          placeholder={t.home.quickPlaceholder}
          spellCheck={false}
          autoComplete="off"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
            setOpen(true);
            setHighlight(-1);
          }}
          onBlur={() => {
            setOpen(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              if (suggestions.length === 0) return;
              e.preventDefault();
              setOpen(true);
              const step = e.key === 'ArrowDown' ? 1 : -1;
              // Gira entre as sugestões e "nenhuma" (-1, o texto digitado).
              setHighlight((h) => {
                const next = h + step;
                if (next >= suggestions.length) return -1;
                return next < -1 ? suggestions.length - 1 : next;
              });
            } else if (e.key === 'Escape' && showList) {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              setHighlight(-1);
            }
          }}
        />
      </div>
      {showList && (
        <ul id={listId} className={s.suggestions} role="listbox" aria-label={t.home.suggestions}>
          {suggestions.map((host, i) => (
            <li
              key={host.id}
              id={`${listId}-${String(i)}`}
              role="option"
              aria-selected={i === highlight}
              className={s.suggestion}
              onMouseDown={(e) => {
                // Antes do blur do campo, que fecharia a lista.
                e.preventDefault();
                reset();
                void connectHost(host);
              }}
              onMouseEnter={() => {
                setHighlight(i);
              }}
            >
              <Avatar text={host.label} os={hostOs(host)} size={22} />
              <span className={s.cardLabel}>
                <Match text={host.label} query={text} />
              </span>
              <span className={s.cardSub}>
                <Match text={targetLabel(host)} query={text} />
              </span>
            </li>
          ))}
        </ul>
      )}
      {error ? (
        <span className={s.quickError} role="alert">
          {error}
        </span>
      ) : (
        <span className={s.quickHint}>{t.home.quickHint}</span>
      )}
      {askUser && (
        <UsernameDialog
          target={askUser}
          onClose={() => {
            setAskUser(null);
          }}
        />
      )}
    </div>
  );
}

/** Trecho do texto que bateu com a busca, em destaque (FR-1013); sem acento, como o índice. */
function Match({ text, query }: { text: string; query: string }) {
  const q = normalize(query.trim());
  const at = q ? normalize(text).indexOf(q) : -1;
  // normalize remove acentos sem mudar o tamanho; se mudasse, mostra o texto sem destaque.
  if (at < 0 || normalize(text).length !== text.length) return text;
  return (
    <>
      {text.slice(0, at)}
      <mark className={s.match}>{text.slice(at, at + q.length)}</mark>
      {text.slice(at + q.length)}
    </>
  );
}

/** Alvo sem usuário: pergunta antes de conectar (FR-1004, research R3). */
function UsernameDialog({ target, onClose }: { target: ParsedTarget; onClose: () => void }) {
  const [username, setUsername] = useState('');
  const valid = /^[^\s@:[\]]{1,64}$/.test(username.trim());
  const label = targetLabel(target);
  return (
    <Dialog
      title={t.home.askUser(label)}
      onClose={onClose}
      onSubmit={() => {
        if (!valid) return;
        const quick: QuickTarget = { ...target, username: username.trim() };
        onClose();
        void connectQuick(quick);
      }}
      width={380}
      actions={
        <>
          <Button onClick={onClose}>{t.common.cancel}</Button>
          <Button type="submit" variant="primary" disabled={!valid}>
            {t.hosts.connect}
          </Button>
        </>
      }
    >
      <TextField
        label={t.hosts.username}
        autoFocus
        value={username}
        onChange={(e) => {
          setUsername(e.target.value);
        }}
      />
    </Dialog>
  );
}
