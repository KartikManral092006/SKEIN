import type { ReactNode } from 'react';
import { DAY_MS, EPOCH } from '../../shared/skein/rules';

export const legDate = (day: number) =>
  new Date(EPOCH + (day - 1) * DAY_MS).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

export const GooseGlyph = ({ filled = true, className = '' }: { filled?: boolean; className?: string }) => (
  <svg viewBox="0 0 32 24" className={className} aria-hidden="true">
    <g fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={filled ? 0 : 1.4} strokeLinejoin="round">
      <path d="M16 9.5 C11 8.5 6 9.5 1.5 14 C6.5 13 11 13.2 14.6 14.6 Z" />
      <path d="M16 9.5 C21 8.5 26 9.5 30.5 14 C25.5 13 21 13.2 17.4 14.6 Z" />
      <ellipse cx="16" cy="13" rx="2.4" ry="7" />
      <ellipse cx="16" cy="4.2" rx="1.3" ry="2.6" />
    </g>
  </svg>
);

export const Stars = ({ n, className = '' }: { n: number; className?: string }) => (
  <span className={`inline-flex items-center gap-1 ${className}`} aria-label={`${n} of 3`}>
    {[0, 1, 2].map((i) => (
      <GooseGlyph key={i} filled={i < n} className={`h-5 w-7 ${i < n ? 'text-rust' : 'text-ink/30'}`} />
    ))}
  </span>
);

export const WakeDiagram = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 150 84" className={className} aria-hidden="true">
    <defs>
      <linearGradient id="wk" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#f2b85b" stopOpacity="0.95" />
        <stop offset="1" stopColor="#f2b85b" stopOpacity="0" />
      </linearGradient>
    </defs>
    {[
      [75, 12],
      [56, 34],
      [94, 34],
    ].map(([x, y], i) => (
      <g key={i}>
        <path d={`M${x! - 13} ${y! + 4} q -2 14 1 26`} stroke="url(#wk)" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d={`M${x! + 13} ${y! + 4} q 2 14 -1 26`} stroke="url(#wk)" strokeWidth="3" fill="none" strokeLinecap="round" />
        <g transform={`translate(${x! - 16} ${y! - 6}) scale(1 -1) translate(0 -24)`} fill="#2e2823">
          <path d="M16 9.5 C11 8.5 6 9.5 1.5 14 C6.5 13 11 13.2 14.6 14.6 Z" />
          <path d="M16 9.5 C21 8.5 26 9.5 30.5 14 C25.5 13 21 13.2 17.4 14.6 Z" />
          <ellipse cx="16" cy="13" rx="2.4" ry="7" />
          <ellipse cx="16" cy="21" rx="1.3" ry="2.6" />
        </g>
      </g>
    ))}
    <g transform="translate(91 50) scale(1 -1) translate(0 -24)" fill="#f6ecd6" stroke="#c2562c" strokeWidth="0.8">
      <path d="M16 9.5 C11 8.5 6 9.5 1.5 14 C6.5 13 11 13.2 14.6 14.6 Z" />
      <path d="M16 9.5 C21 8.5 26 9.5 30.5 14 C25.5 13 21 13.2 17.4 14.6 Z" />
      <ellipse cx="16" cy="13" rx="2.4" ry="7" />
      <ellipse cx="16" cy="21" rx="1.3" ry="2.6" />
    </g>
    <text x="128" y="70" fontFamily="DM Mono, monospace" fontSize="8.5" fill="#5a4f42" textAnchor="middle">
      you
    </text>
  </svg>
);

const Icon = ({ children, label }: { children: ReactNode; label: string }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-label={label} role="img">
    {children}
  </svg>
);

export const HelpIcon = () => (
  <Icon label="How to fly">
    <circle cx="12" cy="12" r="9" />
    <path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.1-2.4 3.6" />
    <path d="M12 17h.01" />
  </Icon>
);

export const SoundOn = () => (
  <Icon label="Sound on">
    <path d="M4 10v4h3l5 4V6L7 10H4z" />
    <path d="M16 9a4 4 0 0 1 0 6" />
    <path d="M18.5 6.5a8 8 0 0 1 0 11" />
  </Icon>
);

export const SoundOff = () => (
  <Icon label="Sound off">
    <path d="M4 10v4h3l5 4V6L7 10H4z" />
    <path d="M17 10l4 4M21 10l-4 4" />
  </Icon>
);

export const Close = () => (
  <Icon label="Close">
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);
