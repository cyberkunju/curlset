import React, { useEffect, useState, useCallback } from 'react';
import { checkHealth, fetchProjects } from './api';
import { CreateProjectModal } from './components/CreateProjectModal';
import { DatasetDetail } from './components/DatasetDetail';
import { Header } from './components/Header';
import { LandingPage } from './components/LandingPage';
import { ProjectDetail } from './components/ProjectDetail';
import { ProjectList } from './components/ProjectList';
import { Sidebar } from './components/Sidebar';
import { SystemHealthView } from './components/SystemHealthView';
import { GovernanceView } from './components/GovernanceView';
import { DirectionalPageTransition } from './components/ui/DirectionalPageTransition';
import { Project } from './types';

type ViewMode = 'landing' | 'projects' | 'project_detail' | 'dataset_detail' | 'health' | 'governance';

export const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewMode>('landing');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);
  const [direction, setDirection] = useState<1 | -1>(1);

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

  // Sync with Browser Hash
  const syncFromHash = useCallback(() => {
    const raw = window.location.hash.replace(/^#\/?/, '');
    if (!raw || raw === 'landing') {
      setCurrentView('landing');
    } else if (raw === 'projects') {
      setSelectedProjectId(null);
      setSelectedDatasetId(null);
      setCurrentView('projects');
    } else if (raw.startsWith('project/')) {
      const id = raw.replace('project/', '');
      setSelectedProjectId(id);
      setSelectedDatasetId(null);
      setCurrentView('project_detail');
    } else if (raw.startsWith('dataset/')) {
      const id = raw.replace('dataset/', '');
      setSelectedDatasetId(id);
      setCurrentView('dataset_detail');
    } else if (raw === 'governance') {
      setSelectedProjectId(null);
      setSelectedDatasetId(null);
      setCurrentView('governance');
    } else if (raw === 'health') {
      setCurrentView('health');
    }
  }, []);

  useEffect(() => {
    syncFromHash();
    window.addEventListener('hashchange', syncFromHash);
    return () => window.removeEventListener('hashchange', syncFromHash);
  }, [syncFromHash]);

  useEffect(() => {
    loadProjects();
    loadHealth();
  }, [includeArchived]);

  const handleSelectProject = (projectId: string) => {
    setDirection(1);
    setSelectedProjectId(projectId);
    setSelectedDatasetId(null);
    setCurrentView('project_detail');
    window.location.hash = `project/${projectId}`;
  };

  const handleSelectDataset = (datasetId: string) => {
    setDirection(1);
    setSelectedDatasetId(datasetId);
    setCurrentView('dataset_detail');
    window.location.hash = `dataset/${datasetId}`;
  };

  const handleNavigate = (view: string) => {
    setDirection(-1);
    if (view === 'landing') {
      window.location.hash = 'landing';
    } else if (view === 'projects') {
      setSelectedProjectId(null);
      setSelectedDatasetId(null);
      window.location.hash = 'projects';
    } else if (view === 'governance') {
      setSelectedProjectId(null);
      setSelectedDatasetId(null);
      window.location.hash = 'governance';
    } else if (view === 'health') {
      window.location.hash = 'health';
    }
  };

  const currentProject = projects.find((p) => p.id === selectedProjectId);

  // Compute breadcrumbs
  const breadcrumbs: Array<{ label: string; onClick?: () => void }> = [
    {
      label: 'Home',
      onClick: () => handleNavigate('landing'),
    },
  ];

  if (currentView === 'projects') {
    breadcrumbs.push({ label: 'Projects' });
  } else if (currentView === 'governance') {
    breadcrumbs.push({ label: 'Governance & Quotas' });
  } else if (currentView === 'health') {
    breadcrumbs.push({ label: 'System Diagnostics' });
  } else if (currentView === 'project_detail') {
    breadcrumbs.push({
      label: 'Projects',
      onClick: () => handleNavigate('projects'),
    });
    if (currentProject) {
      breadcrumbs.push({ label: currentProject.name });
    } else if (selectedProjectId) {
      breadcrumbs.push({ label: selectedProjectId });
    }
  } else if (currentView === 'dataset_detail') {
    breadcrumbs.push({
      label: 'Projects',
      onClick: () => handleNavigate('projects'),
    });
    if (selectedProjectId && currentProject) {
      breadcrumbs.push({
        label: currentProject.name,
        onClick: () => {
          setDirection(-1);
          window.location.hash = `project/${selectedProjectId}`;
        },
      });
    }
    breadcrumbs.push({ label: 'Dataset Overview' });
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
          <DirectionalPageTransition
            activeKey={`${currentView}_${selectedProjectId || ''}_${selectedDatasetId || ''}`}
            direction={direction}
          >
            {currentView === 'landing' && (
              <LandingPage
                onOpenProjects={() => handleNavigate('projects')}
                onOpenHealth={() => handleNavigate('health')}
                onOpenGovernance={() => handleNavigate('governance')}
              />
            )}

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
                  setDirection(-1);
                  if (selectedProjectId) {
                    window.location.hash = `project/${selectedProjectId}`;
                  } else {
                    window.location.hash = 'projects';
                  }
                }}
              />
            )}

            {currentView === 'health' && <SystemHealthView />}
            {currentView === 'governance' && <GovernanceView />}
          </DirectionalPageTransition>
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
