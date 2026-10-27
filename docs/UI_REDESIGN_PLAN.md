# UI Redesign & Architecture Plan (UI-0 to UI-6)

**Document:** `docs/UI_REDESIGN_PLAN.md`  
**Target:** AI Dataset Engineering Platform (`apps/web`)  
**Design Philosophy:** Minimalist, restrained, desktop-grade developer tool (inspired by Apple macOS design systems, Linear, and Raycast).  
**Primary Visual Target:** Polished, high-contrast **Light Theme** (warm white, off-white, light grey, charcoal, near-black). Retain secondary Dark Theme with identical tokens.  
**Ban List:** Zero purple/violet branding, zero gradient text, zero neon glow, zero glassmorphic blur slop, zero generic AI clichés.

---

## 1. Visual Direction & Neutral-First Design Tokens

### 1.1 The Neutral-First Palette
The primary design target is a crisp, professional light theme with clean structural `1px` borders, subtle tactile surface elevations, and functional status colors used strictly for semantic communication.

```css
:root {
  /* Primary Target: Polished Light Theme */
  --bg-canvas: #FAFAFA;            /* Crisp warm alabaster background */
  --bg-surface: #FFFFFF;           /* Card & container pure white */
  --bg-elevated: #F4F4F5;          /* Toolbars, headers, secondary surfaces */
  --bg-subtle-hover: #E4E4E7;      /* Hover states & active items */
  --border-hairline: #E4E4E7;      /* Precise 1px structural boundaries */
  --border-strong: #D4D4D8;        /* Focused inputs & active borders */
  
  --text-primary: #18181B;         /* High-contrast charcoal / near-black */
  --text-secondary: #52525B;       /* Medium zinc for descriptions & subtitles */
  --text-muted: #71717A;           /* Low-priority labels, timestamps, metadata */
  
  --accent-primary: #18181B;       /* Tactile solid near-black for primary buttons */
  --accent-primary-fg: #FAFAFA;    /* Pure white button text */
  --accent-interactive: #2563EB;   /* Precision technical blue for focus/selection */
  
  /* Restrained Functional Semantic Tokens (Status Only) */
  --status-approved: #10B981;      /* Emerald for human-verified & healthy status */
  --status-pending: #F59E0B;       /* Amber for pending review & warnings */
  --status-disagreement: #F97316;  /* Orange for model-human label divergence */
  --status-rejected: #EF4444;      /* Rose for rejected records & errors */

  /* Clean Shadows & Radius */
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.08);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
}

/* Secondary Dark Theme (Retained with identical tokens) */
.dark {
  --bg-canvas: #09090B;
  --bg-surface: #111114;
  --bg-elevated: #18181C;
  --bg-subtle-hover: #222228;
  --border-hairline: #27272A;
  --border-strong: #3F3F46;
  
  --text-primary: #FAFAFA;
  --text-secondary: #A1A1AA;
  --text-muted: #71717A;
  
  --accent-primary: #FAFAFA;
  --accent-primary-fg: #09090B;
  --accent-interactive: #3B82F6;
  
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.35);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.45);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.65);
}
```

### 1.2 Typography & Elements
- **Display & Headings:** `Inter` (-apple-system), weights `600` and `700`. Zero gradient text.
- **Monospace Code/IDs:** `JetBrains Mono`, `Fira Code`. Formatted with subtle pill badges (`background: var(--bg-elevated)`).
- **Icons:** `lucide-react` with uniform `strokeWidth={1.75}`.

---

## 2. Component Migration & Reuse Strategy

