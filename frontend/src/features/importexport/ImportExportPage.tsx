// Seção "Importar e exportar" das configurações (FR-301): escolher a origem, revisar a prévia
// e ver o resumo; exportar abre um diálogo.
import { useEffect, useState, type ReactNode } from 'react';
import type { ImportSource, SourceKind } from '@shared/model/types';
import { t } from '../../i18n/pt-BR';
import { useImportExport } from '../../stores/importExport';
import { Button } from '../../ui/Button';
import {
  DownloadIcon,
  FileIcon,
  FolderIcon,
  KeyIcon,
  ServerIcon,
  TerminalIcon,
  UploadIcon,
} from '../../ui/icons';
import { Spinner } from '../../ui/Spinner';
import { toastError, toastInfo } from '../../ui/Toast';
import { FilePasswordDialog } from './Dialogs';
import { ExportDialog } from './ExportDialog';
import { PreviewStep, SummaryStep } from './ImportWizard';
import s from './importexport.module.css';

const ie = t.importExport;

/** Ordem e ícone dos cartões; KiTTY portátil é uma ação dentro do cartão do KiTTY. */
const CARDS: { kind: Exclude<SourceKind, 'kittyPortable'>; icon: ReactNode }[] = [
  { kind: 'openssh', icon: <TerminalIcon size="md" /> },
  { kind: 'putty', icon: <KeyIcon size="md" /> },
  { kind: 'kitty', icon: <KeyIcon size="md" /> },
  { kind: 'csv', icon: <FileIcon size="md" /> },
  { kind: 'mobaxterm', icon: <ServerIcon size="md" /> },
  { kind: 'securecrt', icon: <ServerIcon size="md" /> },
  { kind: 'openhost', icon: <DownloadIcon size="md" /> },
];

/** Origens que leem do lugar padrão (arquivo do usuário ou registro). */
const HAS_DEFAULT = new Set<SourceKind>(['openssh', 'putty', 'kitty']);
/** Origens lidas só do registro: sem "Escolher arquivo". */
const REGISTRY_ONLY = new Set<SourceKind>(['putty']);

type CardKind = Exclude<SourceKind, 'kittyPortable'>;

/**
 * Cartões disponíveis nesta plataforma. Antes da primeira resposta mostra tudo. O cartão do KiTTY
 * aparece também quando só a pasta portátil existe (Linux e macOS, specs/004 FR-415).
 */
export function visibleCards(sources: readonly ImportSource[]): CardKind[] {
  const available = new Set(sources.filter((src) => src.available).map((src) => src.kind));
  return CARDS.map((c) => c.kind).filter(
    (kind) =>
      sources.length === 0 ||
      available.has(kind) ||
      (kind === 'kitty' && available.has('kittyPortable')),
  );
}

function SourceCard({
  kind,
  icon,
  source,
  busy,
}: {
  kind: Exclude<SourceKind, 'kittyPortable'>;
  icon: ReactNode;
  source: ImportSource | undefined;
  busy: boolean;
}) {
  const open = useImportExport((st) => st.open);
  const text = ie.sources[kind];
  const canDefault =
    HAS_DEFAULT.has(kind) && (source?.available ?? true) && (source?.defaultFound ?? false);

  async function saveTemplate() {
    const res = await window.shellvault.imports.saveCsvTemplate();
    if (!res.ok) toastError(res.error);
    else if (res.value) toastInfo(ie.csvTemplateSaved);
  }

  return (
    <li className={s.card}>
      <span className={s.cardIcon}>{icon}</span>
      <div className={s.cardBody}>
        <h4 className={s.cardTitle}>{text.title}</h4>
        <p className={s.cardText}>{text.description}</p>
        {'where' in text && <p className={s.hint}>{text.where}</p>}
        <div className={s.cardActions}>
          {canDefault && (
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => void open(kind, { useDefault: true })}
            >
              {text.useDefault}
            </Button>
          )}
          {!REGISTRY_ONLY.has(kind) && (
            <Button
              disabled={busy}
              onClick={() => void open(kind === 'kitty' ? 'kittyPortable' : kind)}
            >
              {kind === 'kitty' ? (
                <>
                  <FolderIcon />
                  {ie.chooseFolder}
                </>
              ) : (
                ie.chooseFile
              )}
            </Button>
          )}
          {REGISTRY_ONLY.has(kind) && source && !source.defaultFound && (
            <span className={s.hint}>{ie.noSessions}</span>
          )}
          {kind === 'csv' && (
            <Button variant="ghost" onClick={() => void saveTemplate()}>
              {ie.csvTemplate}
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

function SourcesStep() {
  const sources = useImportExport((st) => st.sources);
  const busy = useImportExport((st) => st.busy);
  const error = useImportExport((st) => (st.passwordFor ? null : st.error));
  const [exporting, setExporting] = useState(false);
  const byKind = new Map(sources.map((src) => [src.kind, src]));
  const shown = new Set(visibleCards(sources));
  const visible = CARDS.filter(({ kind }) => shown.has(kind));

  return (
    <>
      <section className={s.block} aria-labelledby="import-title">
        <h3 id="import-title" className={s.blockTitle}>
          <UploadIcon />
          {ie.importTitle}
        </h3>
        <p className={s.hint}>{ie.importIntro}</p>
        <ul className={s.cards}>
          {visible.map(({ kind, icon }) => (
            <SourceCard key={kind} kind={kind} icon={icon} source={byKind.get(kind)} busy={busy} />
          ))}
        </ul>
        {busy && <Spinner label={ie.reading} />}
        {error && (
          <p role="alert" className={s.error}>
            {error.message}
          </p>
        )}
      </section>
      <section className={s.block} aria-labelledby="export-title">
        <h3 id="export-title" className={s.blockTitle}>
          <DownloadIcon />
          {ie.exportTitle}
        </h3>
        <p className={s.hint}>{ie.exportIntro}</p>
        <div className={s.actions}>
          <Button
            onClick={() => {
              setExporting(true);
            }}
          >
            {ie.exportAction}
          </Button>
        </div>
      </section>
      {exporting && (
        <ExportDialog
          onClose={() => {
            setExporting(false);
          }}
        />
      )}
    </>
  );
}

export function ImportExportPage() {
  const step = useImportExport((st) => st.step);
  const preview = useImportExport((st) => st.preview);
  const passwordFor = useImportExport((st) => st.passwordFor);
  const busy = useImportExport((st) => st.busy);
  const error = useImportExport((st) => st.error);
  const loadSources = useImportExport((st) => st.loadSources);
  const open = useImportExport((st) => st.open);
  const cancelPassword = useImportExport((st) => st.cancelPassword);

  useEffect(() => {
    void loadSources();
  }, [loadSources]);

  // Sair da tela depois de concluir volta às origens; uma prévia em revisão continua onde estava.
  useEffect(
    () => () => {
      const st = useImportExport.getState();
      if (st.step === 'summary') st.reset();
    },
    [],
  );

  return (
    <div className={s.page}>
      {step === 'preview' && preview ? (
        <PreviewStep preview={preview} />
      ) : step === 'summary' ? (
        <SummaryStep />
      ) : (
        <SourcesStep />
      )}
      {passwordFor && (
        <FilePasswordDialog
          error={error}
          busy={busy}
          onSubmit={(password) => void open(passwordFor, { filePassword: password })}
          onCancel={cancelPassword}
        />
      )}
    </div>
  );
}
