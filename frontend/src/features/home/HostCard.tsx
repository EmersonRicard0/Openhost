// Card de host na tela inicial (specs/010, FR-1012).
import type { HostView } from '@shared/model/types';
import { t } from '../../i18n/pt-BR';
import { useUi } from '../../stores/ui';
import { environmentColor } from '../../theme/environments';
import { Avatar } from '../../ui/Avatar';
import { StarIcon } from '../../ui/icons';
import { hostOs } from '../../ui/osIcons';
import { connectHost } from '../hosts/connect';
import { useHostEnvironment } from '../hosts/environment';
import { setFavorite } from './favorite';
import { targetLabel } from './quickTarget';
import s from './home.module.css';

export function HostCard({ host }: { host: HostView }) {
  const environment = useHostEnvironment(host.id);
  const dark = useUi((u) => u.dark);
  const target = targetLabel(host);
  const favorite = host.favorite ?? false;
  return (
    <div
      className={s.card}
      data-environment={environment?.color}
      style={
        environment
          ? { ['--environment' as string]: environmentColor(environment.color, dark) }
          : undefined
      }
    >
      <button
        type="button"
        className={s.cardMain}
        aria-label={`${host.label}, ${target}`}
        onClick={() => void connectHost(host)}
      >
        <Avatar text={host.label} os={hostOs(host)} />
        <span className={s.cardText}>
          <span className={s.cardLabel}>{host.label}</span>
          <span className={s.cardSub}>{target}</span>
        </span>
      </button>
      <button
        type="button"
        className={`${s.star} ${favorite ? s.starOn : ''}`}
        aria-label={favorite ? t.home.unfavorite(host.label) : t.home.favorite(host.label)}
        aria-pressed={favorite}
        onClick={() => void setFavorite(host, !favorite)}
      >
        <StarIcon width={14} height={14} />
      </button>
    </div>
  );
}

/** Card de um alvo rápido recente: abre a conexão rápida de novo. */
export function QuickCard({ label, onOpen }: { label: string; onOpen: () => void }) {
  return (
    <div className={s.card}>
      <button
        type="button"
        className={s.cardMain}
        aria-label={`${label}, ${t.home.quickBadge}`}
        onClick={onOpen}
      >
        <Avatar text={label} />
        <span className={s.cardText}>
          <span className={s.cardLabel}>{label}</span>
          <span className={s.cardSub}>{t.home.quickBadge}</span>
        </span>
      </button>
    </div>
  );
}
