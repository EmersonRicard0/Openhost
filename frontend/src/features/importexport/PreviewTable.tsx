// Tabela da prévia (FR-303, FR-304, FR-306): marcar, corrigir campos e escolher o que fazer
// com duplicados. Linhas fora da tela não são pintadas (content-visibility), o que mantém
// 1.000+ linhas fluidas sem lista virtual.
import { useMemo, useState, type KeyboardEvent } from 'react';
import type { DuplicateAction, PreviewKey, PreviewRow, RowPatch } from '@shared/model/types';
import { t } from '../../i18n/pt-BR';
import { Checkbox } from '../../ui/Checkbox';
import { ChevronDownIcon, KeyIcon, WarningIcon } from '../../ui/icons';
import { Menu, type MenuItem } from '../../ui/Menu';
import { canSelect, keyText, parsePort, warningText } from './options';
import s from './importexport.module.css';

const ie = t.importExport;
const ACTIONS: DuplicateAction[] = ['skip', 'replace', 'keepBoth'];

interface CellProps {
  value: string;
  label: string;
  invalid?: boolean;
  mono?: boolean;
  inputMode?: 'numeric';
  /** Devolve false quando o texto não é aceito (o campo volta ao valor anterior). */
  onCommit: (text: string) => boolean;
}

/** Campo da linha: parece texto até receber foco; Enter grava, Esc desfaz. */
function Cell({ value, label, invalid, mono, inputMode, onCommit }: CellProps) {
  const [text, setText] = useState(value);
  const [from, setFrom] = useState(value);
  if (value !== from) {
    setFrom(value);
    setText(value);
  }
  function commit() {
    if (text === value) return;
    if (!onCommit(text)) setText(value);
  }
  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setText(value);
      requestAnimationFrame(() => {
        (e.target as HTMLInputElement).blur();
      });
    }
  }
  return (
    <input
      className={`${s.cell} ${mono ? s.mono : ''}`}
      aria-label={label}
      aria-invalid={invalid || undefined}
      value={text}
      inputMode={inputMode}
      spellCheck={false}
      onChange={(e) => {
        setText(e.target.value);
      }}
      onBlur={commit}
      onKeyDown={onKeyDown}
    />
  );
}

export interface PreviewTableProps {
  rows: PreviewRow[];
  keys: PreviewKey[];
  onUpdate: (rowId: string, patch: RowPatch) => void;
  emptyText: string;
}

