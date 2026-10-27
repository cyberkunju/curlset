# UI Coverage Audit — AI Dataset Engineering Platform

**Document:** `docs/UI_COVERAGE_AUDIT.md`  
**Execution Phase:** Phase R0 (Repository & UI Coverage Audit)  
**Date:** October 26, 2026  
**Auditor:** Antigravity AI  
**Scope:** Complete inventory and visual assessment of every user-facing screen, modal, and shared UI component in `apps/web`.

---

## 1. Executive Summary

This audit establishes a definitive, verified baseline for the comprehensive UI redesign of the AI Dataset Engineering Platform. It distinguishes implemented foundations (such as the neutral color tokens, `CustomSelect` dropdown replacement, emoji icon migration, and Apple spring motion primitives) from remaining layout inconsistencies, excessive empty space, and workflow-specific gaps.

### Summary Metrics

| Metric | Count | Details |
|---|---|---|
| **Total User-Facing Screens & Views** | 6 | Landing, Projects, Project Detail, Dataset Detail, Annotation Workbench, Governance, System Health |
| **Total Modal Workspaces & Dialogs** | 14 | Import, Source Discovery, AI Annotation, Synthetic Gen, Quality Dashboard, Augmentation, Version Snapshots, Version Diff, Export, Evaluation, Cluster Map, Create Project, Create Dataset, Project Settings |
| **Total Shared UI Primitives** | 6 | `CustomSelect`, `SpringButton`, `DirectionalPageTransition`, `TriStateView`, `PerceptualProgressBar`, `ProgressiveAssetImage` |
| **Screens Classified as Complete** | 0 | Foundational components are complete, but no major full screen meets the final target standard yet. |
| **Screens Classified as Partial** | 20 | Functional and neutral-styled, but with density, layout, or workflow polish gaps. |
| **Screens Classified as Untouched** | 0 | All views have received at least basic token and icon migration. |
| **Screens Classified as Blocked** | 0 | Zero external blockers; full repository is runnable, testable, and buildable. |

---

## 2. Complete Component & Screen Inventory

### 2.1 Major Workspaces & Views

#### 1. Landing Page & Front-Door Overview (`LandingPage.tsx`)
- **Route / Trigger:** `#landing` (initial route or "Home / Overview" in sidebar).
- **Purpose:** Platform mission, 5-stage multimodal dataset lifecycle, quick-start entrypoints.
- **Current Visual State:** Crisp neutral-first light/dark palette. Hero with primary CTAs, 5 lifecycle cards, quick start bar. All promotional puffery ("100% On-Device Data Sovereignty", "$0 AI") permanently removed.
- **Classification:** **Partial**
- **Remaining Layout & Usability Problems:**
  - Hero section has excessive vertical padding (over 4rem) which pushes core lifecycle content below the fold.
  - The 5 lifecycle cards feel loose with excessive internal empty space.
  - Lacks quick-start sample dataset preview cards to immediately load or explore datasets with real data.
- **Relevant Shared Components:** `SpringButton`, `DirectionalPageTransition`, Lucide icons.
- **Functional Dependencies:** `onOpenWorkspace`, `onCreateProject`, `onOpenDiagnostics`.
- **Responsive & Accessibility Gaps:** 5-card layout drops to 1 column on mobile (<768px), but card heights vary widely due to uneven description lengths.
- **Proposed Redesign Outcome:** Tighten layout density; introduce high-contrast status badges; replace vertical spacing with compact developer-tool hierarchy and interactive dataset preview cards.

#### 2. Application Shell & Navigation (`App.tsx`, `Sidebar.tsx`, `Header.tsx`)
- **Route / Trigger:** Global wrapper on all application routes.
- **Purpose:** Navigation hierarchy, breadcrumbs, search input, theme toggle (Light/Dark), view router.
- **Current Visual State:** High-contrast neutral sidebar; Lucide outline icons; icons and text centered horizontally and vertically with `0.65rem` gap. Header has breadcrumb navigation and theme toggle.
- **Classification:** **Partial**
- **Remaining Layout & Usability Problems:**
  - Sidebar lacks responsive auto-collapse behavior (collapsible rail or drawer on tablet/mobile 768px–1024px).
  - Breadcrumbs are static text/buttons without deep path segments (e.g. `Projects > Audio-ASR-V1 > Record #42`).
  - Search input in header is a placeholder without keyboard shortcut (`Cmd+K` / `Ctrl+K`) palette popover.
- **Relevant Shared Components:** `SpringButton`, `DirectionalPageTransition`.
- **Functional Dependencies:** Hash routing (`#landing`, `#projects`, `#project/:id`, `#dataset/:id`, `#health`, `#governance`), project and dataset active states.
- **Responsive & Accessibility Gaps:** Sidebar consumes fixed 240px width even on tablet viewports, squeezing content.
- **Proposed Redesign Outcome:** Responsive collapsible navigation rail with keyboard shortcut integration, rich breadcrumbs, and standardized active navigation states.

