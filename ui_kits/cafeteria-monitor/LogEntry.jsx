// LogEntry.jsx
// Single scan log row — allow (ok), allow (standard), deny (duplicate)

function LogEntry({ log, isNew }) {
  const isAllow = log.allowed;
  const isDuplicate = log.reason === 'duplicate';

  return (
    <div style={{
      ...logStyles.entry,
      background: isAllow ? '#111118' : '#1a1a24',
      borderColor: isAllow ? 'rgba(0,229,160,0.2)' : 'rgba(255,77,109,0.2)',
      animation: isNew ? 'slideIn 0.2s ease' : 'none',
    }}>
      <div style={{
        ...logStyles.icon,
        background: isAllow ? 'rgba(0,229,160,0.12)' : 'rgba(255,77,109,0.12)',
        color: isAllow ? '#00e5a0' : '#ff4d6d',
      }}>
        {isAllow ? '✓' : '✗'}
      </div>
      <div style={logStyles.body}>
        <div style={logStyles.name}>
          {log.userName}
          <span style={logStyles.uid}> ({log.userId})</span>
        </div>
        <div style={logStyles.meta}>
          <span style={{
            ...logStyles.tag,
            background: isDuplicate ? 'rgba(255,77,109,0.12)' : 'rgba(0,229,160,0.12)',
            color: isDuplicate ? '#ff4d6d' : '#00e5a0',
          }}>
            {isDuplicate ? 'Duplicate' : 'OK'}
          </span>
          <span style={logStyles.metaText}>{log.slotLabel ?? '—'}</span>
        </div>
      </div>
      <div style={logStyles.device}>{log.deviceName}</div>
      <div style={logStyles.time}>{formatLogTime(log.timestamp)}</div>
    </div>
  );
}

function formatLogTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

const logStyles = {
  entry: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 14px',
    borderRadius: 8,
    border: '1px solid transparent',
  },
  icon: {
    width: 28, height: 28,
    borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 13, flexShrink: 0,
  },
  body: { flex: 1, minWidth: 0 },
  name: {
    fontSize: 14, fontWeight: 600, color: '#e8e8f0',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  uid: { color: '#6b6b88', fontSize: 12, fontWeight: 400 },
  meta: { display: 'flex', gap: 8, marginTop: 2, alignItems: 'center' },
  tag: {
    padding: '1px 6px', borderRadius: 3,
    fontSize: 10, fontWeight: 600,
    letterSpacing: '0.5px', textTransform: 'uppercase',
    fontFamily: "'Inter', sans-serif",
  },
  metaText: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 11, color: '#6b6b88',
  },
  device: {
    fontSize: 11, fontWeight: 600,
    padding: '2px 8px', borderRadius: 4,
    background: '#1a1a24', color: '#6b6b88',
    flexShrink: 0,
    fontFamily: "'Inter', sans-serif",
  },
  time: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 12, color: '#3a3a52',
    flexShrink: 0,
  },
};

Object.assign(window, { LogEntry });