| Component | Strategy | Action & Architecture Rationale |
|---|---|---|
| **`LandingPage.tsx`** | **NEW** | Create a dedicated, premium landing page component communicating the product's mission, 5-stage lifecycle, local-first privacy, and quick-start entrypoints. |
| **`App.tsx`** | **REFACTOR** | Add `'landing'` as initial view; add lightweight hash-based routing (`#landing`, `#projects`, `#project/:id`, `#dataset/:id`, `#health`, `#governance`) so page reloads and browser history work seamlessly. |
| **`index.css`** | **REFACTOR** | Replace all legacy indigo/purple, gradient text, and dark-only tokens with the new light-first neutral design tokens and utility classes. |
| **`Sidebar.tsx`** | **REFACTOR** | Add "Overview / Home" top navigation link; clean up light theme styles; simplify status badges. |
| **`Header.tsx`** | **REFACTOR** | Replace plain text breadcrumbs with interactive navigation pills; add theme switcher toggle (Light/Dark); integrate global search. |
| **`ProjectList.tsx`** | **REFACTOR** | Restyle project cards with clean light borders, dataset count badges, task type indicators, and last-modified dates. |
| **`ProjectDetail.tsx`** | **REFACTOR** | Upgrade dataset cards with split counts (`train`/`val`/`test`), class counts, and quick-launch actions. |
| **`DatasetDetail.tsx`** | **REFACTOR** | **Eliminate the 12-button modal cluster.** Group actions into an organized **Stage-Based Pipeline Hub** (5 stages) with clear workflow cards. |
| **`AnnotationWorkspace.tsx`** | **REFACTOR** | Modernize split-view layout; add high-contrast light borders; add keyboard shortcut pill legend (`[A] Approve`, `[N] Next`, `[Shift] Magnetic Snap`). |
| **`ObjectDetectionCanvas.tsx`** | **PRESERVE** | Keep canvas rendering, zoom/pan math, and `magneticBoxSnap.ts` integration; update toolbar button styles to neutral-first. |
| **`ExportModal.tsx`** | **REFACTOR** | Clean up 1-click preset cards (Unsloth, Axolotl, LLaMA-Factory, YOLO) and token simulator sliders into a clean 2-column layout. |
| **`VersionDiffModal.tsx`** | **REFACTOR** | Enlarge visual overlay viewport; polish class balance delta table and IoU shift badges. |
| **`ClusterMapModal.tsx`** | **REFACTOR** | Add full-screen expansion toggle, zoom controls, and clean hover tooltip for coverage gap data deserts. |
| **`GovernanceView.tsx`** | **REFACTOR** | Improve project selector dropdown; format audit log rows with readable event tags and timestamps. |
| **`SystemHealthView.tsx`** | **REFACTOR** | Add live ping check, model provider capabilities checklist, and storage disk path indicators. |
| **`SpringButton.tsx`** | **PRESERVE** | Retain Apple/Linear spring physics; update palette colors. |
| **`TriStateView.tsx`** | **PRESERVE** | Retain `boneyard-js` zero-layout-shift skeletons; adjust light theme colors. |
| **`DirectionalPageTransition.tsx`**| **PRESERVE** | Retain smooth horizontal crossfade. |
| **`ProgressiveAssetImage.tsx`** | **PRESERVE** | Retain image loading pipeline. |
| **`PerceptualProgressBar.tsx`** | **PRESERVE** | Retain multi-phase progress visualization. |

---

## 3. Phased Redesign Implementation Roadmap

```
UI-0 (Audit & Redesign Plan)  [DONE]
  │
  ▼
UI-1 (Design Tokens & Neutral-First CSS Migration)
  │
  ▼
UI-2 (Landing Page & Front-Door Architecture)
  │
  ▼
UI-3 (Navigation, Hash Routing & App Layout Shell)
  │
  ▼
UI-4 (Projects & Datasets Views Modernization)
  │
  ▼
UI-5 (Dataset Detail Lifecycle Hub & Annotation Workbench Polish)
  │
  ▼
UI-6 (Modals, Presets, Cluster Map & Verification)
```

### Phase UI-1: Design System & Neutral-First CSS Migration
- **Goal:** Replace legacy dark/neon styles in `apps/web/src/index.css` with the polished light-first neutral palette and dark theme variables.
- **Tasks:**
  - Define `:root` light palette (warm alabaster `#FAFAFA`, pure white surface `#FFFFFF`, crisp zinc borders `#E4E4E7`, charcoal text `#18181B`).
  - Define `.dark` palette with identical token contracts.
  - Purge all references to `rgba(99, 102, 241, ...)`, gradient text, glowing box-shadows, and neon outlines.
  - Create standard utility classes for buttons, cards, badges, modal overlays, form inputs, and pipeline stages.
- **Exit Gate:** `npm run build` passes; all components render without missing CSS variables.