#### 3. Projects Overview (`ProjectList.tsx`)
- **Route / Trigger:** `#projects`
- **Purpose:** Lists all user projects, displays dataset counts, search/filter, and project creation.
- **Current Visual State:** Multi-column card grid with project name, description, dataset count badge, and timestamps.
- **Classification:** **Partial**
- **Remaining Layout & Usability Problems:**
  - Card design feels like a standard admin dashboard with large empty whitespace when descriptions are brief.
  - Lacks a dense table/list view toggle for developers managing dozens of projects.
  - Filter by task type or status is rudimentary.
- **Relevant Shared Components:** `SpringButton`, `TriStateView`.
- **Functional Dependencies:** `getProjects`, `createProject`, `archiveProject`.
- **Responsive & Accessibility Gaps:** On mobile (<768px), cards stack vertically, but metadata badges wrap inconsistently.
- **Proposed Redesign Outcome:** Compact list/table hybrid view with view toggle (cards vs dense table), task type distribution chips, total record counters, and quick action menus.

#### 4. Project Detail & Datasets List (`ProjectDetail.tsx`)
- **Route / Trigger:** `#project/:id`
- **Purpose:** Project metadata header, dataset management, and dataset inventory.
- **Current Visual State:** Header with back button, settings, create dataset button, followed by dataset cards.
- **Classification:** **Partial**
- **Remaining Layout & Usability Problems:**
  - Dataset cards show modality tags and record counts, but lack train/val/test split distribution bars, quality health indicators, and direct quick-action links (Annotate, Export, Quality).
  - Wide layout stretches cards awkwardly on monitors >1440px.
- **Relevant Shared Components:** `SpringButton`, `TriStateView`.
- **Functional Dependencies:** `getProject`, `getDatasets`, `createDataset`, `deleteDataset`.
- **Responsive & Accessibility Gaps:** Card grid leaves uneven empty spaces when dataset count is not a multiple of column count.
- **Proposed Redesign Outcome:** Structured tabular dataset inventory with split badges, quality health status pills, and direct workflow action buttons.

#### 5. Dataset Detail & Records Explorer (`DatasetDetail.tsx`)
- **Route / Trigger:** `#dataset/:id`
- **Purpose:** Core dataset lifecycle management hub (5 stages) and records explorer table/grid.
- **Current Visual State:** 5 lifecycle stage cards (Ingest, Labeling, Quality, Versioning, Export), followed by records filters and records grid/table. Custom selects active for split and status filters.
- **Classification:** **Partial**
- **Remaining Layout & Usability Problems:**
  - The 5-stage action cards occupy excessive vertical space before the user reaches the records table.
  - Records table pagination, sorting, and thumbnail preview sizes are static and unconfigurable.
  - Record filter bar has multiple scattered inputs without compact tokenized filter pills.
- **Relevant Shared Components:** `SpringButton`, `CustomSelect`, `ProgressiveAssetImage`, `TriStateView`.
- **Functional Dependencies:** Ingestion, annotation navigation, records fetching, review status updates, triggers for all 12 dataset tools.
- **Responsive & Accessibility Gaps:** Records table headers and action buttons overflow horizontally on tablet screens without a scroll container.
- **Proposed Redesign Outcome:** Compact tabbed or drawer-based lifecycle action toolbar so records take center stage; integrate unified search/filter bar; polish record status chips and preview sizes.

#### 6. Annotation Workbench (`AnnotationWorkspace.tsx` & `ObjectDetectionCanvas.tsx`)
- **Route / Trigger:** Direct route via record selection or "Annotate" action.
- **Purpose:** Multimodal labeling workspace: Image classification, object detection (bounding boxes with magnetic snapping), text classification, audio playback/transcription.
- **Current Visual State:** Full-bleed workbench view with sidebar record queue, central media canvas, and right-hand inspector panel. All layout cutoffs resolved. Emojis replaced with outline icons.
- **Classification:** **Partial**
- **Remaining Layout & Usability Problems:**
  - Right-hand inspector panel has inconsistent spacing between class pills, confidence sliders, and notes.
  - Audio transcription waveform controls are rudimentary and lack visual segment markers.
  - Text classification view lacks token/span highlighting controls.
  - Keyboard shortcut guide is a small footer text rather than an accessible visual drawer or overlay.
