'use client';
import { useState, useEffect } from 'react';
import { useConfirmation } from '@/components/confirmation-dialog';
import { Users, UserPlus, ShieldAlert, CheckCircle2, Trash2 } from 'lucide-react';
import type { StaffAssignment } from './staff-persistence';

export function StaffManager({ eventId, mode }: { eventId: string; mode?: 'demo'|'supabase' }) {
  const confirmAction=useConfirmation();
  const [staffList, setStaffList] = useState<StaffAssignment[]>([]);
  const [nameInput, setNameInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function loadStaff() {
    setLoading(true);
    try {
      const r = await fetch(`/api/organizer/events/${eventId}/staff`);
      if (r.ok) {
        const data = await r.json();
        setStaffList(data.staff ?? []);
      }
    } catch {
      // Gracefully ignore network errors on load
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (eventId) void loadStaff();
  }, [eventId]);

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!nameInput.trim()) return;
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const r = await fetch(`/api/organizer/events/${eventId}/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nameInput.trim() }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? 'Gagal menugaskan petugas.');
      setNameInput('');
      setMessage(`Petugas "${data.assigned?.name ?? nameInput}" berhasil ditugaskan!`);
      if (data.assigned) {
        setStaffList(prev => [data.assigned, ...prev.filter(s => s.userId !== data.assigned.userId)]);
      }
      void loadStaff();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Terjadi kendala.');
    } finally {
      setBusy(false);
    }
  }

  async function handleUnassign(userId: string, name: string) {
    if (!await confirmAction(`"${name}" tidak lagi dapat melakukan check-in untuk event ini.`,{title:'Cabut akses petugas?',confirmLabel:'Cabut akses',destructive:true})) return;
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const r = await fetch(`/api/organizer/events/${eventId}/staff?userId=${encodeURIComponent(userId)}`, {
        method: 'DELETE',
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? 'Gagal mencabut penugasan.');
      setMessage(`Akses petugas untuk "${name}" telah dicabut.`);
      setStaffList(prev => prev.filter(s => s.userId !== userId));
      void loadStaff();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mencabut petugas.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="staff-manager-card" aria-labelledby="staff-heading">
      <div className="staff-manager-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Users size={24} style={{ color: 'var(--purple)' }} />
          <h2 id="staff-heading">Kelola Tim & Petugas Acara</h2>
        </div>
        <p>
          Petugas yang ditugaskan di sini dapat memindai tiket, melihat data peserta masuk, dan mencatat kehadiran di halaman check-in untuk acara ini.
        </p>
      </div>

      {mode!=='supabase'&&<form className="staff-form" onSubmit={handleAssign}>
        <label>
          Nama Petugas atau Identitas
          <input
            type="text"
            placeholder="Contoh: Budi Santoso (Gate 1)"
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            disabled={busy}
            required
            maxLength={100}
          />
        </label>
        <button className="button button-dark" type="submit" disabled={busy || !nameInput.trim()}>
          <UserPlus size={16} />
          {busy ? 'Menugaskan...' : 'Tugaskan Petugas'}
        </button>
      </form>}

      {message && (
        <p className="editor-message" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }} role="status">
          <CheckCircle2 size={18} style={{ color: '#2e7d32' }} />
          {message}
        </p>
      )}
      {error && (
        <p className="form-error" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }} role="alert">
          <ShieldAlert size={18} />
          {error}
        </p>
      )}

      <div className="staff-list-container">
        <h3 style={{ fontSize: '1.1rem', marginBottom: '12px' }}>
          Daftar Petugas Ditugaskan ({staffList.length})
        </h3>

        {loading ? (
          <p style={{ color: 'var(--muted)', fontSize: '13px' }}>Memuat daftar petugas...</p>
        ) : staffList.length === 0 ? (
          <div className="staff-empty">
            <p>Belum ada petugas khusus yang ditugaskan ke acara ini.</p>
          </div>
        ) : (
          <div className="staff-list">
            {staffList.map(staff => (
              <div className="staff-item" key={staff.userId}>
                <div className="staff-info">
                  <div className="staff-avatar">
                    {staff.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="staff-details">
                    <strong>{staff.name}</strong>
                    <span>
                      Ditugaskan:{' '}
                      {new Date(staff.assignedAt).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span className="history-badge-me" style={{ background: 'var(--mint)' }}>
                    Petugas Check-in
                  </span>
                  <button
                    type="button"
                    className="staff-revoke-button"
                    disabled={busy}
                    onClick={() => void handleUnassign(staff.userId, staff.name)}
                    aria-label={`Cabut tugas ${staff.name}`}
                  >
                    <Trash2 size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
                    Cabut Akses
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

