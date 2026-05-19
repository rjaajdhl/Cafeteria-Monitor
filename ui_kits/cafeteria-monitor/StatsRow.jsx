// StatsRow.jsx
// Three stat cards: Allowed, Denied, Total

function StatsRow({ allowed, denied, total }) {
  return (
    <div style={statsRowStyles.row}>
      <StatCard label="Allowed" value={allowed} valueColor="#00e5a0" />
      <StatCard label="Denied"  value={denied}  valueColor="#ff4d6d" />
      <StatCard label="Total"   value={total}   valueColor="#e8e8f0" />
    </div>
  );
}

function StatCard({ label, value, valueColor }) {
  return (
    <div style={statsRowStyles.card}>
      <div style={statsRowStyles.label}>{label}</div>
      <div style={{ ...statsRowStyles.value, color: valueColor }}>{value}</div>
    </div>
  );
}

const statsRowStyles = {
  row: {
    display: 'flex',
    gap: 10,
    padding: '0 20px 12px',
    flexShrink: 0,
  },
  card: {
    flex: 1,
    background: '#111118',
    border: '1px solid #2a2a3a',
    borderRadius: 8,
    padding: '10px 14px',
  },
  label: {
    fontSize: 10, fontWeight: 600,
    letterSpacing: '0.8px',
    textTransform: 'uppercase',
    color: '#6b6b88',
  },
  value: {
    fontFamily: "'DM Mono', monospace",
    fontSize: 24, fontWeight: 500,
    marginTop: 2,
  },
};

Object.assign(window, { StatsRow, StatCard });