### Phase UI-2: Front-Door Landing Page (`LandingPage.tsx`)
- **Goal:** Provide a clear, compelling front-door experience explaining the platform and enabling instant entry.
- **Tasks:**
  - Build `apps/web/src/components/LandingPage.tsx`.
  - **Hero Section:** Clear title ("The Multimodal AI Dataset Engineering Platform"), subtitle ("Turn raw multimodal data into reviewed, validated, documented, versioned, and training-ready AI datasets"), and primary CTAs ("Open Workspace", "Explore Sample Projects", "System Diagnostics").
  - **5 Core Lifecycle Stages Section:**
    1. *Data Ingestion & Rights:* SSRF-protected URL ingest, archive unpacking, license attribution tracking.
    2. *Human & AI Annotation:* Magnetic edge-snapped bounding boxes, audio transcription, classification, Ollama local auto-labeling.
    3. *Quality Engine & Invariants:* Split leakage detection, schema validation, near-duplicate perceptual hashing, geometry clamping.
    4. *Versioning & Visual Git-Diff:* Immutable cryptographic manifests, dataset cards, visual bounding box diffs ($v_1$ vs $v_2$).
    5. *Export Presets & Live Token Simulator:* 1-click exports (Unsloth ShareGPT, Axolotl ChatML, LLaMA-Factory, Ultralytics YOLO) + ViT multimodal token context simulator.
  - **Local-First & Privacy Guarantee Card:** Explaining $0 API cost, zero cloud lock-in, 100% offline local SQLite and filesystem storage.
  - **Quick Start / Sample Datasets Bar:** One-click sample project loader or direct route to project creation.
- **Exit Gate:** Landing page renders cleanly with responsive layout, zero broken links, and direct navigation into projects.

### Phase UI-3: Navigation, Hash Routing & App Layout Shell
- **Goal:** Support proper browser navigation (history, back/forward buttons, deep linking) and clean header/sidebar shell.
- **Tasks:**
  - Implement lightweight hash router in `App.tsx` (`#landing`, `#projects`, `#project/:id`, `#dataset/:id`, `#health`, `#governance`).
  - Update `Sidebar.tsx` with neutral styling, Home/Overview link, Projects link, Governance link, and Diagnostics link.
  - Update `Header.tsx` with breadcrumbs, light/dark theme toggle, and search input.
  - Ensure `<DirectionalPageTransition>` smoothly animates view switches.
- **Exit Gate:** Changing views updates URL hash; browser back button navigates to previous view; refreshing page preserves current view.

### Phase UI-4: Projects & Datasets Views Modernization
- **Goal:** Elevate `ProjectList.tsx` and `ProjectDetail.tsx` into clean, professional developer instrument views.
- **Tasks:**
  - Modernize `ProjectList.tsx`: Add project summary chips (dataset count, records count), clean search input, and neutral cards.
  - Modernize `ProjectDetail.tsx`: Add dataset cards showing task type pills, record counts, split distribution meters, and clear "Open Dataset" actions.
  - Update `CreateProjectModal.tsx` and `CreateDatasetModal.tsx` with clean forms and validation states.
- **Exit Gate:** Projects and datasets create, list, filter, and archive smoothly with zero visual layout jumps.

### Phase UI-5: Dataset Detail Lifecycle Hub & Annotation Workbench Polish
- **Goal:** Replace the unorganized 12-button cluster in `DatasetDetail.tsx` with a structured **5-Stage Lifecycle Hub**.
- **Tasks:**
  - In `DatasetDetail.tsx`, organize actions into 5 structured stages:
    - **Stage 1: Ingest & Sources:** Import Media, Source Discovery & Rights Review.
    - **Stage 2: Labeling & AI Acceleration:** Open Annotation Workbench, AI Auto-Labeling (Ollama/Local).
    - **Stage 3: Quality & Augmentation:** Quality Dashboard & Invariants, Geometry-Aware Augmentation, Synthetic Data Generation.
    - **Stage 4: Versioning, Diff & Evaluation:** Publish Version Snapshot, Visual Git-Diff ($v_1$ vs $v_2$), Active Learning & Evaluation.
    - **Stage 5: Export Presets & Simulator:** Export (Unsloth, Axolotl, LLaMA-Factory, YOLO), Live Token Simulator.
  - In `AnnotationWorkspace.tsx`, clean up the 3-column layout, add a hotkey guide banner (`[A] Approve`, `[R] Reject`, `[Shift] Magnetic Edge-Snap`), and polish the media canvas.
- **Exit Gate:** All 12 actions remain 100% accessible and operational, but are logically grouped and visually intuitive.

### Phase UI-6: Modals, Presets, Cluster Map & Final Verification
- **Goal:** Polish all modal dialogs, inspect edge cases, run full test suites, and verify production build.
- **Tasks:**
  - Polish `ExportModal.tsx`, `VersionDiffModal.tsx`, `ClusterMapModal.tsx`, `AugmentationModal.tsx`, and `ProjectSettingsModal.tsx` with neutral styling.
  - Run `.venv\Scripts\pytest tests/` (verify 104+ backend tests continue to pass 100%).
  - Run `.venv\Scripts\ruff check .` (verify 0 lint errors).
  - Run `npm run build` (`tsc -b && vite build`) in `apps/web` (verify clean production build).
