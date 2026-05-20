import { useEffect, useRef, useState } from 'react';
import {
  Accordion,
  Field,
  SectionLabel,
  SegmentSwitch,
  Stepper,
  ToggleRow,
} from '../components/primitives.tsx';
import { useAppState } from '../state/AppState.tsx';
import { isReceiverRunning } from '../utils/status.ts';
import { api } from '../api/client.ts';
import type {
  AppConfig,
  BandwidthMode,
  ColorFormat,
  LogLevel,
  ScaleMode,
} from '../api/types.ts';
import {
  BANDWIDTH_MODE_LABELS,
  BANDWIDTH_MODES,
  COLOR_FORMAT_LABELS,
  COLOR_FORMATS,
  LOG_LEVEL_LABELS,
  LOG_LEVELS,
  SCALE_MODE_LABELS,
  SCALE_MODES,
} from '../api/options.ts';

type Mode = 'quick' | 'advanced';
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function cloneConfig(c: AppConfig): AppConfig {
  return {
    server: { ...c.server },
    receiver: {
      ...c.receiver,
      reconnect: { ...c.receiver.reconnect },
    },
    logging: { ...c.logging },
    display: { ...c.display },
    device: { ...c.device },
  };
}

export function Settings() {
  const { config, status, setConfig } = useAppState();
  const [mode, setMode] = useState<Mode>('quick');
  const [draft, setDraft] = useState<AppConfig | null>(config ? cloneConfig(config) : null);

  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedWhileRunning, setSavedWhileRunning] = useState(false);

  const pendingDraftRef = useRef<AppConfig | null>(null);
  const inFlightRef = useRef(false);
  const debounceRef = useRef<number | null>(null);
  const savedHideTimerRef = useRef<number | null>(null);
  const statusRef = useRef(status);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // Re-sync draft when upstream config reference changes (after external update).
  useEffect(() => {
    if (config) {
      setDraft(cloneConfig(config));
    }
  }, [config]);

  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
      if (savedHideTimerRef.current !== null) window.clearTimeout(savedHideTimerRef.current);
    };
  }, []);

  async function flushPersist(): Promise<void> {
    if (inFlightRef.current) return;
    const next = pendingDraftRef.current;
    if (!next) return;
    pendingDraftRef.current = null;
    inFlightRef.current = true;
    const wasRunning = isReceiverRunning(statusRef.current);
    setSaveState('saving');
    setSaveError(null);
    try {
      const updated = await api.putConfig(next);
      setConfig(updated);
      setSavedWhileRunning(wasRunning);
      setSaveState('saved');
      if (savedHideTimerRef.current !== null) {
        window.clearTimeout(savedHideTimerRef.current);
      }
      savedHideTimerRef.current = window.setTimeout(() => {
        savedHideTimerRef.current = null;
        setSaveState((s) => (s === 'saved' ? 'idle' : s));
      }, 1500);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
      setSaveState('error');
    } finally {
      inFlightRef.current = false;
      if (pendingDraftRef.current) {
        void flushPersist();
      }
    }
  }

  function scheduleSave(next: AppConfig, immediate: boolean): void {
    pendingDraftRef.current = next;
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (immediate) {
      void flushPersist();
    } else {
      debounceRef.current = window.setTimeout(() => {
        debounceRef.current = null;
        void flushPersist();
      }, 400);
    }
  }

  function mutate(producer: (current: AppConfig) => AppConfig, immediate: boolean): void {
    setDraft((current) => {
      if (!current) return current;
      const next = producer(current);
      scheduleSave(next, immediate);
      return next;
    });
  }

  function flushPending(): void {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (pendingDraftRef.current) {
      void flushPersist();
    }
  }

  if (!draft || !config) {
    return (
      <section className="panel">
        <p className="note">Loading configuration…</p>
      </section>
    );
  }

  const sourceInput = (
    <input
      type="text"
      value={draft.receiver.sourceName}
      onChange={(e) => {
        const v = e.target.value;
        mutate((d) => ({ ...d, receiver: { ...d.receiver, sourceName: v } }), false);
      }}
      onBlur={flushPending}
    />
  );

  const scaleSelect = (
    <select
      value={draft.receiver.scaleMode}
      onChange={(e) => {
        const v = e.target.value as ScaleMode;
        mutate((d) => ({ ...d, receiver: { ...d.receiver, scaleMode: v } }), true);
      }}
    >
      {SCALE_MODES.map((m) => (
        <option key={m} value={m}>
          {SCALE_MODE_LABELS[m]}
        </option>
      ))}
    </select>
  );

  const colorSelect = (
    <select
      value={draft.receiver.colorFormat}
      onChange={(e) => {
        const v = e.target.value as ColorFormat;
        mutate((d) => ({ ...d, receiver: { ...d.receiver, colorFormat: v } }), true);
      }}
    >
      {COLOR_FORMATS.map((m) => (
        <option key={m} value={m}>
          {COLOR_FORMAT_LABELS[m]}
        </option>
      ))}
    </select>
  );

  const saveIndicator =
    (
      <div
        aria-live="polite"
        style={{
          position: 'fixed',
          top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
          right: 14,
          zIndex: 50,
          pointerEvents: 'none',
          fontFamily: 'var(--ff-mono)',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          padding: '8px 12px',
          color: '#001016',
          background:
            saveState === 'saved'
              ? 'var(--green)'
              : saveState === 'error'
                ? 'var(--red)'
                : 'var(--cyan)',
          border: '1px solid rgba(0,0,0,0.45)',
          boxShadow: '0 4px 14px rgba(0,0,0,0.45)',
          opacity: saveState === 'idle' ? 0 : 1,
          transform: `translateY(${saveState === 'idle' ? '-6px' : '0'})`,
          transition: 'opacity 150ms ease, transform 150ms ease',
        }}
      >
        {saveState === 'saving' && '⌛ SAVING…'}
        {saveState === 'saved' && (savedWhileRunning ? '✓ SAVED · RECEIVER RESTART' : '✓ SAVED')}
        {saveState === 'error' && `✕ ${saveError ?? 'Save failed'}`}
      </div>
    );

  return (
    <>
      <SectionLabel right="/ETC/NDI-RECEIVER/CONFIG.YAML">CONFIGURATION</SectionLabel>
      <SegmentSwitch<Mode>
        options={[
          { value: 'quick', label: 'QUICK · 5' },
          { value: 'advanced', label: 'ADVANCED · ALL' },
        ]}
        value={mode}
        onChange={setMode}
      />

      {saveIndicator}

      {mode === 'quick' ? (
        <>
          <div className="panel">
            <Field label="PREFERRED SOURCE" hint="STORED IN YAML">
              {sourceInput}
            </Field>
            <Field label="SCALE MODE" hint="HDMI FRAMING">
              {scaleSelect}
            </Field>
            <Field label="RECEIVER COLOR FORMAT" hint="CPU IMPACT · HIGH">
              {colorSelect}
            </Field>
            <ToggleRow
              label="LOW LATENCY MODE"
              sub="Skip prebuffering · drops fewer frames"
              on={draft.receiver.lowLatencyMode}
              onChange={(v) =>
                mutate((d) => ({ ...d, receiver: { ...d.receiver, lowLatencyMode: v } }), true)
              }
            />
            <ToggleRow
              label="START ON BOOT"
              sub="Auto-connect after appliance reboots"
              on={draft.receiver.autoStart}
              onChange={(v) =>
                mutate((d) => ({ ...d, receiver: { ...d.receiver, autoStart: v } }), true)
              }
            />
          </div>

          <div>
            <SectionLabel right="TOGGLE ADV TO EDIT">ADVANCED · COLLAPSED</SectionLabel>
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Accordion
                title="RECONNECT STRATEGY"
                meta="4 fields"
                onHeaderClick={() => setMode('advanced')}
              />
              <Accordion
                title="WEB UI & LOGGING"
                meta="6 fields"
                onHeaderClick={() => setMode('advanced')}
              />
              <Accordion
                title="DEVICE & DISPLAY"
                meta="3 fields"
                onHeaderClick={() => setMode('advanced')}
              />
            </div>
          </div>

          <p className="note">
            <strong style={{ color: 'var(--fg-dim)' }}>Pi 5 perf tip:</strong> color=fastest +
            low-latency=on holds 1080p60 with low CPU. rgba w/o low-latency: higher CPU +
            occasional dropped frames.
          </p>
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Accordion title="RECEIVER TARGET" meta="8 fields" defaultOpen>
            <Field label="SOURCE" hint="NDI SENDER NAME">
              {sourceInput}
            </Field>
            <Field label="SCALE MODE" hint="HDMI FRAMING">
              {scaleSelect}
            </Field>
            <Field label="NDI BANDWIDTH MODE" hint="NETWORK">
              <select
                value={draft.receiver.bandwidthMode}
                onChange={(e) => {
                  const v = e.target.value as BandwidthMode;
                  mutate(
                    (d) => ({ ...d, receiver: { ...d.receiver, bandwidthMode: v } }),
                    true,
                  );
                }}
              >
                {BANDWIDTH_MODES.map((m) => (
                  <option key={m} value={m}>
                    {BANDWIDTH_MODE_LABELS[m]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="RECEIVER COLOR FORMAT" hint="CPU IMPACT · HIGH">
              {colorSelect}
            </Field>
            <ToggleRow
              label="AUDIO OVER HDMI"
              sub="Mute HDMI audio when off"
              on={draft.receiver.audioEnabled}
              onChange={(v) =>
                mutate((d) => ({ ...d, receiver: { ...d.receiver, audioEnabled: v } }), true)
              }
            />
            <Field label="OUTPUT FPS CAP" hint="0 = UNLIMITED">
              <Stepper
                value={draft.receiver.outputFpsCap}
                onChange={(v) =>
                  mutate((d) => ({ ...d, receiver: { ...d.receiver, outputFpsCap: v } }), true)
                }
                min={0}
                max={120}
                step={1}
              />
            </Field>
            <ToggleRow
              label="LOW LATENCY MODE"
              sub="Skip prebuffering · drops fewer frames"
              on={draft.receiver.lowLatencyMode}
              onChange={(v) =>
                mutate((d) => ({ ...d, receiver: { ...d.receiver, lowLatencyMode: v } }), true)
              }
            />
            <ToggleRow
              label="START ON BOOT"
              sub="Auto-connect after appliance reboots"
              on={draft.receiver.autoStart}
              onChange={(v) =>
                mutate((d) => ({ ...d, receiver: { ...d.receiver, autoStart: v } }), true)
              }
            />
          </Accordion>

          <Accordion title="RECONNECT STRATEGY" meta="4 fields">
            <ToggleRow
              label="AUTOMATIC RECONNECT"
              sub="Retry on disconnect with backoff"
              on={draft.receiver.reconnect.enabled}
              onChange={(v) =>
                mutate(
                  (d) => ({
                    ...d,
                    receiver: {
                      ...d.receiver,
                      reconnect: { ...d.receiver.reconnect, enabled: v },
                    },
                  }),
                  true,
                )
              }
            />
            <Field label="INITIAL RETRY DELAY MS" hint="MS">
              <Stepper
                value={draft.receiver.reconnect.initialDelayMs}
                onChange={(v) =>
                  mutate(
                    (d) => ({
                      ...d,
                      receiver: {
                        ...d.receiver,
                        reconnect: { ...d.receiver.reconnect, initialDelayMs: v },
                      },
                    }),
                    true,
                  )
                }
                min={0}
                max={60000}
                step={100}
              />
            </Field>
            <Field label="MAXIMUM RETRY DELAY MS" hint="MS">
              <Stepper
                value={draft.receiver.reconnect.maxDelayMs}
                onChange={(v) =>
                  mutate(
                    (d) => ({
                      ...d,
                      receiver: {
                        ...d.receiver,
                        reconnect: { ...d.receiver.reconnect, maxDelayMs: v },
                      },
                    }),
                    true,
                  )
                }
                min={0}
                max={600000}
                step={1000}
              />
            </Field>
            <Field label="BACKOFF MULTIPLIER" hint="FLOAT">
              <input
                type="number"
                step="0.1"
                min={1}
                max={10}
                value={draft.receiver.reconnect.backoffMultiplier}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n)) {
                    mutate(
                      (d) => ({
                        ...d,
                        receiver: {
                          ...d.receiver,
                          reconnect: { ...d.receiver.reconnect, backoffMultiplier: n },
                        },
                      }),
                      false,
                    );
                  }
                }}
                onBlur={flushPending}
              />
            </Field>
          </Accordion>

          <Accordion title="WEB UI & LOGGING" meta="6 fields">
            <Field label="SERVER HOST" hint="BIND ADDRESS">
              <input
                type="text"
                value={draft.server.host}
                onChange={(e) => {
                  const v = e.target.value;
                  mutate((d) => ({ ...d, server: { ...d.server, host: v } }), false);
                }}
                onBlur={flushPending}
              />
            </Field>
            <Field label="SERVER PORT" hint="TCP">
              <Stepper
                value={draft.server.port}
                onChange={(v) =>
                  mutate((d) => ({ ...d, server: { ...d.server, port: v } }), true)
                }
                min={1}
                max={65535}
                step={1}
              />
            </Field>
            <Field label="LOGGING LEVEL" hint="VERBOSITY">
              <select
                value={draft.logging.level}
                onChange={(e) => {
                  const v = e.target.value as LogLevel;
                  mutate((d) => ({ ...d, logging: { ...d.logging, level: v } }), true);
                }}
              >
                {LOG_LEVELS.map((m) => (
                  <option key={m} value={m}>
                    {LOG_LEVEL_LABELS[m]}
                  </option>
                ))}
              </select>
            </Field>
            <ToggleRow
              label="WRITE JSON LOGS"
              sub="Structured machine-readable logs"
              on={draft.logging.json}
              onChange={(v) =>
                mutate((d) => ({ ...d, logging: { ...d.logging, json: v } }), true)
              }
            />
            <Field label="MAXIMUM LOG FILES" hint="ROTATION">
              <Stepper
                value={draft.logging.maxFiles}
                onChange={(v) =>
                  mutate((d) => ({ ...d, logging: { ...d.logging, maxFiles: v } }), true)
                }
                min={1}
                max={100}
                step={1}
              />
            </Field>
            <Field label="MAXIMUM LOG SIZE MB" hint="PER FILE">
              <Stepper
                value={draft.logging.maxSizeMb}
                onChange={(v) =>
                  mutate((d) => ({ ...d, logging: { ...d.logging, maxSizeMb: v } }), true)
                }
                min={1}
                max={1024}
                step={1}
              />
            </Field>
          </Accordion>

          <Accordion title="DEVICE & DISPLAY" meta="3 fields">
            <ToggleRow
              label="FULLSCREEN OUTPUT"
              sub="Render fullscreen on HDMI"
              on={draft.display.fullscreen}
              onChange={(v) =>
                mutate((d) => ({ ...d, display: { ...d.display, fullscreen: v } }), true)
              }
            />
            <Field label="HDMI OUTPUT HINT" hint="OPTIONAL">
              <input
                type="text"
                placeholder="auto"
                value={draft.display.hdmiOutputHint}
                onChange={(e) => {
                  const v = e.target.value;
                  mutate((d) => ({ ...d, display: { ...d.display, hdmiOutputHint: v } }), false);
                }}
                onBlur={flushPending}
              />
            </Field>
            <Field label="DEVICE NAME" hint="APPLIANCE LABEL">
              <input
                type="text"
                value={draft.device.name}
                onChange={(e) => {
                  const v = e.target.value;
                  mutate((d) => ({ ...d, device: { ...d.device, name: v } }), false);
                }}
                onBlur={flushPending}
              />
            </Field>
          </Accordion>
        </div>
      )}
    </>
  );
}
