import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { Loading } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const EV_CLASS = { task: 'ev-task', income: 'ev-income', expense: 'ev-expense' };

function ym(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }

export default function Calendar() {
  const navigate = useNavigate();
  const [month, setMonth] = useState(ym(new Date()));
  const [events, setEvents] = useState(null);

  useEffect(() => { setEvents(null); api.get(`/calendar?month=${month}`).then((d) => setEvents(d.events)).catch(() => setEvents([])); }, [month]);

  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const daysInMonth = new Date(y, m, 0).getDate();
  const startWd = first.getDay();
  const todayStr = new Date().toISOString().slice(0, 10);

  const byDay = {};
  (events || []).forEach((e) => { (byDay[e.date] = byDay[e.date] || []).push(e); });

  const shift = (delta) => { const d = new Date(y, m - 1 + delta, 1); setMonth(ym(d)); };
  const cells = [];
  for (let i = 0; i < startWd; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const monthLabel = first.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>Calendar</h1><div className="sub">Task deadlines, payments received and expenses</div></div>
        <div className="flex">
          <button className="btn btn-icon" onClick={() => shift(-1)} aria-label="Previous"><Icon name="chevrons-left" size={16} /></button>
          <button className="btn btn-sm" onClick={() => setMonth(ym(new Date()))}>Today</button>
          <button className="btn btn-icon" onClick={() => shift(1)} aria-label="Next"><Icon name="chevrons-right" size={16} /></button>
        </div>
      </div>

      <div className="flex wrap" style={{ gap: 14, fontSize: 12.5 }}>
        <h2 className="sec-head" style={{ fontSize: 18, marginRight: 8 }}><Icon name="calendar" size={18} /> {monthLabel}</h2>
        <span className="flex" style={{ gap: 5 }}><span className="cal-dot ev-task" /> Tasks</span>
        <span className="flex" style={{ gap: 5 }}><span className="cal-dot ev-income" /> Payments</span>
        <span className="flex" style={{ gap: 5 }}><span className="cal-dot ev-expense" /> Expenses</span>
      </div>

      {!events ? <Loading /> : (
        <div className="card card-pad">
          <div className="cal-grid cal-head">{WD.map((w) => <div key={w} className="cal-wd">{w}</div>)}</div>
          <div className="cal-grid">
            {cells.map((d, i) => {
              if (d === null) return <div key={`b${i}`} className="cal-cell cal-empty" />;
              const date = `${month}-${String(d).padStart(2, '0')}`;
              const evs = byDay[date] || [];
              return (
                <div key={date} className={`cal-cell ${date === todayStr ? 'cal-today' : ''}`}>
                  <div className="cal-day-num">{d}</div>
                  <div className="cal-events">
                    {evs.slice(0, 4).map((e, j) => (
                      <div key={j} className={`cal-ev ${EV_CLASS[e.type]}`} title={`${e.title} · ${e.sub}`} onClick={() => navigate(e.to)}>
                        {e.title}
                      </div>
                    ))}
                    {evs.length > 4 && <div className="cal-more">+{evs.length - 4} more</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
