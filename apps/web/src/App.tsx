import React, { useEffect, useState } from 'react';
import { checkHealth, fetchProjects } from './api';
import { CreateProjectModal } from './components/CreateProjectModal';
import { DatasetDetail } from './components/DatasetDetail';
import { Header } from './components/Header';
import { ProjectDetail } from './components/ProjectDetail';
import { ProjectList } from './components/ProjectList';
import { Sidebar } from './components/Sidebar';
import { SystemHealthView } from './components/SystemHealthView';
import { GovernanceView } from './components/GovernanceView';
import { Project } from './types';

export const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<'projects' | 'project_detail' | 'dataset_detail' | 'health' | 'governance'>('projects');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [systemHealth, setSystemHealth] = useState<any>(null);

  const loadProjects = async () => {
    setLoading(true);
    try {
      const data = await fetchProjects(includeArchived);
      setProjects(data);
    } catch (err: any) {
      console.error('Failed to load projects', err);
    } finally {
      setLoading(false);
    }
  };

  const loadHealth = async () => {
    try {
      const h = await checkHealth();
      setSystemHealth(h);
    } catch (err) {
      console.warn('Backend currently offline or starting');
    }
  };

  useEffect(() => {
    loadProjects();
    loadHealth();
  }, [includeArchived]);

  const handleSelectProject = (projectId: string) => {
    setSelectedProjectId(projectId);
    setSelectedDatasetId(null);
    setCurrentView('project_detail');
  };

  const handleSelectDataset = (datasetId: string) => {
    setSelectedDatasetId(datasetId);
    setCurrentView('dataset_detail');
  };

  const handleNavigate = (view: string) => {
    if (view === 'projects') {
      setSelectedProjectId(null);
      setSelectedDatasetId(null);
      setCurrentView('projects');
    } else if (view === 'governance') {
      setSelectedProjectId(null);
      setSelectedDatasetId(null);
      setCurrentView('governance');
    } else if (view === 'health') {
      setCurrentView('health');
    }
  };

  const currentProject = projects.find((p) => p.id === selectedProjectId);

  // Compute breadcrumbs
  const breadcrumbs: Array<{ label: string; onClick?: () => void }> = [
    { label: currentView === 'governance' ? 'Governance & Quotas' : 'Projects', onClick: () => handleNavigate(currentView === 'governance' ? 'governance' : 'projects') },
  ];

  if (selectedProjectId && currentProject) {
    breadcrumbs.push({
      label: currentProject.name,
      onClick: () => {
        setSelectedDatasetId(null);
        setCurrentView('project_detail');
      },
    });
  }
  if (selectedDatasetId) {
    breadcrumbs.push({
      label: 'Dataset Overview',
    });
  }

  return (
    <div className="app-container">
      <Sidebar
        currentView={currentView}
        onNavigate={handleNavigate}
        systemHealth={systemHealth}
      />

      <div className="main-wrapper">
        <Header
          breadcrumbs={breadcrumbs}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />

        <main className="content-body">
          {currentView === 'projects' && (
            <ProjectList
              projects={projects}
              loading={loading}
              onSelectProject={handleSelectProject}
              onOpenCreateModal={() => setIsCreateModalOpen(true)}
              includeArchived={includeArchived}
              onToggleArchived={setIncludeArchived}
              searchQuery={searchQuery}
            />
          )}

          {currentView === 'project_detail' && selectedProjectId && (
            <ProjectDetail
              projectId={selectedProjectId}
              onSelectDataset={handleSelectDataset}
              onBack={() => handleNavigate('projects')}
              searchQuery={searchQuery}
            />
          )}

          {currentView === 'dataset_detail' && selectedDatasetId && (
            <DatasetDetail
              datasetId={selectedDatasetId}
              onBack={() => {
                setSelectedDatasetId(null);
                setCurrentView('project_detail');
              }}
            />
          )}

          {currentView === 'health' && <SystemHealthView />}
          {currentView === 'governance' && <GovernanceView />}
        </main>
      </div>

      <CreateProjectModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={(newProj) => {
          setIsCreateModalOpen(false);
          setProjects([newProj, ...projects]);
          handleSelectProject(newProj.id);
        }}
      />
    </div>
  );
};

export default App;
