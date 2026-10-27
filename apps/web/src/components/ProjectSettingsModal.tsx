import React, { useEffect, useState, useMemo } from 'react';
import {
  fetchProjectMembers,
  addProjectMember,
  removeProjectMember,
  fetchProjectQuotaUsage,
  fetchProjectAuditLogs,
} from '../api';
import { Project, ProjectMember, ProjectQuotaUsage, AuditLogEntry } from '../types';
import {
  ShieldCheck,
  BarChart2,
  Users,
  FileText,
  HardDrive,
  Layers,
  ShieldAlert,
  AlertCircle,
  CheckCircle2,
  Search,
  Calendar,
  RotateCcw,
  UserPlus,
  Trash2,
} from 'lucide-react';
import { CustomSelect } from './ui/CustomSelect';
import { ModalShell } from './ui/ModalShell';

interface ProjectSettingsModalProps {
  project: Project;
  onClose: () => void;
}

export const ProjectSettingsModal: React.FC<ProjectSettingsModalProps> = ({ project, onClose }) => {
  const [activeTab, setActiveTab] = useState<'quotas' | 'team' | 'audit'>('quotas');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Quotas state
  const [usage, setUsage] = useState<ProjectQuotaUsage | null>(null);

  // Team state
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [newUserId, setNewUserId] = useState('');
  const [newRole, setNewRole] = useState<'editor' | 'viewer'>('editor');
  const [addingMember, setAddingMember] = useState(false);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);

  // Audit state & filters
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditSearchQuery, setAuditSearchQuery] = useState('');
  const [auditStartDate, setAuditStartDate] = useState('');
  const [auditEndDate, setAuditEndDate] = useState('');

  const loadData = async () => {
    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      if (activeTab === 'quotas') {
        const u = await fetchProjectQuotaUsage(project.id);
        setUsage(u);
      } else if (activeTab === 'team') {
        const m = await fetchProjectMembers(project.id);
        setMembers(m);
      } else if (activeTab === 'audit') {
        const a = await fetchProjectAuditLogs(project.id, 50);
        setAuditLogs(a);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load project settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [project.id, activeTab]);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserId.trim() || addingMember) return;
    setAddingMember(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await addProjectMember(project.id, newUserId.trim(), newRole);
      setNewUserId('');
      setSuccessMessage(`Successfully added user '${newUserId.trim()}' with role '${newRole}'.`);
      const updated = await fetchProjectMembers(project.id);
      setMembers(updated);
    } catch (err: any) {
      setError(err?.message || 'Failed to add project member');
    } finally {
      setAddingMember(false);
    }
  };

  const handleRemoveMember = async (targetUserId: string) => {
    if (removingUserId) return;
    if (!window.confirm(`Are you sure you want to remove user '${targetUserId}' from this project?`)) {
      return;
    }
    setRemovingUserId(targetUserId);
    setError(null);
    setSuccessMessage(null);
    try {
      await removeProjectMember(project.id, targetUserId);
      setMembers((prev) => prev.filter((m) => m.user_id !== targetUserId));
      setSuccessMessage(`User '${targetUserId}' removed successfully.`);
    } catch (err: any) {
      setError(err?.message || 'Failed to remove member');
    } finally {
      setRemovingUserId(null);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (!bytes || bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const isDateRangeInvalid = Boolean(auditStartDate && auditEndDate && auditStartDate > auditEndDate);

  // Filter audit logs client-side over loaded data
  const filteredAuditLogs = useMemo(() => {
    if (auditStartDate && auditEndDate && auditStartDate > auditEndDate) {
      return [];
    }

    return auditLogs.filter((log) => {
      // 1. Keyword search
      if (auditSearchQuery.trim()) {
        const q = auditSearchQuery.toLowerCase();
        const actionMatch = log.action?.toLowerCase().includes(q);
        const userMatch = log.user_id?.toLowerCase().includes(q);
        const resourceTypeMatch = log.resource_type?.toLowerCase().includes(q);
        const resourceIdMatch = log.resource_id?.toLowerCase().includes(q);
        const detailsMatch = JSON.stringify(log.details || {}).toLowerCase().includes(q);
        if (!actionMatch && !userMatch && !resourceTypeMatch && !resourceIdMatch && !detailsMatch) {
          return false;
        }
      }

      // 2. Date filters
      const hasDateFilter = Boolean(auditStartDate || auditEndDate);
      if (hasDateFilter) {
        if (!log.created_at) {
          // Exclude records with missing timestamps when a date filter is active
          return false;
        }
        const logDate = new Date(log.created_at);
        if (isNaN(logDate.getTime())) {
          // Exclude records with invalid timestamps when a date filter is active
          return false;
        }
        if (auditStartDate) {
          const start = new Date(auditStartDate);
          start.setHours(0, 0, 0, 0);
          if (logDate < start) return false;
        }
        if (auditEndDate) {
          const end = new Date(auditEndDate);
          end.setHours(23, 59, 59, 999);
          if (logDate > end) return false;
        }
      }

      return true;
    });
  }, [auditLogs, auditSearchQuery, auditStartDate, auditEndDate]);

  const hasActiveAuditFilters = Boolean(auditSearchQuery || auditStartDate || auditEndDate);

  const clearAuditFilters = () => {
    setAuditSearchQuery('');
    setAuditStartDate('');
    setAuditEndDate('');
  };

  return (
    <ModalShell
      isOpen={true}
      onClose={onClose}
      title="Project Settings & Governance"
      description={`Workspace: ${project.name} (Owner: ${project.owner_id})`}
      icon={<ShieldCheck size={20} strokeWidth={1.75} style={{ color: 'var(--accent-interactive)' }} />}
      size="xl"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
          <button onClick={onClose} className="btn btn-secondary" style={{ padding: '0.45rem 1rem' }}>
            Close Settings
          </button>
        </div>
      }
    >
      <div>
        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--border-hairline)',
            marginBottom: '1.25rem',
            background: 'var(--bg-elevated)',
            borderRadius: 'var(--radius-sm)',
            padding: '0.25rem',
            gap: '0.25rem',
            overflowX: 'auto',
          }}
        >
          <button
            onClick={() => setActiveTab('quotas')}
            className={`btn ${activeTab === 'quotas' ? 'btn-primary' : 'btn-ghost'}`}
            style={{
              padding: '0.45rem 0.85rem',
              fontSize: '0.825rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              whiteSpace: 'nowrap',
            }}
          >
            <BarChart2 size={15} /> Quotas & Limits
          </button>
          <button
            onClick={() => setActiveTab('team')}
            className={`btn ${activeTab === 'team' ? 'btn-primary' : 'btn-ghost'}`}
            style={{
              padding: '0.45rem 0.85rem',
              fontSize: '0.825rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              whiteSpace: 'nowrap',
            }}
          >
            <Users size={15} /> Team & Access Control ({members.length})
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`btn ${activeTab === 'audit' ? 'btn-primary' : 'btn-ghost'}`}
            style={{
              padding: '0.45rem 0.85rem',
              fontSize: '0.825rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              whiteSpace: 'nowrap',
            }}
          >
            <FileText size={15} /> Audit Trail ({auditLogs.length})
          </button>
        </div>

        {/* Global Notifications */}
        {error && (
          <div
            style={{
              marginBottom: '1rem',
              padding: '0.65rem 0.85rem',
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--rose)',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <AlertCircle size={15} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {successMessage && (
          <div
            style={{
              marginBottom: '1rem',
              padding: '0.65rem 0.85rem',
              background: 'rgba(16, 185, 129, 0.08)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--emerald)',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <CheckCircle2 size={15} style={{ flexShrink: 0 }} />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Tab Content */}
        {loading ? (
          <div style={{ padding: '3.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <div className="spinner" style={{ margin: '0 auto 0.75rem' }} />
            Loading project settings...
          </div>
        ) : activeTab === 'quotas' ? (
          /* TAB 1: QUOTAS & LIMITS */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
              {/* Storage */}
              <div
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-hairline)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1.15rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.45rem', color: 'var(--text-primary)' }}>
                    <HardDrive size={16} style={{ color: 'var(--accent-interactive)' }} /> Storage Consumption
                  </span>
                  <span
                    className={`badge ${
                      (usage?.storage_percentage || 0) > 90
                        ? 'badge-rose'
                        : (usage?.storage_percentage || 0) > 75
                        ? 'badge-amber'
                        : 'badge-blue'
                    }`}
                  >
                    {usage?.storage_percentage || 0}%
                  </span>
                </div>

                <div style={{ fontSize: '1.15rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                  {formatBytes(usage?.storage_bytes_used || 0)}{' '}
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                    / {formatBytes(usage?.storage_quota_bytes || 0)}
                  </span>
                </div>

                <div style={{ width: '100%', height: '7px', background: 'var(--bg-surface)', borderRadius: '999px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${Math.min(usage?.storage_percentage || 0, 100)}%`,
                      height: '100%',
                      background:
                        (usage?.storage_percentage || 0) > 90
                          ? 'var(--rose)'
                          : (usage?.storage_percentage || 0) > 75
                          ? 'var(--amber)'
                          : 'var(--accent-interactive)',
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
                <p style={{ fontSize: '0.725rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                  Enforced server-side. Uploads exceeding quota are rejected with HTTP 413.
                </p>
              </div>

              {/* Records */}
              <div
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-hairline)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1.15rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.45rem', color: 'var(--text-primary)' }}>
                    <Layers size={16} style={{ color: 'var(--accent-interactive)' }} /> Record Volume Quota
                  </span>
                  <span
                    className={`badge ${
                      (usage?.records_percentage || 0) > 90
                        ? 'badge-rose'
                        : (usage?.records_percentage || 0) > 75
                        ? 'badge-amber'
                        : 'badge-emerald'
                    }`}
                  >
                    {usage?.records_percentage || 0}%
                  </span>
                </div>

                <div style={{ fontSize: '1.15rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                  {(usage?.records_used || 0).toLocaleString()}{' '}
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                    / {(usage?.records_quota || 0).toLocaleString()} records
                  </span>
                </div>

                <div style={{ width: '100%', height: '7px', background: 'var(--bg-surface)', borderRadius: '999px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${Math.min(usage?.records_percentage || 0, 100)}%`,
                      height: '100%',
                      background:
                        (usage?.records_percentage || 0) > 90
                          ? 'var(--rose)'
                          : (usage?.records_percentage || 0) > 75
                          ? 'var(--amber)'
                          : 'var(--emerald)',
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
                <p style={{ fontSize: '0.725rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                  Guards database indexing throughput and prevents uncontrolled record allocation.
                </p>
              </div>
            </div>

            {/* Rate Limiting Notice */}
            <div
              style={{
                padding: '1rem',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-hairline)',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.8rem',
                color: 'var(--text-secondary)',
              }}
            >
              <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <ShieldAlert size={15} style={{ color: 'var(--accent-interactive)' }} /> Active Tenant Rate Limiting Rules:
              </div>
              <div>• General Ingestion API: 300 requests / 60 seconds rolling window per tenant.</div>
              <div>• AI Model Batch Annotation: 30 requests / 60 seconds rolling window.</div>
              <div>• Synthetic Sample Generation: 25 batches / 60 seconds rolling window.</div>
            </div>
          </div>
        ) : activeTab === 'team' ? (
          /* TAB 2: TEAM & ACCESS CONTROL */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Add member form */}
            <form
              onSubmit={handleAddMember}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.65rem',
                alignItems: 'flex-end',
                background: 'var(--bg-elevated)',
                padding: '1rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-hairline)',
              }}
            >
              <div style={{ flex: '1 1 200px' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  User Identifier / Email *
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. dev_reviewer@team.org"
                  value={newUserId}
                  onChange={(e) => setNewUserId(e.target.value)}
                  disabled={addingMember}
                  required
                  style={{ width: '100%', fontSize: '0.825rem', padding: '0.45rem 0.65rem' }}
                />
              </div>

              <div style={{ width: '160px' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Role *
                </label>
                <CustomSelect
                  value={newRole}
                  onChange={(val) => setNewRole(val as any)}
                  disabled={addingMember}
                  options={[
                    { value: 'editor', label: 'Editor (Write)' },
                    { value: 'viewer', label: 'Viewer (Read-only)' },
                  ]}
                  size="sm"
                  style={{ width: '100%' }}
                  ariaLabel="Select member role"
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={addingMember || !newUserId.trim()}
                style={{ padding: '0.45rem 0.95rem', fontSize: '0.825rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
              >
                <UserPlus size={14} />
                {addingMember ? 'Adding...' : 'Add Member'}
              </button>
            </form>

            {/* Members table */}
            <div style={{ border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-md)', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.825rem' }}>
                <thead style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-hairline)', fontSize: '0.725rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <tr>
                    <th style={{ padding: '0.65rem 0.85rem' }}>User Identifier</th>
                    <th style={{ padding: '0.65rem 0.85rem' }}>Role</th>
                    <th style={{ padding: '0.65rem 0.85rem' }}>Permissions</th>
                    <th style={{ padding: '0.65rem 0.85rem', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.id} style={{ borderBottom: '1px solid var(--border-hairline)' }}>
                      <td style={{ padding: '0.65rem 0.85rem', fontFamily: 'var(--font-mono)', fontWeight: 500, color: 'var(--text-primary)' }}>
                        {m.user_id}
                        {m.user_id === project.owner_id && (
                          <span className="badge badge-amber" style={{ marginLeft: '0.4rem', fontSize: '0.65rem' }}>
                            Owner
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '0.65rem 0.85rem' }}>
                        <span className={m.role === 'owner' ? 'badge badge-amber' : m.role === 'editor' ? 'badge badge-blue' : 'badge'}>
                          {m.role}
                        </span>
                      </td>
                      <td style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', fontSize: '0.775rem' }}>
                        {m.role === 'owner'
                          ? 'Full administrative control & membership management'
                          : m.role === 'editor'
                          ? 'Annotate, synthesize, export & publish dataset versions'
                          : 'Inspect records & download exports (read-only)'}
                      </td>
                      <td style={{ padding: '0.65rem 0.85rem', textAlign: 'right' }}>
                        {m.user_id !== project.owner_id ? (
                          <button
                            onClick={() => handleRemoveMember(m.user_id)}
                            disabled={removingUserId === m.user_id}
                            className="btn btn-ghost"
                            style={{ color: 'var(--rose)', padding: '0.2rem 0.45rem', fontSize: '0.775rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                          >
                            <Trash2 size={13} />
                            {removingUserId === m.user_id ? 'Removing...' : 'Remove'}
                          </button>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.775rem' }}>Immutable</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* TAB 3: AUDIT TRAIL */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {/* Filter Bar */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: '0.65rem',
                padding: '0.75rem',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-hairline)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <div style={{ position: 'relative', flex: '1 1 180px' }}>
                <Search size={14} style={{ position: 'absolute', left: '0.55rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  className="form-input"
                  placeholder="Filter action, actor, resource..."
                  value={auditSearchQuery}
                  onChange={(e) => setAuditSearchQuery(e.target.value)}
                  style={{ width: '100%', paddingLeft: '1.85rem', height: '32px', fontSize: '0.8rem' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                  <Calendar size={12} /> From:
                </span>
                <input
                  type="date"
                  className="form-input"
                  value={auditStartDate}
                  onChange={(e) => setAuditStartDate(e.target.value)}
                  style={{ height: '32px', fontSize: '0.775rem', padding: '0.2rem 0.4rem' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                  <Calendar size={12} /> To:
                </span>
                <input
                  type="date"
                  className="form-input"
                  value={auditEndDate}
                  onChange={(e) => setAuditEndDate(e.target.value)}
                  style={{ height: '32px', fontSize: '0.775rem', padding: '0.2rem 0.4rem' }}
                />
              </div>

              {hasActiveAuditFilters && (
                <button
                  onClick={clearAuditFilters}
                  className="btn btn-secondary"
                  style={{ height: '32px', fontSize: '0.775rem', padding: '0 0.65rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                >
                  <RotateCcw size={12} /> Clear
                </button>
              )}
            </div>

            {isDateRangeInvalid && (
              <div style={{ padding: '0.45rem 0.65rem', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--rose)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: 'var(--radius-sm)', fontSize: '0.775rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <AlertCircle size={13} /> Start date must be before or equal to end date.
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.775rem', color: 'var(--text-secondary)', padding: '0 0.15rem' }}>
              <span>Filtering over {auditLogs.length} most recent server-logged events</span>
              <span style={{ fontFamily: 'var(--font-mono)' }}>{filteredAuditLogs.length} / {auditLogs.length} events matching</span>
            </div>

            {auditLogs.length === 0 ? (
              <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)' }}>
                No audit events recorded yet for this workspace.
              </div>
            ) : filteredAuditLogs.length === 0 ? (
              <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)' }}>
                No audit events match current filters.
              </div>
            ) : (
              <div style={{ border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-md)', overflowX: 'auto', maxHeight: '360px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
                  <thead style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-hairline)', position: 'sticky', top: 0, zIndex: 1 }}>
                    <tr>
                      <th style={{ padding: '0.55rem 0.75rem' }}>Timestamp</th>
                      <th style={{ padding: '0.55rem 0.75rem' }}>Action</th>
                      <th style={{ padding: '0.55rem 0.75rem' }}>Actor</th>
                      <th style={{ padding: '0.55rem 0.75rem' }}>Resource</th>
                      <th style={{ padding: '0.55rem 0.75rem' }}>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAuditLogs.map((log) => (
                      <tr key={log.id} style={{ borderBottom: '1px solid var(--border-hairline)' }}>
                        <td style={{ padding: '0.55rem 0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', fontSize: '0.75rem' }}>
                          {log.created_at ? new Date(log.created_at).toLocaleString() : '—'}
                        </td>
                        <td style={{ padding: '0.55rem 0.75rem' }}>
                          <span className="badge badge-blue" style={{ fontSize: '0.675rem' }}>{log.action}</span>
                        </td>
                        <td style={{ padding: '0.55rem 0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{log.user_id}</td>
                        <td style={{ padding: '0.55rem 0.75rem', color: 'var(--text-secondary)' }}>
                          {log.resource_type} {log.resource_id ? `(${log.resource_id})` : ''}
                        </td>
                        <td
                          style={{
                            padding: '0.55rem 0.75rem',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.725rem',
                            color: 'var(--text-muted)',
                            maxWidth: '240px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={JSON.stringify(log.details)}
                        >
                          {JSON.stringify(log.details)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </ModalShell>
  );
};