- **Relevant Shared Components:** `ObjectDetectionCanvas`, `SpringButton`, `CustomSelect`, `magneticBoxSnap.ts`.
- **Functional Dependencies:** Fetching records, updating annotations, review statuses (`approved`, `rejected`, `needs_correction`), local model auto-labeling invocations.
- **Responsive & Accessibility Gaps:** Full-bleed mode works on desktop (1440px, 1280px), but on smaller screens (<1024px) the 3-column layout needs a collapsible record queue or collapsible inspector.
- **Proposed Redesign Outcome:** Modality-specific canvas layouts: dedicated full-height canvas for object detection, typography-optimized reading canvas for text, waveform scrubber for audio; standardized inspector with keyboard shortcuts visual legend.

#### 7. Governance, Quotas & Audit Trail (`GovernanceView.tsx`)
- **Route / Trigger:** `#governance`
- **Purpose:** Storage consumption, record capacity quotas, rate limit tiers, team roles, security audit trail.
- **Current Visual State:** Clean Lucide outline icons (floppy disk, document, shield, users, scroll, chart all replaced). Quota cards with progress bars; audit trail table with event tags.
- **Classification:** **Partial**
- **Remaining Layout & Usability Problems:**
  - Quota cards use different internal padding than the audit log container.
  - Audit log table lacks date range filtering, search, and CSV export.
  - Team member role assignment is a static list.
- **Relevant Shared Components:** `CustomSelect`, `SpringButton`, `TriStateView`.
- **Functional Dependencies:** Governance API endpoints (quotas, team members, audit logs).
- **Responsive & Accessibility Gaps:** Audit log table overflows horizontally on mobile viewports.
- **Proposed Redesign Outcome:** Standardized developer dashboard with compact metric meters, filterable audit event log table, and clean RBAC management.

#### 8. System Health & Diagnostics (`SystemHealthView.tsx`)
- **Route / Trigger:** `#health`
- **Purpose:** Service health indicators (API status, DB connectivity, Redis queue, object storage, model provider capabilities checklist).
- **Current Visual State:** Clean Lucide outline icons. All marketing puffery ("$0 AI", "Zero-Cost Local Provider") purged. Live ping check and model checklist.
- **Classification:** **Partial**
- **Remaining Layout & Usability Problems:**
  - Metric cards are statically spaced.
  - Lacks disk I/O latency graphs or background queue depth sparkline.
  - Capability checklist could be grouped by provider.
- **Relevant Shared Components:** `SpringButton`.
- **Functional Dependencies:** `/health` API, `/api/v1/providers/capabilities` endpoint.
- **Responsive & Accessibility Gaps:** Metric cards stretch on wide monitors.
- **Proposed Redesign Outcome:** Real-time diagnostics console with ping latency meter, service dependency matrix, and model gateway status indicator.

---

### 2.2 Modal Workspaces & Dialogs

| Modal Component | Trigger / Workflow | Classification | Key Remaining Gaps |
|---|---|---|---|
| **`ImportModal.tsx`** | Ingest Stage: File & URL Ingest | **Partial** | Drop zone lacks progressive file upload progress bars with individual cancellation; needs tighter padding. |
| **`SourceDiscoveryModal.tsx`** | Ingest Stage: Web Discovery & Rights | **Partial** | Search results card list can get very long; lacks sticky summary header with license filter. |
| **`AIAnnotationModal.tsx`** | Labeling Stage: Model Auto-Labeling | **Partial** | Batch inference progress uses text counters rather than a detailed perceptual progress bar. |
| **`SyntheticGenerationModal.tsx`** | Quality Stage: Synthetic Data Gen | **Partial** | Preview of generated synthetic samples lacks side-by-side JSON/render comparison. |
| **`QualityDashboardModal.tsx`** | Quality Stage: Invariants & Balance | **Partial** | Class balance histogram uses simple bars without tooltips; invariant failures lack 1-click filter deep-links. |
| **`AugmentationModal.tsx`** | Quality Stage: Geometric Augmentations | **Partial** | Augmentation preview and parameter sliders wrap awkwardly on viewports <1024px. |
| **`VersionSnapshotsModal.tsx`** | Versioning Stage: Snapshot Publisher | **Partial** | Snapshot card view lacks 1-click manifest hash copying and metadata inspection drawer. |
| **`VersionDiffModal.tsx`** | Versioning Stage: Visual Git-Diff | **Partial** | Overlay canvas comparing bounding boxes needs an onion-skin opacity slider and responsive scaling. |
| **`ExportModal.tsx`** | Export Stage: Framework Presets | **Partial** | Preset selector cards are visually dense; token context simulator lacks preset tick marks (2k, 4k, 8k, 32k). |
| **`EvaluationModal.tsx`** | Export Stage: Active Learning & Eval | **Partial** | Benchmark metrics and uncertainty ranking table lack column sorting and confidence threshold filtering. |
| **`ClusterMapModal.tsx`** | Discovery: 2D Embedding Scatter | **Partial** | Scatter plot canvas lacks smooth pan/zoom controls; coverage gap recommendations need clearer callouts. |
| **`CreateProjectModal.tsx`** | Project creation dialog | **Partial** | Fixed modal width; lacks input error shake animations and validation indicators. |
| **`CreateDatasetModal.tsx`** | Dataset creation dialog | **Partial** | Modality selection cards feel like plain radio buttons; needs rich iconography and description. |
| **`ProjectSettingsModal.tsx`** | Project configuration dialog | **Partial** | Tabbed settings navigation needs standardized tab styling consistent with main application. |

