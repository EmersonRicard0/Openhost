// Confirmação antes de transmitir para painéis de produção (specs/012, FR-1208).
import { t } from '../../i18n/pt-BR';
import { useHosts } from '../../stores/hosts';
import { useSessions } from '../../stores/sessions';
import { useWorkspace } from '../../stores/workspace';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { productionPanes } from './broadcast';
import { leaves } from './layout';

export function BroadcastConfirm() {
  const groupId = useWorkspace((w) => w.confirmBroadcast);
  const setConfirm = useWorkspace((w) => w.setConfirmBroadcast);
  const group = useSessions((st) => (groupId ? st.groups[groupId] : undefined));
  const tabs = useSessions((st) => st.tabs);
  const hosts = useHosts((h) => h.hosts);
  if (!groupId) return null;
  const members = group ? tabs.filter((tb) => leaves(group.root).includes(tb.id)) : [];
  const prod = productionPanes(members, hosts);
  const b = t.terminal.broadcast;
  const cancel = () => {
    setConfirm(null);
  };
  const confirm = () => {
    setConfirm(null);
    if (group) useSessions.getState().setBroadcast(group.id, true);
  };
  return (
    <Dialog
      title={b.prodTitle}
      onClose={cancel}
      onSubmit={confirm}
      actions={
        <>
          <Button onClick={cancel} autoFocus>
            {t.common.cancel}
          </Button>
          <Button type="submit" variant="danger">
            {b.prodConfirm}
          </Button>
        </>
      }
    >
      <p style={{ margin: 0 }}>{b.prodMessage(prod.length)}</p>
      <ul style={{ margin: 0 }}>
        {prod.map((tb) => (
          <li key={tb.id}>{tb.baseTitle}</li>
        ))}
      </ul>
    </Dialog>
  );
}
