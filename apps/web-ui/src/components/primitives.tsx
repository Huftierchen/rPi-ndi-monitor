import { useState } from 'react';
import type { ButtonHTMLAttributes, ReactNode, CSSProperties } from 'react';

/* ─── SectionLabel ─── */
export interface SectionLabelProps {
  children: ReactNode;
  right?: ReactNode;
}
export function SectionLabel({ children, right }: SectionLabelProps) {
  return (
    <div className="section-label">
      <span>{children}</span>
      {right && <span className="right">{right}</span>}
    </div>
  );
}

/* ─── Bracket4 ─── */
export type BracketColor = 'cyan' | 'green' | 'red' | 'dim';
export interface Bracket4Props {
  children: ReactNode;
  color?: BracketColor;
  style?: CSSProperties;
}
const BRACKET_COLOR_VAR: Record<BracketColor, string> = {
  cyan: 'var(--cyan)',
  green: 'var(--green)',
  red: 'var(--red)',
  dim: 'var(--line-bold)',
};
export function Bracket4({ children, color = 'cyan', style }: Bracket4Props) {
  const borderColor = BRACKET_COLOR_VAR[color];
  return (
    <div className="bracket-4" style={style}>
      <span className="b-corner b-tl" style={{ borderColor }} />
      <span className="b-corner b-tr" style={{ borderColor }} />
      <span className="b-corner b-bl" style={{ borderColor }} />
      <span className="b-corner b-br" style={{ borderColor }} />
      {children}
    </div>
  );
}

/* ─── StatusChip ─── */
export type StatusChipState = 'live' | 'idle' | 'err';
export interface StatusChipProps {
  state: StatusChipState;
}
export function StatusChip({ state }: StatusChipProps) {
  if (state === 'live') {
    return (
      <span className="status-chip">
        <span className="pulse-dot" />
        LIVE
      </span>
    );
  }
  if (state === 'err') {
    return (
      <span className="status-chip err">
        <span className="pulse-dot" />
        ERROR
      </span>
    );
  }
  return (
    <span className="status-chip idle">
      <span className="pulse-dot" />
      IDLE
    </span>
  );
}

/* ─── Stat ─── */
export type StatColor = 'green' | 'red' | 'cyan' | 'orange' | 'dim';
export interface StatProps {
  label: ReactNode;
  value: string | number;
  mono?: boolean;
  color?: StatColor;
  unit?: ReactNode;
}
export function Stat({ label, value, mono, color, unit }: StatProps) {
  const cls = ['value'];
  if (color) cls.push(color);
  if (mono) cls.push('mono');
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className={cls.join(' ')}>
        {value}
        {unit && <span className="unit">{unit}</span>}
      </div>
    </div>
  );
}

/* ─── NoiseStrip ─── */
export interface NoiseStripProps {
  tokens: ReactNode[];
  className?: string;
}
export function NoiseStrip({ tokens, className }: NoiseStripProps) {
  const cls = 'noise-strip' + (className ? ' ' + className : '');
  return (
    <div className={cls}>
      {tokens.map((t, i) => (
        <span key={i}>{t}</span>
      ))}
    </div>
  );
}

/* ─── Button ─── */
export type ButtonVariant = 'default' | 'primary' | 'ghost-cyan' | 'danger' | 'warn';
export type ButtonSize = 'default' | 'sm';
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  full?: boolean;
}
export function Button({
  variant = 'default',
  size = 'default',
  full,
  className,
  children,
  ...rest
}: ButtonProps) {
  const cls = ['btn'];
  if (variant !== 'default') cls.push(variant);
  if (size === 'sm') cls.push('sm');
  if (full) cls.push('full');
  if (className) cls.push(className);
  return (
    <button className={cls.join(' ')} {...rest}>
      {children}
    </button>
  );
}

/* ─── Toggle ─── */
export interface ToggleProps {
  on: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
}
export function Toggle({ on, onChange, ariaLabel }: ToggleProps) {
  return (
    <button
      type="button"
      className={'toggle' + (on ? ' on' : '')}
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      onClick={() => onChange(!on)}
    >
      <span className="knob" />
    </button>
  );
}