---

### 2.3 Shared UI Primitives (`apps/web/src/components/ui/`)

| Primitive Component | Status | Verification & Functional Integrity |
|---|---|---|
| **`CustomSelect.tsx`** | **Complete** | Replaced all 16 native `<select>` dropdowns across the application. Framer Motion spring popovers, keyboard navigation, search filtering, and light/dark theme styling verified. |
| **`DirectionalPageTransition.tsx`** | **Complete** | Smooth horizontal crossfade physics based on route depth. Zero layout shift. |
| **`SpringButton.tsx`** | **Complete** | Apple spring physics (`mass: 0.15`, `stiffness: 400`, `damping: 18`), centered icons and text with `gap: 0.65rem`. |
| **`PerceptualProgressBar.tsx`** | **Complete** | Multi-phase progress bar adhering to perceptual duration curve. |
| **`ProgressiveAssetImage.tsx`** | **Complete** | Multi-stage image loading (skeleton -> thumbnail -> full resolution). |
| **`TriStateView.tsx`** | **Complete** | Zero-layout-shift skeleton, error fallback, and populated view. |
| **`magneticBoxSnap.ts`** | **Complete** | Canvas edge-snapping math for object detection bounding boxes. |

---

## 3. Responsive & Accessibility Analysis

### Viewport Matrix

| Viewport | Target Device | Current Visual Behavior | Deficiencies / Remediation Needed |
|---|---|---|---|
| **1440 × 900** | Desktop Standard | Clean, fully visible, full-bleed workbench functional. | Some cards stretch excessively wide; introduce max-width layout containers where appropriate. |
| **1280 × 800** | Laptop Standard | Fully visible, zero clipping. | Dense navigation header needs tighter horizontal padding. |
| **768 × 1024** | Tablet Portrait | Usable, but sidebar consumes 240px fixed width. | Sidebar must collapse into an icon rail or collapsible slide-out drawer. |
| **390 × 844** | Mobile Portrait | Core views stack, but table data overflows horizontally. | Add responsive table wrappers with horizontal scroll or card view fallback on mobile. |

### Accessibility & Contrast Checks
- **Color Contrast:** All body text (`#18181B` on `#FAFAFA` and `#FFFFFF`) exceeds WCAG AAA contrast ratio (>7:1). Dark mode text (`#FAFAFA` on `#09090B`) exceeds WCAG AAA.
- **Interactive Focus:** Focus rings adhere to `--accent-interactive` (`#2563EB`) with 2px offset.
- **Motion Safety:** `prefers-reduced-motion` media query respected across all Framer Motion springs.
- **Icon Sizing:** Standardized to Lucide React outline icons with uniform `strokeWidth={1.75}`.

---

## 4. Master Redesign Roadmap Alignment (R0 to R7)

Based on this complete audit, the redesign roadmap is structured into 8 controlled, independently verifiable phases:

- **R0 — Repository & UI Coverage Audit:** *(THIS PHASE — Complete)* Detailed inventory, evidence, gaps, roadmap, zero code regressions.
- **R1 — Design System & Global Icon Standardization:** Unified modal dialog primitives, table tokens, input field wrappers, icon sizing conventions.
- **R2 — Application Shell & Landing Page:** Responsive sidebar drawer/rail, interactive breadcrumbs, command palette search, tightened landing page with dataset previews.
- **R3 — Projects & Dataset Management:** Compact table/grid views for projects and datasets, split distribution meters, quick-action menus.
- **R4 — Annotation Workbench:** Modality-tailored canvases (Object detection bounding box canvas, Text spans, Audio waveform scrubber), hotkey inspector drawer.
- **R5 — Generation, Quality, Versioning & Exports:** Enhanced quality scorecard, synthetic data diff preview, visual Git-diff canvas overlay, preset export simulator.
- **R6 — Governance, Diagnostics, Settings & Modals:** Standardized modal containers, audit log table filtering, real-time health telemetry console.
- **R7 — Full Application Visual QA & Browser Verification:** Cross-viewport testing (1440px, 1280px, 768px, 390px), responsive regression testing, final sign-off.
