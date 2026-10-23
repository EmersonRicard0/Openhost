// Ícones próprios do ShellVault, desenhados em grade 16×16 (FR-031, Princípio I).
import type { ReactNode, SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export const ServerIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2.5" y="2.5" width="11" height="4.5" rx="1.2" />
    <rect x="2.5" y="9" width="11" height="4.5" rx="1.2" />
    <path d="M5 4.75h.01M5 11.25h.01M8 4.75h3M8 11.25h3" />
  </Icon>
);

export const FolderIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2 4.5c0-.6.4-1 1-1h3l1.3 1.5H13c.6 0 1 .4 1 1v6c0 .6-.4 1-1 1H3c-.6 0-1-.4-1-1z" />
  </Icon>
);

export const FolderOpenIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2 12.5V4.5c0-.6.4-1 1-1h3l1.3 1.5H12c.6 0 1 .4 1 1V7" />
    <path d="M2 12.5 3.6 7.6c.1-.4.5-.6.9-.6H14l-1.7 5.5H2z" />
  </Icon>
);

export const TerminalIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
    <path d="m4.5 6 2 2-2 2M8.5 10.5h3" />
  </Icon>
);

export const FileIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 1.5h5L12.5 5v9a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5V2a.5.5 0 0 1 .5-.5z" />
    <path d="M9 1.5V5h3.5" />
  </Icon>
);

export const UploadIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 10.5V2.5M4.75 5.5 8 2.25l3.25 3.25M2.5 10.5v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2" />
  </Icon>
);

export const DownloadIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 2.5v8M4.75 7.5 8 10.75l3.25-3.25M2.5 10.5v2a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-2" />
  </Icon>
);

export const LockIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="7" width="10" height="7" rx="1.5" />
    <path d="M5.25 7V5a2.75 2.75 0 0 1 5.5 0v2M8 10v1.5" />
  </Icon>
);

export const UnlockIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="7" width="10" height="7" rx="1.5" />
    <path d="M5.25 7V5a2.75 2.75 0 0 1 5.3-1M8 10v1.5" />
  </Icon>
);

export const PlusIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 3v10M3 8h10" />
  </Icon>
);

export const SearchIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="7" cy="7" r="4.25" />
    <path d="m10.25 10.25 3.25 3.25" />
  </Icon>
);

export const CloseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m4 4 8 8M12 4l-8 8" />
  </Icon>
);

export const MoreIcon = (p: IconProps) => (
  <Icon {...p} strokeWidth={2.2}>
    <path d="M3.5 8h.01M8 8h.01M12.5 8h.01" />
  </Icon>
);

export const KeyIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="5.25" cy="10.75" r="2.75" />
    <path d="m7.25 8.75 6-6M11 5l1.75 1.75M9.5 6.5l1.25 1.25" />
  </Icon>
);

export const ForwardIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2 5.5h8.5M8 3l2.5 2.5L8 8M14 10.5H5.5M8 8l-2.5 2.5L8 13" />
  </Icon>
);

export const SettingsIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="8" cy="8" r="2" />
    <path d="M8 1.75v1.5M8 12.75v1.5M14.25 8h-1.5M3.25 8h-1.5M12.4 3.6l-1.06 1.06M4.66 11.34 3.6 12.4M12.4 12.4l-1.06-1.06M4.66 4.66 3.6 3.6" />
  </Icon>
);

export const WarningIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7.13 2.5a1 1 0 0 1 1.74 0l5.5 9.75a1 1 0 0 1-.87 1.5H2.5a1 1 0 0 1-.87-1.5z" />
    <path d="M8 6.25v3M8 11.5h.01" />
  </Icon>
);

export const RefreshIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M13.25 8A5.25 5.25 0 1 1 11.7 4.3M13.25 2.5v3h-3" />
  </Icon>
);

export const EyeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" />
    <circle cx="8" cy="8" r="2" />
  </Icon>
);

export const EyeOffIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6.2 3.75A6.6 6.6 0 0 1 8 3.5C12 3.5 14.5 8 14.5 8a12 12 0 0 1-1.7 2.2M4.2 4.9A11 11 0 0 0 1.5 8S4 12.5 8 12.5a6.4 6.4 0 0 0 3.1-.8M2.5 2.5l11 11M6.6 6.6a2 2 0 0 0 2.8 2.8" />
  </Icon>
);

export const ChevronIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m6 4 4 4-4 4" />
  </Icon>
);
