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

  // Re-sync draft when the upstream config reference changes (after save).
  useEffect(() => {
    if (config) setDraft(cloneConfig(config));
  }, [config]);

  if (!draft || !config) {
    return (
      <section className="panel">
        <p className="note">Loading configuration…</p>
      </section>
    );
  }

  const isUnchanged = JSON.stringify(draft) === JSON.stringify(config);

  // Targeted setters
  const setReceiver = (patch: Partial<AppConfig['receiver']>) =>
    setDraft((d) => (d ? { ...d, receiver: { ...d.receiver, ...patch } } : d));
  const setReconnect = (patch: Partial<AppConfig['receiver']['reconnect']>) =>
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
  const setServer = (patch: Partial<AppConfig['server']>) =>
    setDraft((d) => (d ? { ...d, server: { ...d.server, ...patch } } : d));
  const setLogging = (patch: Partial<AppConfig['logging']>) =>
    setDraft((d) => (d ? { ...d, logging: { ...d.logging, ...patch } } : d));
  const setDisplay = (patch: Partial<AppConfig['display']>) =>
    setDraft((d) => (d ? { ...d, display: { ...d.display, ...patch } } : d));
  const setDevice = (patch: Partial<AppConfig['device']>) =>
    setDraft((d) => (d ? { ...d, device: { ...d.device, ...patch } } : d));

  async function handleSave() {
    if (!draft) return;
    await run(async () => {
      const updated = await api.putConfig(draft);
      setConfig(updated);
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
      <option value="contain">contain — keep aspect, may letterbox</option>
      <option value="cover">cover — fill display, may crop</option>
      <option value="stretch">stretch — fill without preserving ratio</option>
    </select>
  );

  const colorSelect = (
    <select
      value={draft.receiver.colorFormat}
      onChange={(e) => setReceiver({ colorFormat: e.target.value as ColorFormat })}
    >
      <option value="fastest">fastest — recommended for Pi 5</option>
      <option value="uyvy">uyvy</option>
      <option value="rgba">rgba</option>
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
              <PreviewAccordion
                title="RECONNECT STRATEGY"
                meta="4 fields"
                onClick={() => setMode('advanced')}
              />
              <PreviewAccordion
                title="WEB UI & LOGGING"
                meta="6 fields"
                onClick={() => setMode('advanced')}
              />
              <PreviewAccordion
                title="DEVICE & DISPLAY"
                meta="3 fields"
                onClick={() => setMode('advanced')}
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
                <option value="highest">highest — request full quality</option>
                <option value="lowest">lowest — proxy stream, easier on Pi 5</option>
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
                <option value="trace">trace</option>
                <option value="debug">debug</option>
                <option value="info">info</option>
                <option value="warn">warn</option>
                <option value="error">error</option>
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
          disabled={busy || isUnchanged}
          onClick={handleSave}
        >
          ◇ SAVE SETTINGS
        </Button>
      </div>
    </>
  );
}

interface PreviewAccordionProps {
  title: string;
  meta: string;
  onClick: () => void;
}
function PreviewAccordion({ title, meta, onClick }: PreviewAccordionProps) {
  return (
    <button
      className="accordion"
      type="button"
      onClick={onClick}
      style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
    >
      <div className="accordion-head" style={{ pointerEvents: 'none' }}>
        <span>◇ {title}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              fontFamily: 'var(--ff-mono)',
              fontSize: 9,
              letterSpacing: '0.15em',
              color: 'var(--fg-mute)',
            }}
          >
            {meta}
          </span>
          <span className="chev" aria-hidden="true">
            ＋
          </span>
        </span>
      </div>
    </button>
  );
}
