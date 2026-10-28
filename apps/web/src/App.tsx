import React, { useEffect, useState, useCallback, useRef } from 'react';
import { checkHealth, fetchProjects, fetchDatasetDetail } from './api';
import { CreateProjectModal } from './components/CreateProjectModal';
import { DatasetDetail } from './components/DatasetDetail';
import { Header, BreadcrumbItem } from './components/Header';
import { LandingPage } from './components/LandingPage';
import { ProjectDetail } from './components/ProjectDetail';
import { ProjectList } from './components/ProjectList';
import { Sidebar } from './components/Sidebar';
import { DirectionalPageTransition } from './components/ui/DirectionalPageTransition';
import { CommandPalette } from './components/ui/CommandPalette';
import { FloatingScrollbar } from './components/ui/FloatingScrollbar';
import { Project } from './types';

const SystemHealthView = React.lazy(() =>
  import('./components/SystemHealthView').then((m) => ({ default: m.SystemHealthView }))
);
const GovernanceView = React.lazy(() =>
  import('./components/GovernanceView').then((m) => ({ default: m.GovernanceView }))
);
const ProvidersView = React.lazy(() =>
  import('./components/ProvidersView').then((m) => ({ default: m.ProvidersView }))
);

type ViewMode = 'landing' | 'projects' | 'project_detail' | 'dataset_detail' | 'health' | 'governance' | 'providers';

export const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewMode>('landing');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);
  const [currentDatasetName, setCurrentDatasetName] = useState<string | null>(null);
  const [direction, setDirection] = useState<1 | -1>(1);

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoadedProjectsOnce, setHasLoadedProjectsOnce] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [systemHealth, setSystemHealth] = useState<any>(null);
  const mainWrapperRef = useRef<HTMLDivElement>(null);

  // Responsive sidebar collapse state (default collapsed on tablet 768-1023px)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 768 && window.innerWidth < 1024;
    }
    return false;
  });

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Global window resize listener for tablet rail
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768 && window.innerWidth < 1024) {
        setIsSidebarCollapsed(true);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Global keyboard shortcuts (Cmd+K for Command Palette, Cmd+B to toggle sidebar)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        setIsSidebarCollapsed((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const loadProjects = async (silent = false) => {
    if (!silent && !hasLoadedProjectsOnce) {
      setLoading(true);
    }
    try {
      const data = await fetchProjects(includeArchived);
      setProjects(data);
      setHasLoadedProjectsOnce(true);
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
    } else if (raw === 'providers') {
      setSelectedProjectId(null);
      setSelectedDatasetId(null);
      setCurrentView('providers');
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
    loadProjects(hasLoadedProjectsOnce);
    loadHealth();
  }, [includeArchived]);

  // Resolve dataset metadata when selectedDatasetId changes
  useEffect(() => {
    if (selectedDatasetId) {
      fetchDatasetDetail(selectedDatasetId)
        .then((res) => {
          if (res?.dataset) {
            setCurrentDatasetName(res.dataset.name);
            if (!selectedProjectId && res.dataset.project_id) {
              setSelectedProjectId(res.dataset.project_id);
            }
          }
        })
        .catch(() => setCurrentDatasetName(null));
    } else {
      setCurrentDatasetName(null);
    }
  }, [selectedDatasetId, selectedProjectId]);

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
    } else if (view === 'providers') {
      setSelectedProjectId(null);
      setSelectedDatasetId(null);
      window.location.hash = 'providers';
    } else if (view === 'health') {
      window.location.hash = 'health';
    }
  };

  const currentProject = projects.find((p) => p.id === selectedProjectId);

  // Compute rich breadcrumbs based on resolved application data
  const breadcrumbs: BreadcrumbItem[] = [
    {
      label: 'Home',
      onClick: () => handleNavigate('landing'),
    },
  ];

  if (currentView === 'projects') {
    breadcrumbs.push({ label: 'Projects' });
  } else if (currentView === 'governance') {
    breadcrumbs.push({ label: 'Governance & Quotas' });
  } else if (currentView === 'providers') {
    breadcrumbs.push({ label: 'Model Providers & API Keys' });
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
      breadcrumbs.push({ label: `Project ${selectedProjectId.slice(0, 8)}` });
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
    breadcrumbs.push({
      label: currentDatasetName || 'Dataset Overview',
    });
  }

  return (
    <div className="app-container">
      <Sidebar
        currentView={currentView}
        onNavigate={handleNavigate}
        systemHealth={systemHealth}
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
      />

      <div className="main-wrapper" ref={mainWrapperRef}>
        <Header
          breadcrumbs={breadcrumbs}
          onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
          onToggleMobileSidebar={() => setIsMobileSidebarOpen((prev) => !prev)}
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
                onOpenCreateProject={() => setIsCreateModalOpen(true)}
                projectCount={projects.length}
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

            {currentView === 'health' && (
              <React.Suspense fallback={<div style={{ padding: '3rem', textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto 0.5rem' }} />Loading health diagnostics...</div>}>
                <SystemHealthView />
              </React.Suspense>
            )}
            {currentView === 'governance' && (
              <React.Suspense fallback={<div style={{ padding: '3rem', textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto 0.5rem' }} />Loading governance console...</div>}>
                <GovernanceView />
              </React.Suspense>
            )}
            {currentView === 'providers' && (
              <React.Suspense fallback={<div style={{ padding: '3rem', textAlign: 'center' }}><div className="spinner" style={{ margin: '0 auto 0.5rem' }} />Loading model providers...</div>}>
                <ProvidersView />
              </React.Suspense>
            )}
          </DirectionalPageTransition>
        </main>

        {/* Shorter, Auto-Fading Overlay Scrollbar Docked Strictly Below Top Header */}
        <FloatingScrollbar containerRef={mainWrapperRef} offsetTop={56} />
      </div>

      {/* Global Command Palette */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        projects={projects}
        onNavigate={handleNavigate}
        onSelectProject={handleSelectProject}
        onOpenCreateProject={() => setIsCreateModalOpen(true)}
      />

      {/* Create Project Dialog */}
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
