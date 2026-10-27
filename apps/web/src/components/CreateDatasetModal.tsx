import React, { useState } from 'react';
import { createDataset } from '../api';
import { Dataset, TaskType } from '../types';

interface CreateDatasetModalProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  onCreated: (dataset: Dataset) => void;
}

export const CreateDatasetModal: React.FC<CreateDatasetModalProps> = ({
  projectId,
  isOpen,
  onClose,
  onCreated,
}) => {
  const [name, setName] = useState('');
  const [taskType, setTaskType] = useState<TaskType>('image_classification');
  const [description, setDescription] = useState('');
  const [labelsInput, setLabelsInput] = useState('normal, damaged');
  const [instructions, setInstructions] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const parsedLabels = labelsInput
    .split(',')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Dataset name is required');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const dataset = await createDataset(projectId, {
        name: name.trim(),
        task_type: taskType,
        description: description.trim(),
        annotation_instructions: instructions.trim(),
        label_schema: { labels: parsedLabels },
      });
      setName('');
      setDescription('');
      setInstructions('');
      onCreated(dataset);
    } catch (err: any) {
      setError(err.message || 'Failed to create dataset');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <h2 className="modal-title">Create New Dataset</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        {error && (
          <div style={{ padding: '0.75rem', marginBottom: '1rem', borderRadius: 'var(--radius-sm)', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--rose)', border: '1px solid rgba(239, 68, 68, 0.2)', fontSize: '0.85rem' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="datasetName">Dataset Name *</label>
            <input
              id="datasetName"
              type="text"
              className="form-input"
              placeholder="e.g. Surface Crack Inspection"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="taskType">Task Type *</label>
            <select
              id="taskType"
              className="form-select"
              value={taskType}
              onChange={(e) => setTaskType(e.target.value as TaskType)}
              disabled={loading}
            >
              <option value="image_classification">Image Classification (Single/Multi-label visual tagging)</option>
              <option value="text_classification">Text Classification (Sentiment, topic, intent)</option>
              <option value="object_detection">Object Detection (Bounding boxes with pixel geometry)</option>
              <option value="paired_image_text">Paired Image-Text (Captions, VQA, instruction-tuning)</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="labelsInput">Allowed Classes / Labels (comma separated)</label>
            <input
              id="labelsInput"
              type="text"
              className="form-input"
              placeholder="e.g. normal, damaged, defective"
              value={labelsInput}
              onChange={(e) => setLabelsInput(e.target.value)}
              disabled={loading}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.5rem' }}>
              {parsedLabels.map((lbl, idx) => (
                <span key={idx} className="badge badge-blue">{lbl}</span>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="instructions">Annotation Instructions</label>
            <textarea
              id="instructions"
              className="form-textarea"
              placeholder="Provide clear criteria for human annotators and AI critic models..."
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              disabled={loading}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Creating...' : 'Create Dataset'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