- **Exit Gate:** 100% passing tests, 0 lint errors, clean build, and seamless visual inspection.

---

## 4. Test & Verification Plan

1. **Automated Backend & Contract Tests:**
   - Execute `.venv\Scripts\pytest tests/` to verify that zero backend endpoints or data contracts were broken.
2. **Frontend Type Check & Bundle Verification:**
   - Execute `npm run build` in `apps/web` to verify strict TypeScript typing across all components.
3. **Interactive Visual & Navigation Verification:**
   - Landing page loads by default on `http://localhost:5173/` or `http://localhost:5173/#landing`.
   - Clicking "Launch Workspace" navigates to `#projects`.
   - Selecting a project navigates to `#project/:id`.
   - Selecting a dataset navigates to `#dataset/:id`.
   - Stage-based lifecycle hub cleanly opens Import, Workbench, Quality, Diff, Export, and Augment without overlapping or breaking focus.
   - Light/Dark mode toggle transitions all tokens smoothly.

---

## 5. Master Multimodal UI Redesign Roadmap (Phases R0 to R7)

The initial UI-0 through UI-6 iterations established design tokens, icon standardization, and foundational components, but left important gaps in layout density, modal containers, and modality-specific workspaces.

The following master roadmap is evidence-based (derived from `docs/UI_COVERAGE_AUDIT.md`) and organized into strict, independently verifiable vertical phases.

### Phase Status Overview

| Phase | Description | Status | Verification & Deliverables |
|---|---|---|---|
| **R0** | **Repository & UI Coverage Audit** | **COMPLETE** | `docs/UI_COVERAGE_AUDIT.md`, updated `docs/UI_REDESIGN_PLAN.md`, 0 build/test regressions. |
| **R1** | **Design System & Global Icon Standardization** | PENDING AUTHORIZATION | Shared modal shell primitive, table tokens, input field wrappers, icon sizing guidelines. |
| **R2** | **Application Shell & Landing Page** | PENDING AUTHORIZATION | Responsive sidebar drawer/rail, interactive breadcrumbs, command palette search, tightened landing page. |
| **R3** | **Projects & Dataset Management** | PENDING AUTHORIZATION | Compact table/grid views, split distribution meters, quick-action menus. |
| **R4** | **Annotation Workbench (Modality Workspaces)** | PENDING AUTHORIZATION | Modality-tailored canvases (Object Detection, Text Spans, Audio Waveform scrubber), hotkey inspector drawer. |
| **R5** | **Generation, Quality, Versioning & Exports** | PENDING AUTHORIZATION | High-density quality scorecard, synthetic data diff preview, visual Git-diff canvas overlay, preset export simulator. |
| **R6** | **Governance, Diagnostics, Settings & Modals** | PENDING AUTHORIZATION | Standardized modal containers, audit log table filtering, real-time health telemetry console. |
| **R7** | **Full Application Visual QA & Verification** | PENDING AUTHORIZATION | Cross-viewport testing (1440px, 1280px, 768px, 390px), responsive regression testing, final sign-off. |

---

### Detailed Phase Specifications

#### Phase R0: Repository & UI Coverage Audit (COMPLETED)
- **Objective:** Exhaustive audit of all 6 views, 14 modals, and 6 shared UI components. Identify visual and layout gaps, document functional contracts, and establish verifiable roadmap.
- **Deliverables:** `docs/UI_COVERAGE_AUDIT.md`, updated `docs/UI_REDESIGN_PLAN.md`.
- **Exit Gate:** Clean build, 104/104 tests passing, Git commit and push of R0 documentation.

#### Phase R1: Design System & Global Icon Standardization
- **Objective:** Establish reusable shared UI primitives so all subsequent phase screens share identical padding, borders, typography, and modal structures.
- **Tasks:**
  - Build `<ModalShell>` dialog primitive with fixed header, scrollable body, responsive width tokens (`sm`, `md`, `lg`, `xl`, `full`), and keyboard `Esc` dismiss.
  - Define table design tokens and reusable `<DataTable>` or standardized CSS table classes.
  - Audit and enforce uniform icon stroke (`strokeWidth={1.75}`) and spacing across all remaining views.