/* ─── Stepper ─── */
export interface StepperProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
}
function clamp(n: number, min?: number, max?: number): number {
  if (min !== undefined && n < min) return min;
  if (max !== undefined && n > max) return max;
  return n;
}
export function Stepper({ value, onChange, min, max, step = 1 }: StepperProps) {
  const dec = () => onChange(clamp(value - step, min, max));
  const inc = () => onChange(clamp(value + step, min, max));
  return (
    <div className="stepper">
      <button type="button" onClick={dec} aria-label="decrement">−</button>
      <input
        type="number"
        value={value}
        onChange={(e) => {
          const parsed = parseInt(e.target.value, 10);
          if (!Number.isNaN(parsed)) onChange(clamp(parsed, min, max));
        }}
      />
      <button type="button" onClick={inc} aria-label="increment">＋</button>
    </div>
  );
}

/* ─── Field ─── */
export interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}
export function Field({ label, hint, children }: FieldProps) {
  return (
    <div className="field">
      <div className="f-label">
        <span>{label}</span>
        {hint && <span className="f-hint">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

/* ─── ToggleRow ─── */
export interface ToggleRowProps {
  label: string;
  sub?: ReactNode;
  on: boolean;
  onChange: (next: boolean) => void;
}
export function ToggleRow({ label, sub, on, onChange }: ToggleRowProps) {
  return (
    <div className="toggle-row">
      <div>
        <div className="tr-label">{label}</div>
        {sub && <div className="tr-sub">{sub}</div>}
      </div>
      <Toggle on={on} onChange={onChange} ariaLabel={label} />
    </div>
  );
}

/* ─── Accordion ─── */
export interface AccordionProps {
  title: ReactNode;
  meta?: ReactNode;
  defaultOpen?: boolean;
  children?: ReactNode;
}
export function Accordion({ title, meta, defaultOpen = false, children }: AccordionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={'accordion' + (open ? '' : ' collapsed')}>
      <button
        type="button"
        className="accordion-head"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span>◇ {title}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {meta && (
            <small
              style={{
                fontFamily: 'var(--ff-mono)',
                fontSize: 9,
                letterSpacing: '0.15em',
                color: 'var(--fg-mute)',
              }}
            >
              {meta}
            </small>
          )}
          <span className="chev">{open ? '−' : '＋'}</span>
        </span>
      </button>
      {open && <div className="accordion-body">{children}</div>}
    </div>
  );
}

/* ─── LogLine ─── */
export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'OK';
export interface LogLineProps {
  ts: string;
  lv: LogLevel;
  msg: ReactNode;
}
export function LogLine({ ts, lv, msg }: LogLineProps) {
  return (
    <div>
      <span className="ts">[{ts}] </span>
      <span className={'lv-' + lv}>{lv.padEnd(5)}</span>
      <span> {msg}</span>
    </div>
  );
}

/* ─── InfoRow ─── */
export interface InfoRowProps {
  label: ReactNode;
  value: ReactNode;
  lg?: boolean;
}
export function InfoRow({ label, value, lg }: InfoRowProps) {
  return (
    <div className="info-row">
      <div className="ir-label">◇ {label}</div>
      <div className={'ir-value' + (lg ? ' lg' : '')}>{value}</div>
    </div>
  );
}

/* ─── Bullet ─── */
export interface BulletProps {
  num: ReactNode;
  title: ReactNode;
  desc: ReactNode;
}
export function Bullet({ num, title, desc }: BulletProps) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        padding: '10px 12px',
        background: 'var(--bg-panel-2)',
        border: '1px solid var(--line)',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--ff-mono)',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.15em',
          color: 'var(--cyan)',
          minWidth: 22,
        }}
      >
        {num}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: 'var(--ff-mono)',
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.12em',
            color: 'var(--fg)',
            textTransform: 'uppercase',
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontFamily: 'var(--ff-mono)',
            fontSize: 10,
            letterSpacing: '0.06em',
            color: 'var(--fg-mute)',
            marginTop: 4,
            lineHeight: 1.5,
          }}
        >
          {desc}
        </div>
      </div>
    </div>
  );
}

/* ─── SegmentSwitch ─── */
export interface SegmentSwitchOption<T extends string> {
  value: T;
  label: ReactNode;
}
export interface SegmentSwitchProps<T extends string> {
  options: Array<SegmentSwitchOption<T>>;
  value: T;
  onChange: (next: T) => void;
}
export function SegmentSwitch<T extends string>({
  options,
  value,
  onChange,
}: SegmentSwitchProps<T>) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={o.value === value ? 'active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
