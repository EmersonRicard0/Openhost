// Logos de sistema no avatar do host (FR-178), desenhados em `currentColor`: o avatar os pinta na
// cor oficial da marca. Caminhos e cores vêm do Simple Icons (osIcons.gen.ts); os ausentes ficam aqui.
import { OS_IDS, type Host, type OsId } from '@shared/model/types';
import { BRAND } from '../theme/brand.gen';
import { contrast, parseColor } from '../theme/color';
import { NetworkIcon } from './icons';
import { SIMPLE_OS_ICONS } from './osIcons.gen';

/**
 * Desenhos próprios para o que o Simple Icons não traz (FR-502, research R6). Não reproduzem os
 * logos oficiais: só identificam o fabricante. Preenchidos com `evenodd` (furos internos).
 */
const OWN_PATHS: Partial<Record<OsId, string>> = {
  // Quatro janelas, sem a perspectiva do logo atual.
  windows: 'M3 3h8.5v8.5H3zM12.5 3H21v8.5h-8.5zM3 12.5h8.5V21H3zM12.5 12.5H21V21h-8.5z',
  // "Z" dentro de um anel.
  zte: 'M12 1a11 11 0 1 0 0 22a11 11 0 1 0 0-22zM12 3a9 9 0 1 1 0 18a9 9 0 1 1 0-18zM7.5 7h9v2.2L10.4 15h6.1v2h-9v-2.2L13.6 9H7.5z',
  // "D" maciço com o miolo vazado.
  datacom: 'M4 3h7.5a9 9 0 0 1 0 18H4zM7.5 6.5v11h4a5.5 5.5 0 0 0 0-11z',
  // Duas encostas sobre uma base: colina de pedra.
  hillstone: 'M1.5 20 8.5 7l3.6 6.4L15 9l7.5 11z',
};

const LABELS: Record<OsId, string> = {
  ubuntu: 'Ubuntu',
  debian: 'Debian',
  centos: 'CentOS',
  rhel: 'Red Hat Enterprise Linux',
  fedora: 'Fedora',
  rocky: 'Rocky Linux',
  almalinux: 'AlmaLinux',
  alpine: 'Alpine Linux',
  arch: 'Arch Linux',
  opensuse: 'openSUSE',
  oracle: 'Oracle Linux',
  amazon: 'Amazon Linux',
  linux: 'Linux',
  freebsd: 'FreeBSD',
  openbsd: 'OpenBSD',
  windows: 'Windows',
  macos: 'macOS',
  mikrotik: 'MikroTik',
  cisco: 'Cisco',
  huawei: 'Huawei',
  juniper: 'Juniper',
  hpe: 'HPE / Aruba (Comware)',
  fortinet: 'Fortinet',
  openwrt: 'OpenWrt',
  zte: 'ZTE',
  datacom: 'Datacom',
  hillstone: 'Hillstone',
};

export const osLabel = (id: OsId): string => LABELS[id];

export const OS_OPTIONS = OS_IDS.map((id) => ({ id, label: LABELS[id] })).sort((a, b) =>
  a.label.localeCompare(b.label, 'pt-BR'),
);

/** Cores oficiais das marcas que o Simple Icons não traz (ou cujo logo aqui é outro). */
const EXTRA_HEX: Partial<Record<OsId, string>> = {
  windows: '#0078D4',
  hpe: '#01A982',
  // Do site oficial (zte.com.cn).
  zte: '#008ED3',
  // Do SVG do logo no site oficial (hillstonenet.com).
  hillstone: '#003285',
};

/** Sem cor de marca conhecida: o logo usa a cor do texto. */
const NO_HEX: ReadonlySet<OsId> = new Set<OsId>(['datacom']);

function brandHex(id: OsId): string | null {
  if (NO_HEX.has(id)) return null;
  if (id in SIMPLE_OS_ICONS) return SIMPLE_OS_ICONS[id as keyof typeof SIMPLE_OS_ICONS].hex;
  // Oracle e Amazon Linux usam o pinguim, então ficam com a cor dele.
  return EXTRA_HEX[id] ?? SIMPLE_OS_ICONS.linux.hex;
}

/** Fundo do quadrado do avatar em cada tema (--surface-raised dos modos sólidos). */
const TILE = { dark: BRAND.superficie, light: BRAND.branco };
/** O logo é decorativo (o nome do host vem ao lado): basta não sumir no fundo. 3:1 tiraria a cor
 * de marcas como Cisco e Fedora no tema claro. */
const MIN_CONTRAST = 2;

/**
 * Cor do logo no quadrado escuro e no claro: a oficial quando ela se destaca do fundo; senão
 * `null`, e o avatar usa a cor do texto (ex.: maçã preta da Apple no tema escuro).
 */
export function osLogoColors(id: OsId): { dark: string | null; light: string | null } {
  const hex = brandHex(id);
  if (!hex) return { dark: null, light: null };
  const color = parseColor(hex);
  const fits = (tile: string) => contrast(color, parseColor(tile)) >= MIN_CONTRAST;
  return { dark: fits(TILE.dark) ? hex : null, light: fits(TILE.light) ? hex : null };
}

function pathOf(id: OsId): string | null {
  if (id in SIMPLE_OS_ICONS) return SIMPLE_OS_ICONS[id as keyof typeof SIMPLE_OS_ICONS].path;
  // Oracle e Amazon Linux não estão no Simple Icons: usam o pinguim.
  if (id === 'oracle' || id === 'amazon') return SIMPLE_OS_ICONS.linux.path;
  return OWN_PATHS[id] ?? null;
}

/** Ícone efetivo do host: a escolha do usuário ou, em `auto`, o detectado. */
export function hostOs(host: Pick<Host, 'osIcon' | 'detectedOs'>): OsId | null {
  const chosen = host.osIcon ?? 'auto';
  return chosen === 'auto' ? (host.detectedOs ?? null) : chosen;
}

export function OsLogo({ id, size = 16 }: { id: OsId; size?: number }) {
  const path = pathOf(id);
  // Sem logo próprio (HPE/Comware): o ícone genérico de equipamento de rede.
  if (!path) return <NetworkIcon width={size} height={size} aria-hidden />;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d={path} fillRule={id in OWN_PATHS ? 'evenodd' : undefined} />
    </svg>
  );
}
