import { useEffect, useState } from 'react';
import {
  Accordion,
  Button,
  Field,
  SectionLabel,
  SegmentSwitch,
  Stepper,
  ToggleRow,
} from '../components/primitives.tsx';
import { useAppState } from '../state/AppState.tsx';
import { useControlAction } from '../utils/useControlAction.ts';
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
  const { busy, run } = useControlAction();
  const [mode, setMode] = useState<Mode>('quick');
  const [draft, setDraft] = useState<AppConfig | null>(config ? cloneConfig(config) : null);
  const [dirty, setDirty] = useState(false);

  // Re-sync draft when the upstream config reference changes (after save or external update).
  // Incoming config = new baseline = nothing pending.
  useEffect(() => {
    if (config) {
      setDraft(cloneConfig(config));
      setDirty(false);
    }
  }, [config]);

  if (!draft || !config) {
    return (
      <section className="panel">
        <p className="note">Loading configuration…</p>
      </section>
    );
  }

  // Targeted setters — every mutation marks the draft as dirty.
  const setReceiver = (patch: Partial<AppConfig['receiver']>) => {
    setDraft((d) => (d ? { ...d, receiver: { ...d.receiver, ...patch } } : d));
    setDirty(true);
  };
  const setReconnect = (patch: Partial<AppConfig['receiver']['reconnect']>) => {
    setDraft((d) =>
      d
        ? {
            ...d,
            receiver: {
              ...d.receiver,
              reconnect: { ...d.receiver.reconnect, ...patch },
            },
          }
        : d,
    );
    setDirty(true);
  };
  const setServer = (patch: Partial<AppConfig['server']>) => {
    setDraft((d) => (d ? { ...d, server: { ...d.server, ...patch } } : d));
    setDirty(true);
  };
  const setLogging = (patch: Partial<AppConfig['logging']>) => {
    setDraft((d) => (d ? { ...d, logging: { ...d.logging, ...patch } } : d));
    setDirty(true);
  };
  const setDisplay = (patch: Partial<AppConfig['display']>) => {
    setDraft((d) => (d ? { ...d, display: { ...d.display, ...patch } } : d));
    setDirty(true);
  };
  const setDevice = (patch: Partial<AppConfig['device']>) => {
    setDraft((d) => (d ? { ...d, device: { ...d.device, ...patch } } : d));
    setDirty(true);
  };

  async function handleSave() {
    if (!draft) return;
    await run(async () => {
      const updated = await api.putConfig(draft);
      setConfig(updated);
      setDraft(cloneConfig(updated));
      setDirty(false);
    }, 'Settings saved');
  }

  const sourceInput = (
    <input
      type="text"
      value={draft.receiver.sourceName}
      onChange={(e) => setReceiver({ sourceName: e.target.value })}
    />
  );

  const scaleSelect = (
    <select
      value={draft.receiver.scaleMode}
      onChange={(e) => setReceiver({ scaleMode: e.target.value as ScaleMode })}
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
      onChange={(e) => setReceiver({ colorFormat: e.target.value as ColorFormat })}
    >
      {COLOR_FORMATS.map((m) => (
        <option key={m} value={m}>
          {COLOR_FORMAT_LABELS[m]}
        </option>
      ))}
    </select>
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
              onChange={(v) => setReceiver({ lowLatencyMode: v })}
            />
            <ToggleRow
              label="START ON BOOT"
              sub="Auto-connect after appliance reboots"
              on={draft.receiver.autoStart}
              onChange={(v) => setReceiver({ autoStart: v })}
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
                onChange={(e) =>
                  setReceiver({ bandwidthMode: e.target.value as BandwidthMode })
                }
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
              onChange={(v) => setReceiver({ audioEnabled: v })}
            />
            <Field label="OUTPUT FPS CAP" hint="0 = UNLIMITED">
              <Stepper
                value={draft.receiver.outputFpsCap}
                onChange={(v) => setReceiver({ outputFpsCap: v })}
                min={0}
                max={120}
                step={1}
              />
            </Field>
            <ToggleRow
              label="LOW LATENCY MODE"
              sub="Skip prebuffering · drops fewer frames"
              on={draft.receiver.lowLatencyMode}
              onChange={(v) => setReceiver({ lowLatencyMode: v })}
            />
            <ToggleRow
              label="START ON BOOT"
              sub="Auto-connect after appliance reboots"
              on={draft.receiver.autoStart}
              onChange={(v) => setReceiver({ autoStart: v })}
            />
          </Accordion>

          <Accordion title="RECONNECT STRATEGY" meta="4 fields">
            <ToggleRow
              label="AUTOMATIC RECONNECT"
              sub="Retry on disconnect with backoff"
              on={draft.receiver.reconnect.enabled}
              onChange={(v) => setReconnect({ enabled: v })}
            />
            <Field label="INITIAL RETRY DELAY MS" hint="MS">
              <Stepper
                value={draft.receiver.reconnect.initialDelayMs}
                onChange={(v) => setReconnect({ initialDelayMs: v })}
                min={0}
                max={60000}
                step={100}
              />
            </Field>
            <Field label="MAXIMUM RETRY DELAY MS" hint="MS">
              <Stepper
                value={draft.receiver.reconnect.maxDelayMs}
                onChange={(v) => setReconnect({ maxDelayMs: v })}
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
                  if (Number.isFinite(n)) setReconnect({ backoffMultiplier: n });
                }}
              />
            </Field>
          </Accordion>

          <Accordion title="WEB UI & LOGGING" meta="6 fields">
            <Field label="SERVER HOST" hint="BIND ADDRESS">
              <input
                type="text"
                value={draft.server.host}
                onChange={(e) => setServer({ host: e.target.value })}
              />
            </Field>
            <Field label="SERVER PORT" hint="TCP">
              <Stepper
                value={draft.server.port}
                onChange={(v) => setServer({ port: v })}
                min={1}
                max={65535}
                step={1}
              />
            </Field>
            <Field label="LOGGING LEVEL" hint="VERBOSITY">
              <select
                value={draft.logging.level}
                onChange={(e) => setLogging({ level: e.target.value as LogLevel })}
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
              onChange={(v) => setLogging({ json: v })}
            />
            <Field label="MAXIMUM LOG FILES" hint="ROTATION">
              <Stepper
                value={draft.logging.maxFiles}
                onChange={(v) => setLogging({ maxFiles: v })}
                min={1}
                max={100}
                step={1}
              />
            </Field>
            <Field label="MAXIMUM LOG SIZE MB" hint="PER FILE">
              <Stepper
                value={draft.logging.maxSizeMb}
                onChange={(v) => setLogging({ maxSizeMb: v })}
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
              onChange={(v) => setDisplay({ fullscreen: v })}
            />
            <Field label="HDMI OUTPUT HINT" hint="OPTIONAL">
              <input
                type="text"
                placeholder="auto"
                value={draft.display.hdmiOutputHint}
                onChange={(e) => setDisplay({ hdmiOutputHint: e.target.value })}
              />
            </Field>
            <Field label="DEVICE NAME" hint="APPLIANCE LABEL">
              <input
                type="text"
                value={draft.device.name}
                onChange={(e) => setDevice({ name: e.target.value })}
              />
            </Field>
          </Accordion>
        </div>
      )}

      {isReceiverRunning(status) && (
        <p className="note">
          Receiver is running — saving will trigger a controlled restart.
        </p>
      )}

      <div style={{ marginTop: 16 }}>
        <Button
          variant="primary"
          full
          disabled={busy || !dirty}
          onClick={handleSave}
        >
          ◇ SAVE SETTINGS
        </Button>
      </div>
    </>
  );
}