- **Exit Gate:** `npm run build` passes; `<ModalShell>` tested with light and dark themes.

#### Phase R2: Application Shell & Landing Page
- **Objective:** Modernize global navigation and product front-door.
- **Tasks:**
  - Make `Sidebar.tsx` responsive with an auto-collapsing rail for tablet viewports (<1024px) and slide-out overlay for mobile (<768px).
  - Enhance `Header.tsx` with interactive deep breadcrumbs and `Cmd+K`/`Ctrl+K` quick search shortcut.
  - Refactor `LandingPage.tsx` to tighten vertical hero padding, format 5-stage lifecycle cards into a compact developer-tool overview, and add quick-start sample dataset preview chips.
- **Exit Gate:** Landing page renders cleanly across 1440px, 1280px, 768px, and 390px viewports without layout overflow.

#### Phase R3: Projects & Dataset Management
- **Objective:** Elevate project and dataset discovery into dense, professional developer views.
- **Tasks:**
  - In `ProjectList.tsx`: Add view toggle (Cards vs Dense Table), project summary metrics, and task type filters.
  - In `ProjectDetail.tsx`: Restructure dataset inventory into a structured tabular list with split distribution meters (`train`/`val`/`test`) and quick-launch action buttons.
  - In `DatasetDetail.tsx`: Replace heavy vertical stage cards with a compact lifecycle action bar or tabbed toolbar so records take primary focus; add tokenized filter pills.
- **Exit Gate:** Projects and datasets list, filter, and navigate seamlessly with clear data density and zero layout clipping.

#### Phase R4: Annotation Workbench (Modality Workspaces)
- **Objective:** Transform `AnnotationWorkspace.tsx` into a high-performance, modality-tailored labeling environment.
- **Tasks:**
  - Object Detection: Enhance `ObjectDetectionCanvas.tsx` with full-height canvas, zoom/pan controls, class color-coding, and magnetic edge snap.
  - Text Classification / NER: Introduce span/token highlighting controls with reading typography.
  - Audio Transcription: Introduce interactive waveform scrubber with timestamped segment markers.
  - Universal Workbench Polish: Standardize inspector panel spacing, confidence controls, and add a toggleable keyboard shortcut drawer.
- **Exit Gate:** All supported modalities render with appropriate canvas controls; annotations save with coordinate integrity.

#### Phase R5: Generation, Quality, Versioning & Exports
- **Objective:** Refactor remaining core dataset engineering workflows.
- **Tasks:**
  - `QualityDashboardModal.tsx`: High-density quality scorecard, interactive class balance charts, 1-click filter deep-links for failing invariants.
  - `SyntheticGenerationModal.tsx` & `AIAnnotationModal.tsx`: Live schema preview, split configuration panel, step-by-step generation logs with perceptual progress bars.
  - `VersionDiffModal.tsx`: Split-screen / onion-skin slider for visual bounding box diffs ($v_1$ vs $v_2$).
  - `ExportModal.tsx`: Framework preset selector tabs with live format code previews and token simulator context tick markers.
- **Exit Gate:** Generation jobs, quality checks, diff calculations, and exports execute cleanly with informative visual feedback.

#### Phase R6: Governance, Diagnostics, Settings & Modals
- **Objective:** Standardize remaining secondary views and dialogs.
- **Tasks:**
  - `GovernanceView.tsx`: Compact metric meters, filterable audit event log table with search and date range filters, clean team role management.
  - `SystemHealthView.tsx`: Real-time diagnostics console with ping latency meter, service dependency matrix, and model provider status indicators.
  - Standardize `CreateProjectModal.tsx`, `CreateDatasetModal.tsx`, `ProjectSettingsModal.tsx`, and `ClusterMapModal.tsx` using the Phase R1 modal shell.
- **Exit Gate:** All secondary screens adhere to the neutral design system; 0 broken links or unstyled modals.

#### Phase R7: Full Application Visual QA & Verification
- **Objective:** Comprehensive visual, responsive, and functional regression testing across the entire platform.
- **Tasks:**
  - Test and verify all major workflows at 1440×900, 1280×800, 768×1024, and 390×844.
  - Verify WCAG AAA contrast, keyboard focus indicators, and reduced-motion compliance.
  - Run full test suite (`pytest tests/`, `npm run build`, `ruff check .`).
  - Capture visual verification evidence and update `docs/EXECUTION_PLAN.md`.
- **Exit Gate:** 100% passing tests, 0 lint errors, clean production build, and all screens verified against target blueprint.
