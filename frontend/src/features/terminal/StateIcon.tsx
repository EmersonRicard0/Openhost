import type { Tab } from '../../stores/sessions';
import {
  ConnectedIcon,
  ConnectingIcon,
  DisconnectedIcon,
  ErrorIcon,
  ExitedIcon,
} from '../../ui/icons';
import s from './terminal.module.css';

/** Estado da aba por cor e por forma (FR-163): quem não distingue as cores vê o ícone. */
export function StateIcon({ state }: { state: Tab['state'] }) {
  const Icon =
    state === 'connected'
      ? ConnectedIcon
      : state === 'disconnected'
        ? DisconnectedIcon
        : state === 'error'
          ? ErrorIcon
          : state === 'closed'
            ? ExitedIcon
            : ConnectingIcon;
  return (
    <span className={s.state} data-state={state} aria-hidden>
      <Icon width={13} height={13} />
    </span>
  );
}
