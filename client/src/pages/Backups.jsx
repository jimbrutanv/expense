import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../api.js';
import { Loading, Badge, ConfirmModal, useToast } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { fmtDateTime, fmtBytes } from '../format.js';

export default function Backups() {
  const toast = useToast();
  const [backups, setBackups] = useState(null);
  const [busy, setBusy] = useState('');
  const [deleting, setDeleting] = useState(null);
  const [restoring, setRestoring] = useState(null);
  const fileRef = useRef();

  const load = useCallback(async () => { const { backups } = await api.get('/backups'); setBackups(backups); }, []);
  useEffect(() => { load(); }, [load]);

  const createBackup = async () => {
    setBusy('create');
    try { await api.post('/backups', { note: 'manual' }); toast.success('Backup created'); load(); }
    catch (e) { toast.error(e.message); } finally { setBusy(''); }
  };
  const downloadNow = async () => {
    setBusy('download');
    try { await api.download('/backups/download-now'); toast.success('Snapshot downloaded'); load(); }
    catch (e) { toast.error(e.message); } finally { setBusy(''); }
  };
  const onPickRestore = (e) => { const file = e.target.files[0]; if (file) setRestoring(file); if (fileRef.current) fileRef.current.value = ''; };

  if (!backups) return <Loading />;

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>Backups &amp; Data</h1><div className="sub">Automatic daily snapshots, manual backups, exports and restore</div></div>
      </div>

      <div className="grid-3">
        <Action icon="save" title="Manual Backup" desc="Create a server-side snapshot now." btn="Create backup" busy={busy === 'create'} onClick={createBackup} />
        <Action icon="download" title="Download Snapshot" desc="Create & download a .db backup file." btn="Download now" busy={busy === 'download'} onClick={downloadNow} />
        <Action icon="file" title="Export Data (JSON)" desc="Portable JSON of all data (no passwords)." btn="Export JSON" onClick={() => api.download('/backups/export.json')} />
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Restore from backup</h3>
        </div>
        <div className="card-pad flex between wrap">
          <div className="soft" style={{ fontSize: 13, maxWidth: 520 }}>
            Upload a <code>.db</code> snapshot to replace all current data. A safety snapshot of the present state is taken automatically before restoring.
          </div>
          <input ref={fileRef} type="file" accept=".db,.sqlite" hidden onChange={onPickRestore} />
          <button className="btn btn-danger" onClick={() => fileRef.current?.click()}><Icon name="restore" size={15} />Restore from file…</button>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Backup history</h3><Badge color="gray">{backups.length}</Badge></div>
        {backups.length === 0 ? <div className="card-pad muted">No backups yet.</div> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Created</th><th>Type</th><th>Size</th><th>By</th><th>Note</th><th></th></tr></thead>
              <tbody>
                {backups.map((b) => (
                  <tr key={b.id}>
                    <td>{fmtDateTime(b.created_at)}</td>
                    <td><Badge color={b.kind === 'auto' ? 'blue' : 'amber'}>{b.kind}</Badge></td>
                    <td>{fmtBytes(b.size)}</td>
                    <td className="muted">{b.created_by_name || 'system'}</td>
                    <td className="muted">{b.note}</td>
                    <td><div className="row-actions">
                      {b.exists
                        ? <button className="btn btn-icon" title="Download" onClick={() => api.download(`/backups/${b.id}/download`)}><Icon name="download" size={16} /></button>
                        : <span className="muted" style={{ fontSize: 12 }}>file missing</span>}
                      <button className="btn btn-icon btn-ghost" title="Delete" onClick={() => setDeleting(b)}><Icon name="trash" size={16} /></button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {deleting && <ConfirmModal title="Delete backup" danger confirmLabel="Delete"
        message={`Delete backup "${deleting.filename}"? The snapshot file will be removed.`}
        onClose={() => setDeleting(null)}
        onConfirm={async () => { try { await api.del(`/backups/${deleting.id}`); toast.success('Backup deleted'); setDeleting(null); load(); } catch (e) { toast.error(e.message); } }} />}

      {restoring && <RestoreConfirm file={restoring} onClose={() => setRestoring(null)} onDone={() => { setRestoring(null); load(); }} />}
    </div>
  );
}

function Action({ icon, title, desc, btn, onClick, busy }) {
  return (
    <div className="card card-pad stack" style={{ gap: 12 }}>
      <div style={{ width: 42, height: 42, borderRadius: 11, background: 'var(--brand-soft)', color: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={22} />
      </div>
      <div><b>{title}</b><div className="muted" style={{ fontSize: 13 }}>{desc}</div></div>
      <button className="btn btn-primary btn-sm" onClick={onClick} disabled={busy}>{busy ? 'Working…' : btn}</button>
    </div>
  );
}

function RestoreConfirm({ file, onClose, onDone }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const restore = async () => {
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const r = await api.postForm('/backups/restore', form);
      toast.success(r.message || 'Restored');
      onDone();
      setTimeout(() => window.location.reload(), 800);
    } catch (e) { toast.error(e.message); setBusy(false); }
  };
  return (
    <ConfirmModal title="Restore database" danger confirmLabel="Restore & overwrite"
      message={`Restore from "${file.name}"? This REPLACES all current data with the backup's contents. A safety snapshot is taken first.`}
      busy={busy} onClose={onClose} onConfirm={restore} />
  );
}
