// TopBar.jsx
// App title, live/offline indicator dot, clock display

function TopBar({ isLive, time, date }) {
  return (
    <div style={topBarStyles.bar}>
      <div style={topBarStyles.left}>
        <div style={topBarStyles.title}>Cafeteria Monitor</div>
        <div style={topBarStyles.liveRow}>
          <div style={{
            ...topBarStyles.dot,
            background: isLive ? '#00e5a0' : '#ff4d6d',
            animation: isLive ? 'pulse 2s infinite' : 'none',
          }} />
          <span style={topBarStyles.liveText}>
            {isLive ? 'Live' : 'Biostar2 offline'}
          </span>
        </div>
      </div>
      <div style={topBarStyles.right}>
        <div style={topBarStyles.clock}>{time}</div>
        <div style={topBarStyles.date}>{date}</div>
      </div>
    </div>
  );
}

const topBarStyles = {
  bar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px 12px',
    borderBottom: '1px solid #2a2a3a',
    background: '#111118',
    flexShrink: 0,
  },
  left: { display: 'flex', flexDirection: 'column' },
  title: {
    fontFamily: "'Syne', sans-serif",
    fontSize: 18,
    fontWeight: 800,
    letterSpacing: '-0.3px',
    color: '#e8e8f0',
  },
  liveRow: {
    display: 'flex', alignItems: 'center', gap: 6,
    fontFamily: "'DM Mono', monospace",
    fontSize: 11, color: '#6b6b88', marginTop: 2,
  },
  dot: { width: 6, height: 6, borderRadius: '50%' },
  liveText: {},
  right: { textAlign: 'right' },
  clock: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 22, fontWeight: 500,
    color: '#e8e8f0', letterSpacing: '1px',
  },
  date: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 11, color: '#6b6b88', marginTop: 2,
  },
};

Object.assign(window, { TopBar });
