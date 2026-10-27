import React, { useState } from 'react';
import { FolderPlus } from 'lucide-react';
import { createProject } from '../api';
import { Project } from '../types';
import { ModalShell } from './ui/ModalShell';

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (project: Project) => void;
}

export const CreateProjectModal: React.FC<CreateProjectModalProps> = ({ isOpen, onClose, onCreated }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Project name is required');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const project = await createProject({
        name: name.trim(),
        description: description.trim(),
      });
      setName('');
      setDescription('');
      onCreated(project);
    } catch (err: any) {
      setError(err.message || 'Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Create New Project"
      description="Initialize a dedicated workspace container for multimodal dataset splits and versions"
      icon={<FolderPlus size={20} strokeWidth={1.75} style={{ color: 'var(--accent-interactive)' }} />}
      size="md"
    >
      {error && (
        <div style={{ padding: '0.75rem', marginBottom: '1rem', borderRadius: 'var(--radius-sm)', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--rose)', border: '1px solid rgba(239, 68, 68, 0.2)', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label" htmlFor="projectName">Project Name *</label>
          <input
            id="projectName"
            type="text"
            className="form-input"
            placeholder="e.g. Defect Detection Research"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={loading}
            autoFocus
          />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="projectDesc">Description</label>
          <textarea
            id="projectDesc"
            className="form-textarea"
            placeholder="Explain the machine learning task and dataset goals..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={loading}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Creating...' : 'Create Project'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
};
