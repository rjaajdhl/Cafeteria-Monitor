// TabBar.jsx
// Slot tabs (All / Breakfast / Lunch / Dinner) + scrollable device tabs

function SlotTabs({ slots, active, onSelect }) {
  return (
    <div style={tabStyles.slotWrap}>
      {[{ name: 'all', label: 'All' }, ...slots].map(s => {
        const isActive = active === s.name;
        const isAll = s.name === 'all';
        const activeColor = isAll ? '#00e5a0' : '#f5c842';
        return (
          <div
            key={s.name}
            onClick={() => onSelect(s.name)}
            style={{
              ...tabStyles.slotTab,
              color: isActive ? activeColor : '#6b6b88',
              borderBottom: `2px solid ${isActive ? activeColor : 'transparent'}`,
              cursor: 'pointer',
            }}
          >
            {s.label || s.name.charAt(0).toUpperCase() + s.name.slice(1)}
          </div>
        );
      })}
    </div>
  );
}

function DeviceTabs({ devices, active, onSelect }) {
  return (
    <div style={tabStyles.deviceWrap}>
      {[{ id: 'all', name: 'All Stations' }, ...devices].map(d => {
        const isActive = active === d.id;
        return (
          <div
            key={d.id}
            onClick={() => onSelect(d.id)}
            style={{
              ...tabStyles.deviceTab,
              background: isActive ? 'rgba(0,229,160,0.12)' : '#111118',
              borderColor: isActive ? '#00e5a0' : '#2a2a3a',
              color: isActive ? '#00e5a0' : '#6b6b88',
              cursor: 'pointer',
            }}
          >
            {d.name}
          </div>
        );
      })}
    </div>
  );
}

const tabStyles = {
  slotWrap: {
    display: 'flex',
    gap: 0,
    padding: '10px 20px 0',
    background: '#111118',
    borderBottom: '1px solid #2a2a3a',
    flexShrink: 0,
  },
  slotTab: {
    padding: '8px 18px',
    fontSize: 12, fontWeight: 600,
    letterSpacing: '0.8px',
    textTransform: 'uppercase',
    userSelect: 'none',
    transition: 'color 0.15s, border-color 0.15s',
  },
  deviceWrap: {
    display: 'flex',
    gap: 8,
    padding: '12px 20px',
    background: '#0a0a0f',
    flexShrink: 0,
    overflowX: 'auto',
  },
  deviceTab: {
    flexShrink: 0,
    padding: '8px 20px',
    borderRadius: 6,
    fontSize: 13, fontWeight: 600,
    border: '1px solid',
    userSelect: 'none',
    transition: 'all 0.15s',
  },
};

Object.assign(window, { SlotTabs, DeviceTabs });
