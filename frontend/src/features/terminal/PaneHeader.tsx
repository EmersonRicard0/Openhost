import { t } from '../../i18n/pt-BR';
import { useSessions, type Tab } from '../../stores/sessions';
import { useUi } from '../../stores/ui';
import { environmentColor } from '../../theme/environments';
import { useHostEnvironment } from '../hosts/environment';
import { Button } from '../../ui/Button';
import { CloseIcon, DetachIcon } from '../../ui/icons';
import { closeSession } from './commands';
import { endDrag, startDrag } from './dragState';
import { StateIcon } from './StateIcon';
import s from './terminal.module.css';

/**
 * Cabeçalho de um painel do grupo (FR-610): estado, título, separar e fechar. Arrastá-lo leva o
 * painel para outro lugar do grupo ou, solto na barra de abas, o separa (FR-612, FR-615).
 */
export function PaneHeader({ tab }: { tab: Tab }) {
  const environment = useHostEnvironment(tab.hostId);
  const dark = useUi((u) => u.dark);
  return (
    <div
      className={s.paneHeader}
      data-pane-header
      draggable
      onClick={() => {
        useSessions.getState().activate(tab.id);
      }}
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-shellvault-pane', tab.id);
        e.dataTransfer.effectAllowed = 'move';
        startDrag({ id: tab.id, kind: 'session', fromPane: true });
      }}
      onDragEnd={endDrag}
    >
      <StateIcon state={tab.state} />
      <span className={s.paneTitle}>{tab.title}</span>
      {environment && (
        <span
          className={s.environmentLabel}
          style={{ ['--environment' as string]: environmentColor(environment.color, dark) }}
        >
          {environment.name}
        </span>
      )}
      <Button
        variant="ghost"
        iconOnly
        className={s.paneButton}
        aria-label={t.terminal.group.splitOut}
        title={t.terminal.group.splitOut}
        onClick={() => {
          useSessions.getState().splitOut(tab.id);
        }}
      >
        <DetachIcon width={13} height={13} />
      </Button>
      <Button
        variant="ghost"
        iconOnly
        className={s.paneButton}
        aria-label={t.terminal.group.closePane}
        title={t.terminal.group.closePane}
        onClick={() => {
          closeSession(tab.id);
        }}
      >
        <CloseIcon width={12} height={12} />
      </Button>
    </div>
  );
}
