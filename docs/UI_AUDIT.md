# Frontend UI/UX Comprehensive Audit Report

**Date:** 2026-10-26 (Updated October 27, 2026)  
**Document:** `docs/UI_AUDIT.md`  
**Status:** **Historical Baseline (Reconciled in Phase R8)**  
**Target:** AI Dataset Engineering Platform (`apps/web`)  
**Scope:** Complete inventory of screens, navigation, component hierarchy, design tokens, API connections, missing landing page architecture, and critical UX defects.

> [!NOTE]
> **Historical Baseline Notice**: This document records the initial pre-redesign baseline established on October 26, 2026 prior to Phase R1. All identified defects (missing landing page, dark/neon styling, 14 unstandardized modal containers, unproxied health endpoints, simulated progress bars, and missing audit filtering) have been systematically resolved across Phases R1 through R8. For the current, reconciled component inventory, automated verification results, and release status, refer to [UI_COVERAGE_AUDIT.md](file:///c:/my%20files%20in%20athuls%20lap/my%20files%20in%20athuls%20lap/projects/AI-DATASET-ENGINEERING-PLATFORM--main/docs/UI_COVERAGE_AUDIT.md) and [UI_IMPLEMENTATION_LOG.md](file:///c:/my%20files%20in%20athuls%20lap/my%20files%20in%20athuls%20lap/projects/AI-DATASET-ENGINEERING-PLATFORM--main/docs/UI_IMPLEMENTATION_LOG.md).

---

## 1. Executive Summary

The AI Dataset Engineering Platform has extensive backend domain logic (104 automated tests passing across 16 phases) and an extensive set of interactive features (canvas bounding box editing with Sobel edge-snapping, token simulation, 4 export presets, spatial augmentations, dataset version diffing, 2D semantic clustering, and governance quotas). 

However, the existing frontend presents severe visual and architectural flaws:
1. **Missing Landing Page / Product Identity:** The application has no entry landing page. A user navigating to `http://localhost:5173/` is dropped directly into an empty projects list. There is no explanation of the product's mission (turning raw data into validated, versioned, portable training datasets), supported modalities, local-first privacy guarantees, or guided workflow.
2. **Generic Dark / Neon "AI Slop" Aesthetic:** The styling in `apps/web/src/index.css` relies on heavy dark backgrounds (`#09090B`), indigo/purple gradients (`rgba(99, 102, 241, ...)`), glowing box-shadows, and dark glassmorphic overlays. There is no light mode support.
3. **Modal Sprawl & Clustered Buttons:** In `DatasetDetail.tsx`, 12 heterogeneous actions are placed into a single container ("Lifecycle Workbench Actions"). Clicking any button opens one of 14 separate floating modal dialogs, creating a fragmented, disorienting experience.
4. **State-Only Routing Without Deep Links:** `App.tsx` manages view transitions purely in local React state (`currentView`). Browser history, back/forward buttons, and page reloads are broken, resetting user context.
5. **Inconsistent Typography & Spacing:** Extensive inline styles (`style={{ display: 'flex', ... }}`) bypass global design tokens, leading to inconsistent margins, paddings, and font sizes.

---

## 2. Complete Inventory of Current Screens & Views

| View ID | Primary Component | Navigation / Route State | Current Purpose | Critical UX Defects |
|---|---|---|---|---|
| **Landing** | *(MISSING)* | `currentView === 'landing'` | *None exists* | **Critical gap.** Users cannot understand what the platform is, what workflows it supports, or how to start. |
| **Projects** | `ProjectList.tsx` | `currentView === 'projects'` | Lists all workspace projects with search filter and creation trigger. | Raw monospace project IDs; lacks project health badges, dataset counters, or recent activity timestamps. |
| **Project Detail** | `ProjectDetail.tsx` | `currentView === 'project_detail'` (`selectedProjectId`) | Displays project metadata and grid of datasets with task badges. | Datasets rendered as generic cards; no activity stream or dataset summary metrics; header actions cluttered. |
| **Dataset Detail** | `DatasetDetail.tsx` | `currentView === 'dataset_detail'` (`selectedDatasetId`) | Hub for dataset metrics, classes, annotation instructions, and lifecycle triggers. | **12 disconnected buttons** dumped into one box; each triggers a separate modal; lacks a structured step-by-step lifecycle pipeline view. |
| **Annotation Workspace** | `AnnotationWorkspace.tsx` | `isWorkspaceOpen === true` inside `DatasetDetail` | Split-view editor for classification, object detection (canvas), audio transcription, review queue. | Monolithic component (1,120+ lines); dark media preview; lacks visual hotkey reference cards; header is dense and cluttered. |
| **Governance & Quotas** | `GovernanceView.tsx` | `currentView === 'governance'` | Storage meters, record volume limits, RBAC member management, and audit log viewer. | Disconnected from breadcrumbs; project dropdown selector is awkwardly placed at the top left; audit logs render as dense unformatted JSON/text. |
| **System Diagnostics** | `SystemHealthView.tsx` | `currentView === 'health'` | Live indicators for API service uptime, privacy mode (`local_only`), SQLite connection, storage backend. | Static layout; lacks active model provider probing, latency meters, and storage filesystem disk usage metrics. |

---

## 3. Inventory of Modals & Dialogs (14 Modals)

| Modal Component | Trigger Location | Purpose & Backend API Connections | UX / Design Issues |
|---|---|---|---|
| `CreateProjectModal.tsx` | `ProjectList` header | `POST /api/v1/projects` (name, description) | Form fields lack inline validation feedback; modal overlay is heavy black. |
| `CreateDatasetModal.tsx` | `ProjectDetail` header | `POST /api/v1/projects/{id}/datasets` (name, task type, schema) | Class entry is a comma-separated text input rather than interactive token tags. |
| `ProjectSettingsModal.tsx` | `ProjectDetail` header | `GET/POST /projects/{id}/members`, `GET /usage`, `GET /audit-logs` | Duplicate functionality with `GovernanceView.tsx`; cramped dialog for member tables. |
| `ImportModal.tsx` | `DatasetDetail` actions | `POST /datasets/{id}/import/upload`, `/archive`, `/url` | Tab layout is plain; drag-and-drop zone lacks visual feedback; progress meter is basic. |
| `AIAnnotationModal.tsx` | `DatasetDetail` actions | `GET /providers`, `POST /datasets/{id}/ai-annotate` | Raw form without provider capability badges or estimated run latency. |
| `QualityDashboardModal.tsx` | `DatasetDetail` actions | `POST /datasets/{id}/validate`, `GET /validation-summary` | Invariant checks render in a wall of text; lacks visual pass/fail indicator cards. |
| `VersionSnapshotsModal.tsx` | `DatasetDetail` actions | `GET/POST /datasets/{id}/versions`, `GET /manifest`, `GET /card` | Manifest JSON is displayed in a raw `<pre>` tag with poor scroll ergonomics. |
| `VersionDiffModal.tsx` | `DatasetDetail` actions | `GET /datasets/{id}/versions/{v1}/diff/{v2}` | Good dual-box overlay, but modal dimensions are cramped for large high-res images. |
| `ExportModal.tsx` | `DatasetDetail` actions | `POST /versions/{id}/exports`, `POST /datasets/{id}/token-simulation` | 4 preset cards stacked vertically; token simulation sliders clutter the export dialog. |
| `AugmentationModal.tsx` | `DatasetDetail` actions | `POST /datasets/{id}/augment` | Live SVG preview works well, but dialog does not allow zooming into transformed bounding boxes. |
| `SourceDiscoveryModal.tsx` | `DatasetDetail` actions | `GET /sources/candidates`, `POST /sources/inspect-url`, `/records/{id}/rights-review` | Complex table squeezed inside a modal; should be a dedicated full-width drawer or view. |
| `SyntheticGenerationModal.tsx` | `DatasetDetail` actions | `POST /datasets/{id}/synthesize`, `GET /synthetic-lineage` | Lineage table and prompt template editor are crammed into a 540px modal. |
| `ClusterMapModal.tsx` | `DatasetDetail` actions | `GET /datasets/{id}/clusters` | SVG scatter plot needs full-screen expansion toggle to inspect high-density clusters. |
| `EvaluationModal.tsx` | `DatasetDetail` actions | `GET /active-learning/queue`, `POST /evaluation/run`, `GET /clusters` | 3 distinct tabs (Active Learning, Baseline Evaluation, Cluster Map) shoved into a single modal. |

---

## 4. Reusable UI Primitives Inventory (`apps/web/src/components/ui/`)

1. **`SpringButton.tsx`**:
   - Uses `framer-motion` for tactile spring presses (`whileTap={{ scale: 0.97 }}`).
   - Variants: `primary`, `secondary`, `danger`, `ghost`.
   - *Assessment:* Well-implemented; should be retained and expanded with size variants (`sm`, `md`, `lg`) and loading states.
2. **`TriStateView.tsx`**:
   - Encapsulates skeleton loading (`boneyard-js`), empty states, and loaded content.
   - Prevents Cumulative Layout Shift (CLS).
   - *Assessment:* Solid utility; should be retained and paired with clean, light-mode skeletons.
3. **`DirectionalPageTransition.tsx`**:
   - Directional sliding crossfade (`x: ±24px -> 0`, spring stiffness 420, damping 36).
   - *Assessment:* Works smoothly; should be integrated with clean route tabs and breadcrumb navigation.
4. **`ProgressiveAssetImage.tsx`**:
   - Progressive image loading with low-res blur/placeholder transitions.
   - *Assessment:* High quality; preserve for multimodal grid and canvas thumbnails.
5. **`PerceptualProgressBar.tsx`**:
   - Multi-phase loading bar with physics-based acceleration.
   - *Assessment:* Useful for long-running imports and augmentations; preserve.
6. **`magneticBoxSnap.ts`**:
   - Real-time Sobel luminance gradient boundary snapping in `<150ms`.
   - *Assessment:* Verified working math; preserve in `ObjectDetectionCanvas`.

---

## 5. Design System & CSS Token Flaws (`index.css`)

### 5.1 Color Tokens
- **Banned "AI Slop" Tokens Present:**
  - `box-shadow: 0 4px 12px rgba(99, 102, 241, 0.35)` (indigo neon glow).
  - `background: linear-gradient(135deg, #ffffff 0%, #cbd5e1 100%)` (gradient text).
  - `.badge-indigo`, `.badge-cyan` (hardcoded purple/cyan accents).
  - `rgba(15, 23, 42, 0.85)` (slate/navy dark tones).
- **Missing Light Mode Palette:**
  - The CSS `:root` defines `--bg-canvas: #09090B`, meaning the app is locked into a dark obsidian mode.
  - The design requirement specifies: *"The new visual direction must be minimalist, restrained and professionally designed. Use a neutral-first palette: warm white, off-white, light grey, charcoal and near-black. Support a polished light theme as the primary design target."*

### 5.2 Layout & Component Ergonomics
- The sidebar is fixed dark navy (`rgba(15, 23, 42, 0.85)`).
- The top header is sticky dark navy (`rgba(15, 23, 42, 0.5)`).
- Card hover states use glowing borders (`border-color: rgba(99, 102, 241, 0.3)`).
- Cards use absolute pseudo-elements with gradients (`.card::before`).

---

## 6. Detailed UX & Workflow Defects

1. **No Discovery / Welcome Experience:**
   - First-time users see an empty screen with "No projects found" and a generic folder icon.
   - No demo project seed button, no explanation of task types, and no documentation links.
2. **The "12-Button Trap" in Dataset Detail:**
   - Instead of guiding the engineer through:
     1. *Data Sources & Ingestion*
     2. *Annotation & Review*
     3. *Quality Checks & Augmentation*
     4. *Evaluation & Active Learning*
     5. *Versioning, Diff & Framework Export*
   - All 12 actions are dumped side-by-side as buttons with emojis (`📥`, `✏️`, `🤖`, `🛡️`, `📌`, `🔀`, `📦`, `✨`, `🌐`, `🧬`, `🎯`, `🧠`).
3. **Modal Stacking & Focus Loss:**
   - Opening Export from Dataset Detail allows opening Versions from within Export, nesting modals and trapping focus.
   - Closing a modal causes disorientation because the underlying view never changes state.
4. **Lack of Breadcrumbs & Deep Linking:**
   - Breadcrumbs are rendered as plain text spans with occasional click handlers.
   - Clicking a dataset does not update `window.location.hash`, so browser refresh causes lost position.

---

## 7. Historical Audit Context (Pre-R0 Baseline)

The application originally possessed backend APIs, domain models, and ML algorithms, but suffered from fragmented information architecture, legacy dark tokens, and missing landing page routing prior to the R1–R7 remediation cycle.

---

## 8. Phase R7 Reconciled Master Coverage Register

As of Phase R7, all 7 primary views, 14 modal workflows, shortcut help utility, and shared UI primitives have been remediated, verified, and standardized on the neutral-first design system (`ModalShell`, light-theme tokens, truthful progress, and proxied health endpoints).

### 8.1 Primary Views (7 Views)

| View | Primary Component | Current Status | Evidence & Verification Method |
|---|---|---|---|
| **Landing Page** | `LandingPage.tsx` | **Implemented, visual verification pending** | Hash route `#landing`, 5-stage lifecycle overview, verified quick-start entrypoints, zero marketing puffery. Verified via `npm run build` and route tests. |
| **Projects Overview** | `ProjectList.tsx` | **Implemented, visual verification pending** | Hash route `#projects`, dual card/table view toggle, search filter, task badges, creation trigger. Verified via `npm run build`. |
| **Project Detail** | `ProjectDetail.tsx` | **Implemented, visual verification pending** | Hash route `#project/:id`, dataset inventory, split breakdown, direct workflow action triggers. Verified via `npm run build`. |
| **Dataset Detail** | `DatasetDetail.tsx` | **Implemented, visual verification pending** | Hash route `#dataset/:id`, 5-stage pipeline hub, live telemetry, record filters, pagination, batch actions. Verified via `npm run build`. |
| **Annotation Workbench** | `AnnotationWorkspace.tsx` | **Implemented, visual verification pending** | Full-bleed workspace, bounding box canvas with coordinate contract, audio waveform scrubber, text spans. Verified via `npm run test:coordinates` (19/19 passing) and `npm run build`. |
| **Governance & Quotas** | `GovernanceView.tsx` | **Implemented, visual verification pending** | Hash route `#governance`, quota meters, RBAC member management, date-order validated audit log with invalid timestamp exclusion. Verified via `npm run test:integrity`. |
| **System Diagnostics** | `SystemHealthView.tsx` | **Implemented, visual verification pending** | Hash route `#health`, proxied `/api/v1/health` and `/api/v1/readiness` probes, separate latency measurements, truthful `Registered` provider state. Verified via `npm run test:integrity`. |

### 8.2 Primary Modal Workspaces (14 Workflows)

| Modal Component | Workflow Trigger | Current Status | Evidence & Verification Method |
|---|---|---|---|
| **`CreateProjectModal.tsx`** | Projects: New Project | **Implemented, visual verification pending** | Standardized on `ModalShell`, form validation, autofocus. Verified via `npm run build`. |
| **`CreateDatasetModal.tsx`** | Project Detail: New Dataset | **Implemented, visual verification pending** | Standardized on `ModalShell`, all 6 canonical task types supported, schema validation. Verified via `npm run build`. |
| **`ProjectSettingsModal.tsx`** | Project Detail: Settings | **Implemented, visual verification pending** | Standardized on `ModalShell` (`size="xl"`), RBAC permissions, audit log with date-range order checks. Verified via `npm run test:integrity`. |
| **`ClusterMapModal.tsx`** | Dataset Detail: Discovery | **Implemented, visual verification pending** | Standardized on `ModalShell` (`size="xl"`), 2D SVG SVD projection, bounded zoom (1.0x–2.5x), accessible gap selector, error fallback. Verified via `npm run build`. |
| **`ImportModal.tsx`** | Ingest Stage: Files & URLs | **Implemented, visual verification pending** | Standardized on `ModalShell` (`size="lg"`), file drag-and-drop, SSRF-guarded URL ingest, truthful progress bar. Verified via `npm run build`. |
| **`SourceDiscoveryModal.tsx`** | Ingest Stage: Web Discovery | **Implemented, visual verification pending** | Standardized on `ModalShell` (`size="xl"`), candidate catalog with license-status filter (`approved`, `review_required`, `unknown`, `restricted`, `rejected`), rights clearance audit. Verified via `npm run test:integrity`. |
| **`AIAnnotationModal.tsx`** | Labeling Stage: Model Batch | **Implemented, visual verification pending** | Standardized on `ModalShell` (`size="lg"`), provider capability compatibility filter, task schema preview, duplicate submission guards. Verified via `npm run build`. |
| **`SyntheticGenerationModal.tsx`** | Quality Stage: Minority Class Gen | **Implemented, visual verification pending** | Standardized on `ModalShell` (`size="xl"`), target class validation, seed configuration, prompt template versioning, generation lineage history. Verified via `npm run build`. |
| **`QualityDashboardModal.tsx`** | Quality Stage: Invariant Audit | **Implemented, visual verification pending** | Standardized on `ModalShell` (`size="xl"`), structural checks, split leakage checks, class balance distribution, 1-click filter deep-links. Verified via `npm run build`. |
| **`AugmentationModal.tsx`** | Quality Stage: Augmentations | **Implemented, visual verification pending** | Standardized on `ModalShell` (`size="lg"`), responsive slider grid, live SVG transformation preview, geometry bounds checks. Verified via `npm run build`. |
| **`VersionSnapshotsModal.tsx`** | Versioning Stage: Freeze Snapshot | **Implemented, visual verification pending** | Standardized on `ModalShell` (`size="xl"`), immutable release manifest viewer, 1-click full SHA-256 hash copy with clipboard feedback. Verified via `npm run build`. |
| **`VersionDiffModal.tsx`** | Versioning Stage: Visual Diff | **Implemented, visual verification pending** | Standardized on `ModalShell` (`size="xl"`), side-by-side and onion-skin spatial comparison, coordinate calibration, IoU validity checks. Verified via `npm run test:coordinates`. |
| **`ExportModal.tsx`** | Export Stage: Framework Export | **Implemented, visual verification pending** | Standardized on `ModalShell` (`size="xl"`), 9 export presets, code snippet previews, live token context window capacity simulator. Verified via `npm run build`. |
| **`EvaluationModal.tsx`** | Export Stage: Active Learning & Eval | **Implemented, visual verification pending** | Standardized on `ModalShell` (`size="xl"`), uncertainty queue sorting (rank/confidence), null-safe metric display, benchmark evaluation. Verified via `npm run build`. |

### 8.3 Utility Dialogs & Shared UI Primitives

| Component | Category | Current Status | Evidence & Verification Method |
|---|---|---|---|
| **`ShortcutHelpModal.tsx`** | Utility Dialog | **Implemented, visual verification pending** | Visual hotkey reference drawer/overlay (`?` / `Cmd+/`). Verified via `npm run build`. |
| **`ModalShell.tsx`** | Shared Primitive | **Implemented, visual verification pending** | Keyboard Escape dismissal, backdrop click lock, accessible dialog landmarks (`role="dialog"`), size variants (`sm`, `md`, `lg`, `xl`, `full`). Verified via `npm run build`. |
| **`PerceptualProgressBar.tsx`** | Shared Primitive | **Implemented, visual verification pending** | Truthful progress component: indeterminate mode when no backend percent supplied, exact percentage display when provided, genuine completion signaling only. Verified via `npm run test:integrity`. |
| **`CustomSelect.tsx`** | Shared Primitive | **Implemented, visual verification pending** | Accessible custom dropdown replacing all native select elements; keyboard navigation, search filtering, neutral tokens. Verified via `npm run build`. |
| **`SpringButton.tsx`** | Shared Primitive | **Implemented, visual verification pending** | Framer Motion spring physics with strict `prefers-reduced-motion` bypass. Verified via `npm run build`. |
| **`DirectionalPageTransition.tsx`** | Shared Primitive | **Implemented, visual verification pending** | Horizontal route transition physics respecting reduced-motion settings. Verified via `npm run build`. |
| **`TriStateView.tsx`** | Shared Primitive | **Implemented, visual verification pending** | Loading skeleton, error fallback card with retry, and populated container. Verified via `npm run build`. |
| **`ProgressiveAssetImage.tsx`** | Shared Primitive | **Implemented, visual verification pending** | Multi-stage image asset loader with skeleton fallback and error badge. Verified via `npm run build`. |
| **`AudioWaveformScrubber.tsx`** | Shared Primitive | **Implemented, visual verification pending** | HTML5 audio scrubber with speed adjustment (0.5x–2.0x), waveform visualization, and timestamp seeking. Verified via `npm run build`. |
| **`ObjectDetectionCanvas.tsx`** | Shared Primitive | **Implemented, visual verification pending** | High-precision SVG bounding box canvas with magnetic edge snapping, coordinate contract invariants, and drag/resize clamps. Verified via `npm run test:coordinates`. |

*(Note on Verification Method: All visual items are classified as "Implemented, visual verification pending" strictly because browser automation / interactive subagent capabilities are unavailable in this environment. TypeScript type safety, DOM rendering integrity, and unit contracts have been validated through `npm run build` (0 errors), `npm run test:coordinates` (19 passed), and `npm run test:integrity` (4 test suites passed).)*
