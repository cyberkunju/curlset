import React, { useEffect, useState } from 'react';
import {
  fetchProjects,
  fetchProjectMembers,
  addProjectMember,
  removeProjectMember,
  fetchProjectQuotaUsage,
  fetchProjectAuditLogs,
} from '../api';
import { Project, ProjectMember, ProjectQuotaUsage, AuditLogEntry } from '../types';
import { ShieldCheck, BarChart2, Users, FileText, HardDrive, ShieldAlert, Layers, AlertCircle } from 'lucide-react';
import { CustomSelect } from './ui/CustomSelect';

export const GovernanceView: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [loadingProjects, setLoadingProjects] = useState(true);

  // Tab state
  const [activeTab, setActiveTab] = useState<'quotas' | 'team' | 'audit'>('quotas');
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Quota & Team state
  const [usage, setUsage] = useState<ProjectQuotaUsage | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);

  // Member form
  const [newUserId, setNewUserId] = useState('');
  const [newRole, setNewRole] = useState<'editor' | 'viewer'>('editor');
  const [addingMember, setAddingMember] = useState(false);

  // Initial load projects
  useEffect(() => {
    const init = async () => {
      setLoadingProjects(true);
      try {
        const projs = await fetchProjects();
        setProjects(projs);
        if (projs.length > 0) {
          setSelectedProjectId(projs[0].id);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load projects');
      } finally {
        setLoadingProjects(false);
      }
    };
    init();
  }, []);

  // Load project details when selection or tab changes
  useEffect(() => {
    if (!selectedProjectId) return;
    const loadDetails = async () => {
      setLoadingData(true);
      setError(null);
      try {
        if (activeTab === 'quotas') {
          const u = await fetchProjectQuotaUsage(selectedProjectId);
          setUsage(u);
        } else if (activeTab === 'team') {
          const m = await fetchProjectMembers(selectedProjectId);
          setMembers(m);
        } else if (activeTab === 'audit') {
          const a = await fetchProjectAuditLogs(selectedProjectId, 50);
          setAuditLogs(a);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load governance data');
      } finally {
        setLoadingData(false);
      }
    };
    loadDetails();
  }, [selectedProjectId, activeTab]);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserId.trim() || !selectedProjectId) return;
    setAddingMember(true);
    setError(null);
    try {
      await addProjectMember(selectedProjectId, newUserId.trim(), newRole);
      setNewUserId('');
      const updated = await fetchProjectMembers(selectedProjectId);
      setMembers(updated);
    } catch (err: any) {
      setError(err?.message || 'Failed to add member');
    } finally {
      setAddingMember(false);
    }
  };

  const handleRemoveMember = async (targetUserId: string) => {
    if (!confirm(`Are you sure you want to remove user '${targetUserId}'?`)) return;
    setError(null);
    try {
      await removeProjectMember(selectedProjectId, targetUserId);
      setMembers((prev) => prev.filter((m) => m.user_id !== targetUserId));
    } catch (err: any) {
      setError(err?.message || 'Failed to remove member');
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const currentProject = projects.find((p) => p.id === selectedProjectId);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <ShieldCheck size={24} style={{ color: 'var(--accent-interactive)' }} /> Governance & Resource Quotas
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Multi-tenant access control (RBAC), storage byte budgets, record volume limits, and security audit logs.
          </p>
        </div>

        {/* Project Selector */}
        {projects.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Project:</span>
            <CustomSelect
              value={selectedProjectId}
              onChange={(val) => setSelectedProjectId(val)}
              options={projects.map((p) => ({
                value: p.id,
                label: `${p.name} (${p.owner_id})`,
              }))}
              style={{ minWidth: '260px' }}
              ariaLabel="Select project"
            />
          </div>
        )}
      </div>

      {loadingProjects ? (
        <div className="loading-container">
          <div className="spinner"></div>
          <div>Loading projects...</div>
        </div>
      ) : projects.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon" style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.5rem' }}>
            <ShieldCheck size={36} style={{ color: 'var(--text-muted)' }} />
          </div>
          <h3 className="empty-title">No projects available</h3>
          <p className="empty-desc">Create a project workspace first to configure governance and quotas.</p>
        </div>
      ) : (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
          {/* Sub Navigation */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border-hairline)', padding: '0 1rem', background: 'var(--bg-elevated)' }}>
            <button
              onClick={() => setActiveTab('quotas')}
              className="btn btn-ghost"
              style={{
                borderBottom: activeTab === 'quotas' ? '2px solid var(--accent-interactive)' : '2px solid transparent',
                borderRadius: 0,
                color: activeTab === 'quotas' ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: activeTab === 'quotas' ? 600 : 500,
                padding: '0.75rem 1rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <BarChart2 size={16} /> Quotas & Usage Limits
            </button>
            <button
              onClick={() => setActiveTab('team')}
              className="btn btn-ghost"
              style={{
                borderBottom: activeTab === 'team' ? '2px solid var(--accent-interactive)' : '2px solid transparent',
                borderRadius: 0,
                color: activeTab === 'team' ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: activeTab === 'team' ? 600 : 500,
                padding: '0.75rem 1rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <Users size={16} /> Team & RBAC Roles
            </button>
            <button
              onClick={() => setActiveTab('audit')}
              className="btn btn-ghost"
              style={{
                borderBottom: activeTab === 'audit' ? '2px solid var(--accent-interactive)' : '2px solid transparent',
                borderRadius: 0,
                color: activeTab === 'audit' ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: activeTab === 'audit' ? 600 : 500,
                padding: '0.75rem 1rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <FileText size={16} /> Security Audit Trail
            </button>
          </div>

          <div style={{ padding: '1.5rem' }}>
            {error && (
              <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 'var(--radius-sm)', color: '#fca5a5', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <AlertCircle size={15} style={{ flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            {loadingData ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                Loading {activeTab} data for project...
              </div>
            ) : activeTab === 'quotas' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* Storage Card */}
                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-md)', padding: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <HardDrive size={16} style={{ color: 'var(--accent-interactive)' }} /> Storage Consumption
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      {formatBytes(usage?.storage_bytes_used || 0)} / {formatBytes(usage?.storage_quota_bytes || 0)} ({usage?.storage_percentage || 0}%)
                    </span>
                  </div>
                  <div style={{ width: '100%', height: '8px', background: 'var(--bg-elevated)', borderRadius: '999px', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${Math.min(usage?.storage_percentage || 0, 100)}%`,
                        height: '100%',
                        background: (usage?.storage_percentage || 0) > 90 ? 'var(--rose)' : (usage?.storage_percentage || 0) > 70 ? 'var(--amber)' : 'var(--accent-interactive)',
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                    Enforced at the storage layer. Uploads exceeding project quota are rejected with HTTP 413 to prevent uncontrolled disk growth.
                  </p>
                </div>

                {/* Records Card */}
                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-md)', padding: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Layers size={16} style={{ color: 'var(--accent-interactive)' }} /> Record Capacity Quota
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      {(usage?.records_used || 0).toLocaleString()} / {(usage?.records_quota || 0).toLocaleString()} records ({usage?.records_percentage || 0}%)
                    </span>
                  </div>
                  <div style={{ width: '100%', height: '8px', background: 'var(--bg-elevated)', borderRadius: '999px', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${Math.min(usage?.records_percentage || 0, 100)}%`,
                        height: '100%',
                        background: (usage?.records_percentage || 0) > 90 ? 'var(--rose)' : (usage?.records_percentage || 0) > 70 ? 'var(--amber)' : 'var(--emerald)',
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                    Protects relational database memory and indexing performance across datasets.
                  </p>
                </div>

                {/* Abuse / Rate Limiting Notice (Neutral Panel) */}
                <div style={{ padding: '1rem', background: 'var(--bg-elevated)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-md)', fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <ShieldAlert size={16} style={{ color: 'var(--accent-interactive)' }} /> Rate Limiting & Abuse Defense Enabled
                  </div>
                  <div>• API Ingestion: 300 requests / 60 seconds rolling window per client.</div>
                  <div>• Batch AI Model Inference: 30 requests / 60 seconds rolling window.</div>
                  <div>• Synthetic Sample Generation: 25 requests / 60 seconds rolling window.</div>
                </div>
              </div>
            ) : activeTab === 'team' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {/* Add member form */}
                <form onSubmit={handleAddMember} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', background: 'var(--surface-base)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>User Identifier / Email</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="e.g. dev_analyst_2@team.org"
                      value={newUserId}
                      onChange={(e) => setNewUserId(e.target.value)}
                      required
                      style={{ width: '100%', padding: '0.45rem 0.65rem', fontSize: '0.85rem' }}
                    />
                  </div>
                  <div style={{ width: '180px' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Role</label>
                    <CustomSelect
                      value={newRole}
                      onChange={(val) => setNewRole(val as any)}
                      options={[
                        { value: 'editor', label: 'Editor (Write)' },
                        { value: 'viewer', label: 'Viewer (Read-only)' },
                      ]}
                      size="sm"
                      style={{ width: '100%', minWidth: '160px' }}
                      ariaLabel="Select member role"
                    />
                  </div>
                  <button type="submit" className="btn btn-primary" disabled={addingMember || !newUserId.trim()} style={{ padding: '0.45rem 1rem' }}>
                    {addingMember ? 'Adding...' : 'Add Member'}
                  </button>
                </form>

                {/* Member table */}
                <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                    <thead style={{ background: 'var(--surface-hover)', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-subtle)', fontSize: '0.75rem' }}>
                      <tr>
                        <th style={{ padding: '0.65rem 1rem' }}>User Identifier</th>
                        <th style={{ padding: '0.65rem 1rem' }}>Role</th>
                        <th style={{ padding: '0.65rem 1rem' }}>Capabilities</th>
                        <th style={{ padding: '0.65rem 1rem', textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((m) => (
                        <tr key={m.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                          <td style={{ padding: '0.75rem 1rem', fontFamily: 'var(--font-mono)' }}>
                            {m.user_id}
                            {m.user_id === currentProject?.owner_id && (
                              <span className="badge badge-amber" style={{ marginLeft: '0.5rem', fontSize: '0.65rem' }}>Owner</span>
                            )}
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <span className={m.role === 'owner' ? 'badge badge-amber' : m.role === 'editor' ? 'badge badge-blue' : 'badge'}>
                              {m.role}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                            {m.role === 'owner' ? 'Full administrative rights & quota config' : m.role === 'editor' ? 'Upload assets, annotate, synthesize, publish & export' : 'Inspect datasets and download export packages'}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                            {m.user_id !== currentProject?.owner_id ? (
                              <button onClick={() => handleRemoveMember(m.user_id)} style={{ background: 'none', border: 'none', color: 'var(--rose)', cursor: 'pointer', fontSize: '0.8rem' }}>
                                Remove
                              </button>
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  <span>Audit log events for project <code style={{ fontFamily: 'var(--font-mono)' }}>{selectedProjectId}</code>:</span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{auditLogs.length} events</span>
                </div>

                {auditLogs.length === 0 ? (
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    No audit records registered yet for this project.
                  </div>
                ) : (
                  <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
                      <thead style={{ background: 'var(--surface-hover)', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-subtle)' }}>
                        <tr>
                          <th style={{ padding: '0.65rem 0.75rem' }}>Timestamp</th>
                          <th style={{ padding: '0.65rem 0.75rem' }}>Action</th>
                          <th style={{ padding: '0.65rem 0.75rem' }}>Actor</th>
                          <th style={{ padding: '0.65rem 0.75rem' }}>Target Resource</th>
                          <th style={{ padding: '0.65rem 0.75rem' }}>Details (Redacted)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {auditLogs.map((log) => (
                          <tr key={log.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                            <td style={{ padding: '0.65rem 0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                              {log.created_at ? new Date(log.created_at).toLocaleString() : '—'}
                            </td>
                            <td style={{ padding: '0.65rem 0.75rem' }}>
                              <span className="badge badge-blue" style={{ fontSize: '0.7rem' }}>{log.action}</span>
                            </td>
                            <td style={{ padding: '0.65rem 0.75rem', fontFamily: 'var(--font-mono)' }}>{log.user_id}</td>
                            <td style={{ padding: '0.65rem 0.75rem', color: 'var(--text-secondary)' }}>
                              {log.resource_type} {log.resource_id ? `(${log.resource_id})` : ''}
                            </td>
                            <td style={{ padding: '0.65rem 0.75rem', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-muted)', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={JSON.stringify(log.details)}>
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
        </div>
      )}
    </div>
  );
};
