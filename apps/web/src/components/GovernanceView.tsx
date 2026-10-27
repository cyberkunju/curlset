import React, { useEffect, useState, useMemo } from 'react';
import {
  fetchProjects,
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
  ShieldAlert,
  Layers,
  AlertCircle,
  CheckCircle2,
  Search,
  Calendar,
  X,
  UserPlus,
  Trash2,
  RotateCcw,
} from 'lucide-react';
import { CustomSelect } from './ui/CustomSelect';

export const GovernanceView: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [loadingProjects, setLoadingProjects] = useState(true);

  // Tab state
  const [activeTab, setActiveTab] = useState<'quotas' | 'team' | 'audit'>('quotas');
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Quota, Team & Audit state
  const [usage, setUsage] = useState<ProjectQuotaUsage | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);

  // Member form state
  const [newUserId, setNewUserId] = useState('');
  const [newRole, setNewRole] = useState<'editor' | 'viewer'>('editor');
  const [addingMember, setAddingMember] = useState(false);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);

  // Audit filter state (filters over the loaded audit records)
  const [auditSearchQuery, setAuditSearchQuery] = useState('');
  const [auditStartDate, setAuditStartDate] = useState('');
  const [auditEndDate, setAuditEndDate] = useState('');

  // Initial load of projects
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
      setSuccessMessage(null);
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
    if (!newUserId.trim() || !selectedProjectId || addingMember) return;
    setAddingMember(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await addProjectMember(selectedProjectId, newUserId.trim(), newRole);
      setNewUserId('');
      setSuccessMessage(`Successfully added user '${newUserId.trim()}' with role '${newRole}'.`);
      const updated = await fetchProjectMembers(selectedProjectId);
      setMembers(updated);
    } catch (err: any) {
      setError(err?.message || 'Failed to add member');
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
      await removeProjectMember(selectedProjectId, targetUserId);
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

  const currentProject = projects.find((p) => p.id === selectedProjectId);

  return (
    <div className="governance-view" style={{ maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
      {/* Header & Project Selector */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <div>
          <h1
            style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              letterSpacing: '-0.02em',
              display: 'flex',
              alignItems: 'center',
              gap: '0.65rem',
              color: 'var(--text-primary)',
            }}
          >
            <ShieldCheck size={24} style={{ color: 'var(--accent-interactive)' }} /> Governance & Resource Quotas
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Multi-tenant access control (RBAC), storage byte budgets, record volume limits, and security audit logs.
          </p>
        </div>

        {/* Project Selector */}
        {projects.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Project:</span>
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
        <div className="loading-container" style={{ padding: '4rem', textAlign: 'center' }}>
          <div className="spinner" style={{ margin: '0 auto 1rem' }} />
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Loading project workspaces...</div>
        </div>
      ) : projects.length === 0 ? (
        <div className="empty-state" style={{ padding: '4rem 2rem', textAlign: 'center', background: 'var(--bg-surface)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-md)' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.75rem' }}>
            <ShieldCheck size={40} style={{ color: 'var(--text-muted)' }} />
          </div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>No projects available</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Create a project workspace first to configure governance and quotas.</p>
        </div>
      ) : (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
          {/* Sub Navigation Tabs */}
          <div
            style={{
              display: 'flex',
              borderBottom: '1px solid var(--border-hairline)',
              padding: '0 0.5rem',
              background: 'var(--bg-elevated)',
              overflowX: 'auto',
            }}
          >
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
                whiteSpace: 'nowrap',
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
                whiteSpace: 'nowrap',
              }}
            >
              <Users size={16} /> Team & RBAC Roles ({members.length})
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
                whiteSpace: 'nowrap',
              }}
            >
              <FileText size={16} /> Security Audit Trail ({auditLogs.length})
            </button>
          </div>

          <div style={{ padding: '1.5rem' }}>
            {/* Global Alerts */}
            {error && (
              <div
                style={{
                  marginBottom: '1.25rem',
                  padding: '0.75rem 1rem',
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
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            {successMessage && (
              <div
                style={{
                  marginBottom: '1.25rem',
                  padding: '0.75rem 1rem',
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
                <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
                <span>{successMessage}</span>
              </div>
            )}

            {loadingData ? (
              <div style={{ padding: '3.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                <div className="spinner" style={{ margin: '0 auto 0.75rem' }} />
                Loading {activeTab} data for project...
              </div>
            ) : activeTab === 'quotas' ? (
              /* TAB 1: QUOTAS & USAGE LIMITS */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
                  {/* Storage Meter Card */}
                  <div
                    style={{
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-hairline)',
                      borderRadius: 'var(--radius-md)',
                      padding: '1.25rem',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
                            <HardDrive size={18} style={{ color: 'var(--accent-interactive)' }} /> Storage Consumption
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                            Object storage volume allocated to record media and versions
                          </div>
                        </div>
                        <span
                          className={`badge ${
                            (usage?.storage_percentage || 0) > 90
                              ? 'badge-rose'
                              : (usage?.storage_percentage || 0) > 75
                              ? 'badge-amber'
                              : 'badge-blue'
                          }`}
                        >
                          {usage?.storage_percentage !== undefined ? `${usage.storage_percentage}%` : 'N/A'}
                        </span>
                      </div>

                      <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem', fontFamily: 'var(--font-mono)' }}>
                        {formatBytes(usage?.storage_bytes_used || 0)}{' '}
                        <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-muted)' }}>
                          / {formatBytes(usage?.storage_quota_bytes || 0)}
                        </span>
                      </div>

                      {/* Progress bar */}
                      <div style={{ width: '100%', height: '8px', background: 'var(--bg-elevated)', borderRadius: '999px', overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${Math.min(Math.max(usage?.storage_percentage || 0, 0), 100)}%`,
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
                    </div>

                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.85rem', lineHeight: 1.4 }}>
                      Enforced at the storage layer. Uploads exceeding quota are rejected with HTTP 413 to prevent unmeasured disk growth.
                    </p>
                  </div>

                  {/* Record Volume Meter Card */}
                  <div
                    style={{
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-hairline)',
                      borderRadius: 'var(--radius-md)',
                      padding: '1.25rem',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
                            <Layers size={18} style={{ color: 'var(--accent-interactive)' }} /> Record Capacity Quota
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                            Relational database item capacity across all datasets in project
                          </div>
                        </div>
                        <span
                          className={`badge ${
                            (usage?.records_percentage || 0) > 90
                              ? 'badge-rose'
                              : (usage?.records_percentage || 0) > 75
                              ? 'badge-amber'
                              : 'badge-emerald'
                          }`}
                        >
                          {usage?.records_percentage !== undefined ? `${usage.records_percentage}%` : 'N/A'}
                        </span>
                      </div>

                      <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem', fontFamily: 'var(--font-mono)' }}>
                        {(usage?.records_used || 0).toLocaleString()}{' '}
                        <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-muted)' }}>
                          / {(usage?.records_quota || 0).toLocaleString()} records
                        </span>
                      </div>

                      {/* Progress bar */}
                      <div style={{ width: '100%', height: '8px', background: 'var(--bg-elevated)', borderRadius: '999px', overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${Math.min(Math.max(usage?.records_percentage || 0, 0), 100)}%`,
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
                    </div>

                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.85rem', lineHeight: 1.4 }}>
                      Guards database indexing throughput and prevents memory saturation during batch import or synthetic generation.
                    </p>
                  </div>
                </div>

                {/* Technical Rate Limiting Specifications */}
                <div
                  style={{
                    padding: '1.15rem',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-hairline)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.825rem',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <ShieldAlert size={16} style={{ color: 'var(--accent-interactive)' }} /> Active Rate Limiting & Resource Throttling Rules
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.65rem', marginTop: '0.5rem' }}>
                    <div style={{ padding: '0.5rem 0.75rem', background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-hairline)' }}>
                      <strong style={{ color: 'var(--text-primary)' }}>API Ingestion:</strong> 300 requests / 60s per client token
                    </div>
                    <div style={{ padding: '0.5rem 0.75rem', background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-hairline)' }}>
                      <strong style={{ color: 'var(--text-primary)' }}>Batch AI Inference:</strong> 30 requests / 60s window
                    </div>
                    <div style={{ padding: '0.5rem 0.75rem', background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-hairline)' }}>
                      <strong style={{ color: 'var(--text-primary)' }}>Synthetic Sample Generation:</strong> 25 requests / 60s window
                    </div>
                  </div>
                </div>
              </div>
            ) : activeTab === 'team' ? (
              /* TAB 2: TEAM & RBAC ROLES */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {/* Add member form */}
                <form
                  onSubmit={handleAddMember}
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '0.75rem',
                    alignItems: 'flex-end',
                    background: 'var(--bg-elevated)',
                    padding: '1.15rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-hairline)',
                  }}
                >
                  <div style={{ flex: '1 1 240px' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                      User Identifier / Email *
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. dev_analyst_2@team.org"
                      value={newUserId}
                      onChange={(e) => setNewUserId(e.target.value)}
                      disabled={addingMember}
                      required
                      style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.85rem' }}
                    />
                  </div>

                  <div style={{ width: '190px' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                      Role *
                    </label>
                    <CustomSelect
                      value={newRole}
                      onChange={(val) => setNewRole(val as any)}
                      disabled={addingMember}
                      options={[
                        { value: 'editor', label: 'Editor (Write & Annotate)' },
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
                    style={{ padding: '0.5rem 1.15rem', display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}
                  >
                    <UserPlus size={15} />
                    {addingMember ? 'Adding...' : 'Add Member'}
                  </button>
                </form>

                {/* Member table */}
                <div style={{ border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-md)', overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                    <thead style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-hairline)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      <tr>
                        <th style={{ padding: '0.75rem 1rem' }}>User Identifier</th>
                        <th style={{ padding: '0.75rem 1rem' }}>Role</th>
                        <th style={{ padding: '0.75rem 1rem' }}>Permissions & Capabilities</th>
                        <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((m) => (
                        <tr key={m.id} style={{ borderBottom: '1px solid var(--border-hairline)', transition: 'background-color 0.15s ease' }}>
                          <td style={{ padding: '0.75rem 1rem', fontFamily: 'var(--font-mono)', fontWeight: 500, color: 'var(--text-primary)' }}>
                            {m.user_id}
                            {m.user_id === currentProject?.owner_id && (
                              <span className="badge badge-amber" style={{ marginLeft: '0.5rem', fontSize: '0.65rem' }}>
                                Owner
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <span className={m.role === 'owner' ? 'badge badge-amber' : m.role === 'editor' ? 'badge badge-blue' : 'badge'}>
                              {m.role}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: 1.4 }}>
                            {m.role === 'owner'
                              ? 'Full administrative control, quota provisioning & membership administration'
                              : m.role === 'editor'
                              ? 'Import data, create annotations, generate synthetic records & publish versions'
                              : 'Inspect dataset splits, view audit events & download export bundles (read-only)'}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                            {m.user_id !== currentProject?.owner_id ? (
                              <button
                                onClick={() => handleRemoveMember(m.user_id)}
                                disabled={removingUserId === m.user_id}
                                className="btn btn-ghost"
                                style={{
                                  color: 'var(--rose)',
                                  padding: '0.25rem 0.5rem',
                                  fontSize: '0.8rem',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.35rem',
                                }}
                                title={`Remove ${m.user_id}`}
                              >
                                <Trash2 size={14} />
                                {removingUserId === m.user_id ? 'Removing...' : 'Remove'}
                              </button>
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Immutable</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              /* TAB 3: SECURITY AUDIT TRAIL */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Search & Date Filter Bar */}
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.85rem 1rem',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-hairline)',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  {/* Search query */}
                  <div style={{ position: 'relative', flex: '1 1 200px' }}>
                    <Search size={15} style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Search action, actor, resource..."
                      value={auditSearchQuery}
                      onChange={(e) => setAuditSearchQuery(e.target.value)}
                      style={{ width: '100%', paddingLeft: '2rem', paddingRight: '0.75rem', fontSize: '0.85rem', height: '34px' }}
                    />
                  </div>

                  {/* Start Date */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <Calendar size={13} /> From:
                    </span>
                    <input
                      type="date"
                      className="form-input"
                      value={auditStartDate}
                      onChange={(e) => setAuditStartDate(e.target.value)}
                      style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem', height: '34px' }}
                    />
                  </div>

                  {/* End Date */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <Calendar size={13} /> To:
                    </span>
                    <input
                      type="date"
                      className="form-input"
                      value={auditEndDate}
                      onChange={(e) => setAuditEndDate(e.target.value)}
                      style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem', height: '34px' }}
                    />
                  </div>

                  {/* Reset Filters */}
                  {hasActiveAuditFilters && (
                    <button
                      onClick={clearAuditFilters}
                      className="btn btn-secondary"
                      style={{ height: '34px', fontSize: '0.8rem', padding: '0 0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                    >
                      <RotateCcw size={13} /> Clear Filters
                    </button>
                  )}
                </div>

                {isDateRangeInvalid && (
                  <div style={{ padding: '0.5rem 0.75rem', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--rose)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <AlertCircle size={14} /> Start date must be before or equal to end date.
                  </div>
                )}

                {/* Scope Notice & Record Count */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)', padding: '0 0.25rem' }}>
                  <span>
                    Filtering over the {auditLogs.length} most recent events loaded from the server for project{' '}
                    <code style={{ fontFamily: 'var(--font-mono)' }}>{selectedProjectId}</code>
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 500 }}>
                    {filteredAuditLogs.length} / {auditLogs.length} events matching
                  </span>
                </div>

                {/* Table or Empty State */}
                {auditLogs.length === 0 ? (
                  <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-hairline)' }}>
                    <FileText size={32} style={{ margin: '0 auto 0.5rem', color: 'var(--text-muted)' }} />
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>No audit records logged yet</div>
                    <div style={{ fontSize: '0.8rem' }}>Actions performed in this project will appear here automatically.</div>
                  </div>
                ) : filteredAuditLogs.length === 0 ? (
                  <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-hairline)' }}>
                    <Search size={32} style={{ margin: '0 auto 0.5rem', color: 'var(--text-muted)' }} />
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>No events match current filters</div>
                    <div style={{ fontSize: '0.8rem', marginBottom: '0.75rem' }}>Try clearing or widening your search keyword or date range.</div>
                    <button onClick={clearAuditFilters} className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}>
                      Clear Filters
                    </button>
                  </div>
                ) : (
                  <div style={{ border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-md)', overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.825rem' }}>
                      <thead style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-hairline)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        <tr>
                          <th style={{ padding: '0.65rem 0.85rem' }}>Timestamp</th>
                          <th style={{ padding: '0.65rem 0.85rem' }}>Action</th>
                          <th style={{ padding: '0.65rem 0.85rem' }}>Actor</th>
                          <th style={{ padding: '0.65rem 0.85rem' }}>Target Resource</th>
                          <th style={{ padding: '0.65rem 0.85rem' }}>Details (Redacted)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredAuditLogs.map((log) => (
                          <tr key={log.id} style={{ borderBottom: '1px solid var(--border-hairline)' }}>
                            <td style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', fontSize: '0.775rem' }}>
                              {log.created_at ? new Date(log.created_at).toLocaleString() : '—'}
                            </td>
                            <td style={{ padding: '0.65rem 0.85rem' }}>
                              <span className="badge badge-blue" style={{ fontSize: '0.7rem' }}>
                                {log.action}
                              </span>
                            </td>
                            <td style={{ padding: '0.65rem 0.85rem', fontFamily: 'var(--font-mono)', fontWeight: 500, color: 'var(--text-primary)' }}>
                              {log.user_id}
                            </td>
                            <td style={{ padding: '0.65rem 0.85rem', color: 'var(--text-secondary)' }}>
                              {log.resource_type} {log.resource_id ? <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>({log.resource_id})</code> : ''}
                            </td>
                            <td
                              style={{
                                padding: '0.65rem 0.85rem',
                                fontFamily: 'var(--font-mono)',
                                fontSize: '0.75rem',
                                color: 'var(--text-muted)',
                                maxWidth: '320px',
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
        </div>
      )}
    </div>
  );
};
