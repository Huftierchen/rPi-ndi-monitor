import { useEffect, useRef, useState } from 'react';
import { useAppState } from '../state/AppState.tsx';
import { LogLine, SectionLabel, SegmentSwitch } from '../components/primitives.tsx';
import type { LogEntry, LogScope } from '../api/types.ts';

export function Logs() {
  const { webLog, receiverLog } = useAppState();
  const [scope, setScope] = useState<LogScope>('web');
  const entries = scope === 'web' ? webLog : receiverLog;

  return (
    <>
      <div>
        <SectionLabel right="◇ STREAM · LIVE">LOG STREAM</SectionLabel>
        <SegmentSwitch<LogScope>
          options={[
            { value: 'web', label: '◇ WEB CTRL' },
            { value: 'receiver', label: '◇ RECEIVER' },
          ]}
          value={scope}
          onChange={setScope}
        />
      </div>

      <LogPanel scope={scope} entries={entries} />

      <p className="note">
        Logs stream live over SSE. Web entries come from the Fastify control plane; receiver entries are emitted by the native C++ child process.
      </p>
    </>
  );
}

function LogPanel({ scope, entries }: { scope: LogScope; entries: LogEntry[] }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Reset auto-scroll state when switching tabs.
  useEffect(() => {
    setAutoScroll(true);
    const el = boxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [scope]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    if (autoScroll) {
      el.scrollTop = el.scrollHeight;
    }
  }, [entries, autoScroll]);

  function handleScroll(): void {
    const el = boxRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(nearBottom);
  }

  function jumpToLatest(): void {
    const el = boxRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setAutoScroll(true);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="log-controls">
        <span className="filter">
          {entries.length}/500 LINES · {scope.toUpperCase()}
        </span>
        <a
          className="btn sm ghost-cyan"
          href={`/api/logs/download?scope=${scope}`}
          download
        >
          ⇩ DOWNLOAD
        </a>
      </div>
      <div className="log-box" ref={boxRef} onScroll={handleScroll}>
        {entries.length === 0 ? (
          <div style={{ color: 'var(--fg-mute)' }}>No log entries yet.</div>
        ) : (
          entries.map((entry, idx) => (
            <LogLine
              key={`${entry.timestamp}-${idx}`}
              ts={entry.timestamp}
              lv={mapLogLevel(entry.level)}
              msg={entry.message}
            />
          ))
        )}
      </div>
      {!autoScroll && entries.length > 0 && (
        <button
          onClick={jumpToLatest}
          className="btn sm ghost-cyan"
          style={{ alignSelf: 'flex-end' }}
        >
          ↓ JUMP TO LATEST
        </button>
      )}
    </div>
  );
}

function mapLogLevel(level: LogEntry['level']): 'INFO' | 'WARN' | 'ERROR' | 'OK' {
  switch (level) {
    case 'warn':
      return 'WARN';
    case 'error':
      return 'ERROR';
    case 'trace':
    case 'debug':
    case 'info':
    default:
      return 'INFO';
  }
}