export function PreviewTable({ rows, keys, onUpdate, emptyText }: PreviewTableProps) {
  const keyMap = useMemo(() => new Map(keys.map((k) => [k.ref, k])), [keys]);
  const [menu, setMenu] = useState<{ anchor: HTMLElement; items: MenuItem[] } | null>(null);

  function openActions(anchor: HTMLElement, row: PreviewRow) {
    setMenu({
      anchor,
      items: ACTIONS.filter((a) => a !== 'replace' || row.duplicateOf?.hostId).map((action) => ({
        label: ie.duplicateActions[action],
        onSelect: () => {
          onUpdate(row.rowId, { duplicateAction: action, selected: action !== 'skip' });
        },
      })),
    });
  }

  if (rows.length === 0) return <p className={s.emptyTable}>{emptyText}</p>;

  // Coluna "Grupo" só quando a origem traz grupos: o espaço vai para os avisos.
  const showGroup = rows.some((row) => row.groupPath.length > 0);

  return (
    <div className={s.tableWrap}>
      <table className={s.table}>
        <colgroup>
          <col className={s.colCheck} />
          <col className={s.colLabel} />
          <col className={s.colAddress} />
          <col className={s.colPort} />
          <col className={s.colUser} />
          {showGroup && <col className={s.colGroup} />}
          <col className={s.colKey} />
          <col />
        </colgroup>
        <thead>
          <tr>
            <th className={s.colCheck}>
              <span className={s.visuallyHidden}>{ie.columns.select}</span>
            </th>
            <th>{ie.columns.label}</th>
            <th>{ie.columns.address}</th>
            <th className={s.colPort}>{ie.columns.port}</th>
            <th>{ie.columns.username}</th>
            {showGroup && <th>{ie.columns.group}</th>}
            <th>{ie.columns.key}</th>
            <th>{ie.columns.status}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const invalid = row.state === 'invalid';
            const portBad = row.warnings.some((w) => w.code === 'INVALID_PORT');
            const addressBad = row.warnings.some((w) => w.code === 'MISSING_ADDRESS');
            const name = row.label || row.address || row.origin;
            return (
              <tr
                key={row.rowId}
                className={s.row}
                data-state={row.state}
                data-selected={row.selected || undefined}
                title={row.origin}
              >
                <td className={s.colCheck}>
                  <Checkbox
                    label={<span className={s.visuallyHidden}>{ie.rowSelect(name)}</span>}
                    checked={row.selected}
                    disabled={!canSelect(row)}
                    title={invalid ? ie.rowInvalidHint : undefined}
                    onChange={(e) => {
                      onUpdate(row.rowId, { selected: e.target.checked });
                    }}
                  />
                </td>
                <td>
                  <Cell
                    value={row.label}
                    label={`${ie.columns.label}: ${name}`}
                    onCommit={(text) => {
                      onUpdate(row.rowId, { label: text.trim() });
                      return true;
                    }}
                  />
                </td>
                <td>
                  <Cell
                    value={row.address}
                    label={`${ie.columns.address}: ${name}`}
                    invalid={addressBad}
                    mono
                    onCommit={(text) => {
                      onUpdate(row.rowId, { address: text.trim() });
                      return true;
                    }}
                  />
                </td>
                <td className={s.colPort}>
                  <Cell
                    value={String(row.port)}
                    label={`${ie.columns.port}: ${name}`}
                    invalid={portBad}
                    mono
                    inputMode="numeric"
                    onCommit={(text) => {
                      const port = parsePort(text);
                      if (port === null) return false;
                      onUpdate(row.rowId, { port });
                      return true;
                    }}
                  />
                </td>
                <td>
                  <Cell
                    value={row.username}
                    label={`${ie.columns.username}: ${name}`}
                    onCommit={(text) => {
                      onUpdate(row.rowId, { username: text.trim() });
                      return true;
                    }}
                  />
                </td>
                {showGroup && (
                  <td className={s.muted} title={row.groupPath.join(' / ')}>
                    {row.groupPath.join(' / ')}
                  </td>
                )}
                <td
                  className={s.keyCell}
                  data-nokey={row.keyRef ? undefined : ''}
                  title={keyText(row, keyMap)}
                >
                  {row.keyRef && <KeyIcon className={s.inlineIcon} />}
                  {keyText(row, keyMap)}
                </td>
                <td>
                  <div className={s.status}>
                    {row.state === 'duplicate' && (
                      <button
                        type="button"
                        className={s.dupButton}
                        aria-haspopup="menu"
                        aria-label={`${ie.duplicateAction(name)}: ${ie.duplicateActions[row.duplicateAction]}`}
                        onClick={(e) => {
                          openActions(e.currentTarget, row);
                        }}
                      >
                        <span className={s.dupKind}>
                          {row.duplicateOf?.hostId ? ie.duplicateOfHost : ie.duplicateOfRow}
                        </span>
                        {ie.duplicateActions[row.duplicateAction]}
                        <ChevronDownIcon className={s.inlineIcon} />
                      </button>
                    )}
                    {row.warnings.map((w, i) => (
                      <span
                        key={`${w.code}-${String(i)}`}
                        className={s.warning}
                        data-blocking={
                          w.code === 'INVALID_PORT' || w.code === 'MISSING_ADDRESS' || undefined
                        }
                      >
                        <WarningIcon className={s.inlineIcon} />
                        {warningText(w)}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {menu && (
        <Menu
          anchor={menu.anchor}
          items={menu.items}
          onClose={() => {
            setMenu(null);
          }}
        />
      )}
    </div>
  );
}
