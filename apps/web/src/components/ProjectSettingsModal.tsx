import React, { useEffect, useState } from 'react';
import {
  fetchProjectMembers,
  addProjectMember,
  removeProjectMember,
  fetchProjectQuotaUsage,
  fetchProjectAuditLogs,
} from '../api';
import { Project, ProjectMember, ProjectQuotaUsage, AuditLogEntry } from '../types';
import { ShieldCheck, BarChart2, Users, FileText, HardDrive, Layers, ShieldAlert, AlertTriangle, X } from 'lucide-react';

interface ProjectSettingsModalProps {
  project: Project;
  onClose: () => void;
}

export const ProjectSettingsModal: React.FC<ProjectSettingsModalProps> = ({ project, onClose }) => {
  const [activeTab, setActiveTab] = useState<'quotas' | 'team' | 'audit'>('quotas');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Quotas state
  const [usage, setUsage] = useState<ProjectQuotaUsage | null>(null);

  // Team state
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [newUserId, setNewUserId] = useState('');
  const [newRole, setNewRole] = useState<'editor' | 'viewer'>('editor');
  const [addingMember, setAddingMember] = useState(false);

  // Audit state
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
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
    if (!newUserId.trim()) return;
    setAddingMember(true);
    setError(null);
    try {
      await addProjectMember(project.id, newUserId.trim(), newRole);
      setNewUserId('');
      const updated = await fetchProjectMembers(project.id);
      setMembers(updated);
    } catch (err: any) {
      setError(err?.message || 'Failed to add project member');
    } finally {
      setAddingMember(false);
    }
  };

  const handleRemoveMember = async (targetUserId: string) => {
    if (!confirm(`Are you sure you want to remove user '${targetUserId}' from this project?`)) return;
    setError(null);
    try {
      await removeProjectMember(project.id, targetUserId);
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

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#12161f] border border-slate-800 rounded-xl max-w-3xl w-full flex flex-col max-h-[90vh] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-[#161c27]">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <ShieldCheck size={22} className="text-blue-500" />
              Project Settings & Governance
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Workspace: <span className="text-slate-200 font-semibold">{project.name}</span> (Owner:{' '}
              <span className="text-slate-300 font-mono">{project.owner_id}</span>)
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 px-5 bg-[#141923]">
          <button
            onClick={() => setActiveTab('quotas')}
            className={`py-3 px-4 font-medium text-sm border-b-2 transition flex items-center gap-2 ${
              activeTab === 'quotas'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <BarChart2 size={16} /> Quotas & Limits
          </button>
          <button
            onClick={() => setActiveTab('team')}
            className={`py-3 px-4 font-medium text-sm border-b-2 transition flex items-center gap-2 ${
              activeTab === 'team'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users size={16} /> Team & Access Control
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`py-3 px-4 font-medium text-sm border-b-2 transition flex items-center gap-2 ${
              activeTab === 'audit'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText size={16} /> Audit Trail
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {error && (
            <div className="mb-4 p-3 bg-red-950/60 border border-red-800/80 rounded-lg text-red-200 text-xs flex items-center gap-2">
              <AlertTriangle size={15} />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="py-12 text-center text-slate-400">Loading project data...</div>
          ) : activeTab === 'quotas' ? (
            <div className="space-y-6">
              <div className="p-4 bg-slate-900/60 rounded-xl border border-slate-800">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                    <HardDrive size={16} className="text-blue-500" /> Storage Consumption
                  </span>
                  <span className="text-xs text-slate-400 font-mono">
                    {formatBytes(usage?.storage_bytes_used || 0)} / {formatBytes(usage?.storage_quota_bytes || 0)} (
                    {usage?.storage_percentage || 0}%)
                  </span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      (usage?.storage_percentage || 0) > 90
                        ? 'bg-red-500'
                        : (usage?.storage_percentage || 0) > 70
                        ? 'bg-amber-500'
                        : 'bg-blue-600'
                    }`}
                    style={{ width: `${Math.min(usage?.storage_percentage || 0, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Hard quota enforced server-side. File uploads exceeding project capacity are rejected with HTTP 413.
                </p>
              </div>

              <div className="p-4 bg-slate-900/60 rounded-xl border border-slate-800">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                    <Layers size={16} className="text-blue-500" /> Record Volume Quota
                  </span>
                  <span className="text-xs text-slate-400 font-mono">
                    {(usage?.records_used || 0).toLocaleString()} / {(usage?.records_quota || 0).toLocaleString()} (
                    {usage?.records_percentage || 0}%)
                  </span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      (usage?.records_percentage || 0) > 90
                        ? 'bg-red-500'
                        : (usage?.records_percentage || 0) > 70
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(usage?.records_percentage || 0, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Protects system memory and database performance. Ingestion and synthesis stop if quota is reached.
                </p>
              </div>

              <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl text-xs text-slate-300 space-y-1">
                <div className="font-semibold text-slate-100 flex items-center gap-1.5">
                  <ShieldAlert size={15} className="text-blue-500" /> Rate Limiting & Abuse Defense Active:
                </div>
                <div>• General API: 300 requests / 60 seconds rolling window per tenant.</div>
                <div>• AI Model Batch Annotation: 30 requests / 60 seconds rolling window.</div>
                <div>• Synthetic Generation: 25 batches / 60 seconds rolling window.</div>
              </div>
            </div>
          ) : activeTab === 'team' ? (
            <div className="space-y-6">
              {/* Add member form */}
              <form onSubmit={handleAddMember} className="p-4 bg-slate-900/70 rounded-xl border border-slate-800 flex gap-3 items-end">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-300 mb-1">User Identifier</label>
                  <input
                    type="text"
                    placeholder="e.g. alice@team.internal"
                    value={newUserId}
                    onChange={(e) => setNewUserId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>
                <div className="w-36">
                  <label className="block text-xs font-medium text-slate-300 mb-1">Role</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="editor">Editor (Write)</option>
                    <option value="viewer">Viewer (Read)</option>
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={addingMember || !newUserId.trim()}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition"
                >
                  {addingMember ? 'Adding...' : 'Add Member'}
                </button>
              </form>

              {/* Members table */}
              <div className="rounded-xl border border-slate-800 overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-900/80 text-xs font-medium text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-4">User</th>
                      <th className="py-2.5 px-4">Role</th>
                      <th className="py-2.5 px-4">Permissions</th>
                      <th className="py-2.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {members.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-900/40">
                        <td className="py-3 px-4 font-mono text-xs text-white">
                          {m.user_id}
                          {m.user_id === project.owner_id && (
                            <span className="ml-2 text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded">
                              Owner
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-block px-2 py-0.5 text-xs rounded font-medium ${
                              m.role === 'owner'
                                ? 'bg-amber-500/20 text-amber-300'
                                : m.role === 'editor'
                                ? 'bg-indigo-500/20 text-indigo-300'
                                : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            {m.role}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-400">
                          {m.role === 'owner' && 'Full control, member management, deletion'}
                          {m.role === 'editor' && 'Upload, review, annotate, export, synthesize'}
                          {m.role === 'viewer' && 'Read-only dataset inspection and download'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {m.user_id !== project.owner_id ? (
                            <button
                              onClick={() => handleRemoveMember(m.user_id)}
                              className="text-xs text-red-400 hover:text-red-300 hover:underline"
                            >
                              Remove
                            </button>
                          ) : (
                            <span className="text-xs text-slate-600">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-between items-center text-xs text-slate-400">
                <span>Recent security, administrative, and lifecycle actions in this project:</span>
                <span className="font-mono">{auditLogs.length} events</span>
              </div>

              {auditLogs.length === 0 ? (
                <div className="py-8 text-center text-slate-500 text-xs">No audit events recorded yet.</div>
              ) : (
                <div className="rounded-xl border border-slate-800 overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900/80 font-medium text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="py-2.5 px-3">Timestamp</th>
                        <th className="py-2.5 px-3">Action</th>
                        <th className="py-2.5 px-3">Actor</th>
                        <th className="py-2.5 px-3">Resource</th>
                        <th className="py-2.5 px-3">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {auditLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-900/40">
                          <td className="py-2 px-3 text-slate-400 whitespace-nowrap">
                            {log.created_at ? new Date(log.created_at).toLocaleString() : '—'}
                          </td>
                          <td className="py-2 px-3">
                            <span className="px-1.5 py-0.5 bg-slate-800 text-indigo-300 rounded font-semibold text-[10px]">
                              {log.action}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-slate-300">{log.user_id}</td>
                          <td className="py-2 px-3 text-slate-400">
                            {log.resource_type} {log.resource_id ? `(${log.resource_id})` : ''}
                          </td>
                          <td className="py-2 px-3 text-slate-400 max-w-xs truncate" title={JSON.stringify(log.details)}>
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

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-[#161c27] flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-lg transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
