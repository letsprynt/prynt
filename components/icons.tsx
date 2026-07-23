import type { SVGProps } from "react";

type P = { size?: number } & SVGProps<SVGSVGElement>;

function S({ size = 18, children, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconHome = (p: P) => (
  <S {...p}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M10 21v-6h4v6" /></S>
);
export const IconSparkle = (p: P) => (
  <S {...p}><path d="M12 3.5 13.6 9 19 10.6 13.6 12.2 12 17.7 10.4 12.2 5 10.6 10.4 9z" /><path d="M18 4.5v3M19.5 6h-3" /></S>
);
export const IconFlame = (p: P) => (
  <S {...p}><path d="M12 3c.6 2.4 2.2 3.8 3.4 5.2C16.7 9.7 17.5 11.3 17.5 13a5.5 5.5 0 0 1-11 0c0-1 .3-2 .9-2.8.5 1 1.4 1.5 2.3 1.5A2.2 2.2 0 0 0 12 9.5c0-1.2-.6-2-1-3-.6-1.4-.2-2.6 1-3.5z" /></S>
);
export const IconZap = (p: P) => (
  <S {...p}><path d="M13 2 4 13h6l-1 9 9-11h-6l1-9z" /></S>
);
export const IconChat = (p: P) => (
  <S {...p}><path d="M21 11.5a8 8 0 0 1-11.5 7.2L4 20.5l1.8-5.4A8 8 0 1 1 21 11.5z" /></S>
);
export const IconPlus = (p: P) => (<S {...p}><path d="M12 5v14M5 12h14" /></S>);
export const IconChevronLeft = (p: P) => (<S {...p}><path d="M15 18l-6-6 6-6" /></S>);
export const IconChevronRight = (p: P) => (<S {...p}><path d="M9 18l6-6-6-6" /></S>);
export const IconSearch = (p: P) => (<S {...p}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></S>);
export const IconSliders = (p: P) => (
  <S {...p}><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2.2" /><circle cx="8" cy="17" r="2.2" /></S>
);
export const IconGrid = (p: P) => (
  <S {...p}><rect x="3" y="3" width="7.5" height="7.5" rx="1.6" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6" /></S>
);
export const IconRows = (p: P) => (
  <S {...p}><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" /></S>
);
export const IconDollar = (p: P) => (
  <S {...p}><path d="M12 2v20" /><path d="M17 5.5H9.8a3.3 3.3 0 0 0 0 6.5h4.4a3.3 3.3 0 0 1 0 6.5H6" /></S>
);
export const IconBars = (p: P) => (<S {...p}><path d="M6 20v-6M12 20V4M18 20v-9" /></S>);
export const IconTrendUp = (p: P) => (<S {...p}><path d="M3 17l6-6 4 4 8-8" /><path d="M16 7h5v5" /></S>);
export const IconStar = ({ filled, ...p }: P & { filled?: boolean }) => (
  <S {...p} fill={filled ? "currentColor" : "none"}><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17.9 6.6 20l1-6.1L3.2 9.5l6.1-.9z" /></S>
);
export const IconShare = (p: P) => (
  <S {...p}><path d="M14 4h6v6" /><path d="M20 4 11 13" /><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" /></S>
);
export const IconCopy = (p: P) => (
  <S {...p}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" /></S>
);
export const IconGlobe = (p: P) => (
  <S {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z" /></S>
);
export const IconTelegram = (p: P) => (<S {...p}><path d="M22 3 2 11l6 2 2 6 3-4 5 4 4-16z" /><path d="M8 13l9-6-6 8" /></S>);
export const IconX = ({ size = 18, ...rest }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...rest}>
    <path d="M18.24 2.25h3.31l-7.23 8.26L23 21.75h-6.66l-5.21-6.82-5.97 6.82H1.85l7.73-8.84L1 2.25h6.83l4.71 6.23 5.7-6.23zM17.08 19.77h1.83L7.01 4.13H5.05L17.08 19.77z" />
  </svg>
);
export const IconEth = ({ size = 18, ...rest }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...rest}>
    <path d="M12 2 5.5 12.2 12 16l6.5-3.8L12 2z" opacity=".85" />
    <path d="M5.5 13.5 12 22l6.5-8.5L12 17.3 5.5 13.5z" opacity=".55" />
  </svg>
);
export const IconClose = (p: P) => (<S {...p}><path d="M6 6l12 12M18 6 6 18" /></S>);
export const IconDrop = ({ size = 18, ...rest }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...rest}>
    <path d="M12 2.5s-6.5 7.5-6.5 12.2a6.5 6.5 0 1 0 13 0C18.5 10 12 2.5 12 2.5z" />
    <path d="M9 13.2a3 3 0 0 0 2.6 4" fill="none" stroke="rgba(255,255,255,.5)" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);
export const IconCheck = (p: P) => (<S {...p}><path d="M5 12.5l4.5 4.5L19 7" /></S>);
export const IconUser = (p: P) => (<S {...p}><circle cx="12" cy="8" r="3.6" /><path d="M5 20c0-3.6 3.1-5.5 7-5.5s7 1.9 7 5.5" /></S>);
export const IconCrown = (p: P) => (
  <S {...p}><path d="M3 8.2l4.3 3.4L12 5l4.7 6.6L21 8.2l-1.5 9.1a1 1 0 0 1-1 .85H5.5a1 1 0 0 1-1-.85z" /><path d="M4.7 21h14.6" /></S>
);
export const IconAlert = (p: P) => (<S {...p}><path d="M12 3l9.5 16.5h-19z" /><path d="M12 9.5v4.5M12 17.5h.01" /></S>);
export const IconBell = (p: P) => (<S {...p}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></S>);
export const IconSound = (p: P) => (<S {...p}><path d="M11 5 6 9H2v6h4l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14" /></S>);
export const IconMute = (p: P) => (<S {...p}><path d="M11 5 6 9H2v6h4l5 4z" /><path d="m22 9-6 6M16 9l6 6" /></S>);
export const IconBook = (p: P) => (<S {...p}><path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2z" /><path d="M18 17H6a2 2 0 0 0-2 2" /></S>);
export const IconLock = (p: P) => (<S {...p}><rect x="4.5" y="10.5" width="15" height="10.5" rx="2" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" /></S>);
export const IconWallet = (p: P) => (<S {...p}><path d="M19 7V5.5A1.5 1.5 0 0 0 17.5 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h13a1 1 0 0 0 1-1v-2" /><path d="M21 11.5h-5a2.5 2.5 0 0 0 0 5h5a.5.5 0 0 0 .5-.5v-4a.5.5 0 0 0-.5-.5" /></S>);
export const IconExternal = (p: P) => (<S {...p}><path d="M14 5h5v5" /><path d="M19 5l-8 8" /><path d="M19 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4" /></S>);
export const IconPower = (p: P) => (<S {...p}><path d="M12 3v9" /><path d="M6.4 6.4a8 8 0 1 0 11.2 0" /></S>);
