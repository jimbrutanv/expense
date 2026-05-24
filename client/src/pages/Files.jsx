import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useProject } from './ProjectLayout.jsx';
import { Loading, Empty, ConfirmModal, useToast } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { fmtBytes, fmtDateTime } from '../format.js';

export default function Files() {
  const { projectId } = useParams();
  const { access } = useProject();
  const toast = useToast();
  const canEdit = access.isAdmin || access.level === 'collaborator' || access.level === 'manager';
  const [files, setFiles] = useState(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const fileRef = useRef();

  const load = useCallback(async () => { setFiles((await api.get(`/projects/${projectId}/files`)).files); }, [projectId]);
  useEffect(() => { load(); }, [load]);

  const onPick = async (e) => {
    const list = Array.from(e.target.files || []);
    if (!list.length) return;
    setBusy(true);
    try {
      for (const file of list) {
        const form = new FormData();
        form.append('file', file);
        await api.postForm(`/projects/${projectId}/files`, form);
      }
      toast.success(`Uploaded ${list.length} file(s)`);
      load();
    } catch (err) { toast.error(err.message); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  if (!files) return <Loading />;

  return (
    <div className="stack">
      <div className="flex between wrap">
        <h2 className="sec-head"><Icon name="paperclip" size={18} /> Files &amp; Receipts <span className="muted" style={{ fontWeight: 400, fontSize: 14 }}>· {files.length}</span></h2>
        {canEdit && (
          <>
            <input ref={fileRef} type="file" multiple hidden onChange={onPick} />
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => fileRef.current?.click()}><Icon name="upload" size={15} />{busy ? 'Uploading…' : 'Upload Files'}</button>
          </>
        )}
      </div>

      {files.length === 0 ? (
        <div className="card"><Empty icon="paperclip" title="No files yet">{canEdit ? 'Upload receipts, invoices, contracts and site photos. Stored securely with the project.' : 'No files uploaded.'}</Empty></div>
      ) : (
        <div className="card table-wrap">
          <table className="tbl cards">
            <thead><tr><th>File</th><th>Size</th><th>Uploaded by</th><th>When</th><th></th></tr></thead>
            <tbody>
              {files.map((f) => (
                <tr key={f.id}>
                  <td data-label="File">
                    <div className="flex" style={{ gap: 9 }}>
                      <Icon name="file" size={17} style={{ color: 'var(--text-muted)' }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 500 }}>{f.original_name}</div>
                        {f.expense_ref && <div className="muted" style={{ fontSize: 11.5 }}>linked to {f.expense_ref}</div>}
                      </div>
                    </div>
                  </td>
                  <td data-label="Size" className="muted">{fmtBytes(f.size)}</td>
                  <td data-label="Uploaded by" className="muted">{f.uploaded_by_name || '—'}</td>
                  <td data-label="When" className="muted">{fmtDateTime(f.created_at)}</td>
                  <td data-label="">
                    <div className="row-actions">
                      <button className="btn btn-icon" title="Download" onClick={() => api.download(`/projects/${projectId}/files/${f.id}/download`, f.original_name)}><Icon name="download" size={16} /></button>
                      {canEdit && <button className="btn btn-icon btn-ghost" title="Delete" onClick={() => setDeleting(f)}><Icon name="trash" size={16} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deleting && <ConfirmModal title="Delete file" danger confirmLabel="Delete" message={`Delete "${deleting.original_name}"? This removes the file permanently.`}
        onClose={() => setDeleting(null)}
        onConfirm={async () => { try { await api.del(`/projects/${projectId}/files/${deleting.id}`); toast.success('File deleted'); setDeleting(null); load(); } catch (e) { toast.error(e.message); } }} />}
    </div>
  );
}
