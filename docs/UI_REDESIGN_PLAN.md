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
| **R1** | **Design System & Global Icon Standardization** | **COMPLETE** | `<ModalShell>`, standardized CSS backdrop & form tokens, 0 raw emojis/ad-hoc glyphs, `CreateProjectModal` & `CreateDatasetModal` migrated, 0 build/test regressions. |
| **R2** | **Application Shell & Landing Page** | **COMPLETE** | Responsive sidebar rail (64px) & mobile drawer, `CommandPalette` (`Cmd+K`/`Ctrl+K`), rich breadcrumbs with real project/dataset data, tightened landing page with quick-start summary. |
| **R3** | **Projects & Dataset Management** | **COMPLETE** | ProjectList metrics & semantic table/grid views, ProjectDetail dataset inventory with task-type filtering, DatasetDetail layout inversion (compact 5-stage pipeline dock + primary Records Explorer with review status/split filtering & pagination). |
| **R4** | **Annotation Workbench (Modality Workspaces)** | **COMPLETE** | Synchronized queue ID tracking, image classification metadata containment, ObjectDetectionCanvas with zoom/pan & 8-class color palette, audio transcription waveform scrubber & active speech cue tracking, reader typography for text classification, ShortcutHelpModal. |
| **R5** | **Generation, Quality, Versioning & Exports** | **COMPLETE** | High-density quality scorecard with proportional distribution bars & record filtering; synthetic generation schema preview; AI annotation demo provider labeling & capability validation; Version diff interactive onion-skin opacity slider & class delta table; Export modal 9 presets, illustrative code previews & real server-side token simulator. |
| **R6** | **Governance, Diagnostics, Settings & Modals** | PENDING AUTHORIZATION | Standardized modal containers, audit log table filtering, real-time health telemetry console. |
| **R7** | **Full Application Visual QA & Verification** | PENDING AUTHORIZATION | Cross-viewport testing (1440px, 1280px, 768px, 390px), responsive regression testing, final sign-off. |

---

### Detailed Phase Specifications

#### Phase R0: Repository & UI Coverage Audit (COMPLETED)
- **Objective:** Exhaustive audit of all 6 views, 14 modals, and 6 shared UI components. Identify visual and layout gaps, document functional contracts, and establish verifiable roadmap.
- **Deliverables:** `docs/UI_COVERAGE_AUDIT.md`, updated `docs/UI_REDESIGN_PLAN.md`.
- **Exit Gate:** Clean build, 104/104 tests passing, Git commit and push of R0 documentation.

#### Phase R1: Design System & Global Icon Standardization (COMPLETED)
- **Objective:** Establish reusable shared UI primitives so all subsequent phase screens share identical padding, borders, typography, and modal structures.
- **Tasks Delivered:**
  - Built `<ModalShell>` dialog primitive (`apps/web/src/components/ui/ModalShell.tsx`) with Apple spring physics, fixed blurred backdrop, accessible keyboard `Escape` handling, and responsive width tokens (`sm`, `md`, `lg`, `xl`, `full`).
  - Migrated `CreateProjectModal.tsx` and `CreateDatasetModal.tsx` to `<ModalShell>`.
  - Added CSS tokens in `apps/web/src/index.css` for unified `.modal-overlay, .modal-backdrop`, `.modal-content.size-*`, and form helpers (`.form-error`, `.form-hint`).
  - Standardized all UI icons to `lucide-react` with `strokeWidth={1.75}`; eliminated ad-hoc arrows in `AnnotationWorkspace.tsx`, bullets in `ExportModal.tsx`, and `&times;` close buttons.
- **Exit Gate:** `npm run build` passed in 9.16s (0 errors); 104/104 pytest tests passed in 7.96s; 0 emojis/ad-hoc glyphs remaining.

#### Phase R2: Application Shell & Landing Page (COMPLETED)
- **Objective:** Modernize global navigation, command palette search, and product front-door.
- **Tasks Delivered:**
  - Built `<CommandPalette>` (`apps/web/src/components/ui/CommandPalette.tsx`) with `Cmd+K` / `Ctrl+K` global trigger, keyboard navigation, and real application project/route search.
  - Redesigned `Header.tsx` with interactive Command Palette search trigger, accessible breadcrumbs showing real resolved project and dataset names, and balanced control spacing.
  - Made `Sidebar.tsx` responsive with left-aligned navigation labels, 64px compact rail for tablet viewports (768px–1023px) with collapse toggle, and accessible slide-out drawer with backdrop for mobile (<768px).
  - Redesigned `LandingPage.tsx` with tightened hero padding, real quick-start workflow bar, and compact 5-stage lifecycle engineering cards.
- **Exit Gate:** `npm run build` passed in 11.84s (0 errors); 104/104 backend tests passed in 11.19s; responsive rules verified.

#### Phase R3: Projects & Dataset Management (COMPLETED)
- **Objective:** Elevate project and dataset discovery into dense, professional developer views.
- **Tasks Delivered:**
  - `ProjectList.tsx`: Added summary metrics bar (Total, Active, Archived from real data), real-time search filter with clear action, sorting dropdown (`Newest First`, `Oldest First`, `Name (A-Z)`), archive toggle (`Include Archived`), view toggle (Grid / Table), genuine semantic HTML `<table>`, and compact, balanced grid cards.
  - `ProjectDetail.tsx`: Redesigned workspace header with project status, creation timestamp, and direct action triggers (New Dataset, Governance & Quotas, Archive toggle). Added dataset inventory with search, task-type filter dropdown, and grid/table toggle. Fixed modal invocation for `ProjectSettingsModal`.
  - `DatasetDetail.tsx`: Executed **Layout Inversion**, compacting the oversized ~700px 5-stage lifecycle section into a sleek 5-stage pipeline dock (<90px height) and placing the **Records Explorer front and center**. Wired real-time metrics ribbon (Total, Approved, Pending, Needs Correction, Rejected) with inline review progress bar. Added collapsible schema & guidelines drawer. Implemented live split filtering (`All Splits`, `Train`, `Val`, `Test`, `Unassigned`), review status filtering (`All Statuses`, `Unannotated`, `Pending Review`, `Approved`, `Needs Correction`, `Rejected`), client-side text search across records, genuine table/grid views, pagination controls, and 1-click direct "Annotate" triggers per record.
  - Preserved all 12 dataset modal workflows with 100% existing wiring.
- **Exit Gate:** `npm run build` passed in 8.06s (0 errors); 104/104 pytest tests passed in 8.34s; zero promotional puffery; zero layout clipping across viewports.

#### Phase R4: Annotation Workbench (Modality Workspaces) (COMPLETED)
- **Objective:** Transform `AnnotationWorkspace.tsx` into a high-performance, modality-tailored labeling environment.
- **Tasks Delivered:**
  - `AnnotationWorkspace.tsx`: Fixed index-queue disconnect by tracking strict `selectedRecordId`; synchronized counters and navigation (`J`, `K`, buttons) with `filteredQueue`. Added state leakage prevention and dirty tracking. Added panel visibility toggles (`PanelLeftClose`/`PanelLeftOpen`, `PanelRightClose`/`PanelRightOpen`) for fullscreen canvas focus.
  - `ObjectDetectionCanvas.tsx`: Added 8-color class palette for instant visual classification, zoom controls (75%–300% with Reset), scale-normalized pointer coordinate calculations, box drag-to-move, `Delete`/`Backspace` removal, and retained Sobel magnetic edge-snapping.
  - `AudioWaveformScrubber.tsx`: Built deterministic acoustic amplitude waveform timeline with speech cue overlays and 1-click seeking. Added live active speech cue highlight in audio player.
  - Reader Typography: Optimal reading surface for `text_classification` (`max-width: 68ch`, 1.75 line-height, word/char counts). Supported paired image-text and document OCR presentations.
  - `ShortcutHelpModal.tsx`: Accessible keyboard shortcut reference modal (`?` trigger, `Escape` dismiss). Strict focus guards prevent shortcut interception during text input.
- **Exit Gate:** `npm run build` passed in 18.87s (0 errors); 104/104 pytest tests passed in 7.91s; ruff lint clean; bounding box coordinate integrity preserved.


#### Phase R5: Generation, Quality, Versioning & Exports (COMPLETED)
- **Objective:** Refactor remaining core dataset engineering workflows into high-density, trustworthy developer workspaces.
- **Tasks Delivered:**
  - `QualityDashboardModal.tsx`: High-density scorecard displaying actual blocking, warning, and info invariant counts; proportional class and split distribution bars; provenance breakdown; actionable severity filter tabs (`all`, `blocking`, `warning`, `info`); request race condition protection (`requestIdRef`); and 1-click affected record filtering wiring to parent `DatasetDetail`.
  - `SyntheticGenerationModal.tsx`: Live task-aware label schema preview with configuration mismatch warnings; proportional real vs synthetic lineage stacked bars; honest indeterminate execution feedback without fabricated logs.
  - `AIAnnotationModal.tsx`: Explicit demo provider labeling (`fake` marked as testing-only); live provider capability validation; task-aware proposal schema preview; and mandatory human review requirement disclosure.
  - `VersionDiffModal.tsx`: Interactive onion-skin opacity slider (`0%`–`100%`) for visual bounding box geometry comparison; overlay vs side-by-side mode toggle; class distribution delta table; and safe media-relative coordinate scaling.
  - `ExportModal.tsx`: Replaced narrow types with full `ExportFormatType` covering all 9 supported formats (`csv`, `jsonl`, `coco`, `yolo`, `webvtt`, `unsloth_sharegpt_vlm`, `axolotl_alpaca_chatml`, `llama_factory_bundle`, `ultralytics_yolo_v8_v11`); format-specific illustrative code preview templates; removal of hardcoded token estimates in favor of real server-side `POST /api/v1/datasets/{dataset_id}/token-simulation` endpoint; context window tick markers (2,048, 4,096, 8,192, 32,768); and clear heuristic disclosures.
- **Exit Gate:** `npm run build` passed (0 errors); 104/104 pytest tests passed; ruff lint clean; all modal wiring, data integrity rules, and real API integrations verified.

#### Phase R5.1: UI Contract & Interaction Integrity Corrections (COMPLETED)
- **Objective:** Fix interaction contracts, pagination cross-navigation, schema previews, provider capability filtering, geometry scaling, and race conditions.
- **Tasks Delivered:**
  - `QualityDashboardModal.tsx` & `DatasetDetail.tsx`: Cross-page affected record navigation via backend queue search/record_id filtering; filter-exclusion banners with 1-click filter reset; auto-scroll and visual target badge. Categorical palette updated to neutral-first tokens.
  - `AIAnnotationModal.tsx` & `SyntheticGenerationModal.tsx`: Purged fabricated scores/coordinates; added truthful illustrative task schema templates with disclaimers; enforced target class validation against dataset schema.
  - Provider Gateway Capability Filtering: Enforced provider-level capability match against `dataset.task_type`; disabled incompatible providers with grounded copy; disabled execution when no compatible provider exists.
  - `VersionDiffModal.tsx`: Implemented `<SpatialDiffViewer>` with letterboxing offset calculation ($X_{offset}, Y_{offset}$) for `object-fit: contain`; eliminated fake asset URLs; enforced strict onion-skin 0%/100% layer hiding.
  - `ExportModal.tsx`: Prevented token simulation race conditions via `simRequestIdRef` and `AbortController`; cleared stale results during calculation; ensured capacity and utilization always reference `simResult.target_context_window`.
- **Exit Gate:** `npm run build` passed (7.48s); 104/104 pytest passed (12.24s); ruff lint passed; zero promotional puffery.

#### Phase R5.2: Object-Detection Coordinate Contract & Version-Diff Integrity (COMPLETED)
- **Objective:** Establish a canonical coordinate system across canvas annotation, saved payloads, version-diff visualization, and export serializers, ensuring viewport/zoom invariance and truthful fallbacks.
- **Tasks Delivered:**
  - **Canonical Frame**: Established intrinsic source-image pixel coordinates $[0, W_{src}] \times [0, H_{src}]$ with top-left origin $(0, 0)$.
  - `ObjectDetectionCanvas.tsx`: Pure helper `displayToSourceCoords` converts canvas pointer input to canonical intrinsic pixels accounting for zoom, image scale, and responsive resizing. Inverse helper `sourceToDisplayBox` renders intrinsic coordinates back into CSS display pixels. Added real-time pointer coordinate HUD (`Crosshair` with `X: ...px, Y: ...px`) and calibration status badge.
  - `AnnotationWorkspace.tsx`: Records `coordinate_system: "pixel-intrinsic"` and `image_dimensions: { width, height }` upon annotation save. Passes asset dimensions and coordinate system to canvas.
  - `packages/dataset_versioning/service.py`: Computes spatial diffs extracting `coordinate_system_v1`, `coordinate_system_v2`, `image_dimensions_v1`, `image_dimensions_v2`, and `asset_dimensions`.
  - `VersionDiffModal.tsx` (`SpatialDiffViewer`): Projects bounding boxes using version-specific reference dimensions and letterbox offsets ($X_{off}, Y_{off}$). Eliminates the guessed $640 \times 480$ grid; displays a truthful fallback disclosure when media assets or dimensions are unavailable. Badges legacy uncalibrated coordinates.
  - Export Serializers (`packages/dataset_export/coco_exporter.py`, `packages/dataset_export/yolo_exporter.py`, `packages/dataset_io/presets.py`): Preserves pixel-intrinsic coordinates in COCO export; normalizes YOLO coordinates using true image width and height, eliminating arbitrary `/ 1000.0` division heuristic.
  - **Automated Tests**: Added `tests/unit/test_coordinate_transforms.py` covering intrinsic 1:1, downscaling, wide/tall letterboxing, zoom scaling, resize invariance, legacy normalized coordinate detection, and COCO/YOLO exports.
- **Exit Gate:** `npm run build` passed (0 errors); 113/113 pytest tests passed in 6.45s; ruff check passed (0 lint errors).

#### Phase R5.2.1: Legacy Annotation Calibration Safety (COMPLETED)
- **Objective:** Fix the legacy coordinate contract ensuring missing coordinate metadata is never treated as proof of intrinsic pixels, preventing mixed coordinate systems, securing the annotation save path against false calibration stamping, and isolating version-diff dimensions.
- **Tasks Delivered:**
  - **Contract Engine (`apps/web/src/utils/coordinateContract.ts`)**: Pure TypeScript calibration module defining `identifyCoordinateSystem`, `isCoordinateSystemCalibrated`, `shouldPlotVersionGeometry`, `displayToSourceCoords`, and `sourceToDisplayBox`. Gated geometry plotting strictly on explicit calibration contract (`'pixel-intrinsic'` with valid dimensions or `'normalized'`). Uncalibrated historical coordinates are never silently plotted or stamped as intrinsic.
  - **Canvas Lock & Recreation Flow (`apps/web/src/components/ObjectDetectionCanvas.tsx`)**: Uncalibrated legacy annotations display an amber disclosure notice. Canvas drawing is locked to prevent corrupt mixed-coordinate payloads. An explicit `"Clear & Re-annotate (Calibrated)"` action enables users to safely transition records into the canonical intrinsic frame.
  - **Save Path Integrity (`apps/web/src/components/AnnotationWorkspace.tsx`)**: Only writes `coordinate_system: 'pixel-intrinsic'` and image dimensions when geometry is demonstrably calibrated. Historical uncalibrated payloads preserve their uncertainty without fabricating dimensions or stamping false calibration labels.
  - **Version Diff Calibration & Dimension Isolation (`apps/web/src/components/VersionDiffModal.tsx` & `packages/dataset_versioning/service.py`)**: Gated version diff geometry plotting on reliable calibration contracts. Independent resolution of V1 and V2 asset dimensions eliminates cross-version dimension leakage. Uncalibrated versions display truthful badges and fallback cards showing record and box counts.
  - **Automated Verification**: Added `apps/web/tests/coordinate_contract.test.ts` (tested via `npm run test:coordinates`) and `TestLegacyCalibrationSafety` in `tests/unit/test_coordinate_transforms.py`.
- **Exit Gate:** `npm run test:coordinates` passed; `npm run build` passed in 6.43s (0 errors); 116/116 pytest passed (8.15s); `ruff check .` passed (0 lint errors).

#### Phase R5.2.2: Coordinate Editing Integrity & Version Asset Isolation (COMPLETED)
- **Objective:** Fix normalized-coordinate editing to eliminate mixed unit payloads, close the legacy-lock bypass via box deletion, and isolate per-version asset URLs and dimensions in spatial version diffs.
- **Tasks Delivered:**
  - **Normalized Editing Contract (`apps/web/src/utils/coordinateContract.ts` & `ObjectDetectionCanvas.tsx`)**: Disabled direct drawing/moving on normalized annotations to prevent mixed-unit payloads. Added `convertNormalizedToPixelIntrinsic(boxes, dimensions)` and a dedicated banner action `"Convert to Source Pixels"` requiring verified source dimensions. Stamped `pixel-intrinsic` upon conversion and save.
  - **Legacy-Lock Bypass Closure (`ObjectDetectionCanvas.tsx` & `AnnotationWorkspace.tsx`)**: Empty box lists without explicit coordinate metadata no longer report calibrated status. Disabled individual box deletion in legacy uncalibrated mode. Enforced that only explicit `"Clear & Re-annotate (Calibrated)"` with confirmation resets geometry and authorizes calibrated re-annotation. Uncalibrated annotations never silently stamp `pixel-intrinsic` when non-geometric fields are saved.
  - **Version Asset & Dimension Isolation (`packages/dataset_versioning/service.py` & `VersionDiffModal.tsx`)**: `diff_dataset_versions` independently resolves `asset_id_v1`, `asset_id_v2`, `asset_url_v1`, `asset_url_v2`, and `same_asset`. `SpatialDiffViewer` resolves dimensions and asset URLs per version without cross-version fallback. Prohibits shared overlay comparison when source assets differ (`!same_asset`), displaying a truthful fallback card and directing users to side-by-side mode. Suppresses container-stretched normalized geometry when dimensions are missing.
  - **Automated Verification**: Added 10 tests in `apps/web/tests/coordinate_contract.test.ts` and 4 new tests in `tests/unit/test_coordinate_transforms.py`.
- **Exit Gate:** `npm run test:coordinates` passed (10/10); `npm run build` passed (0 errors); 16/16 `test_coordinate_transforms.py` passed; 120/120 full pytest suite passed; `ruff check .` passed (0 lint errors).

#### Phase R5.2.3: Coordinate-State Guarding & Version Asset Fallback Integrity (COMPLETED)
- **Objective:** Prevent the normalized-coordinate deletion bypass by guarding drawing and deletion across all interaction pathways, and isolate version asset URLs in side-by-side mode by removing cross-version fallbacks.
- **Tasks Delivered:**
  - **Normalized Deletion & State-Guarding (`ObjectDetectionCanvas.tsx` & `AnnotationWorkspace.tsx`)**: Unconditionally prohibited drawing intrinsic pixels on the canvas whenever coordinate system is `normalized`. Guarded `handleDeleteBox` and keyboard shortcut listeners (`Delete`/`Backspace`) against deleting normalized boxes. Disabled inspector delete buttons for normalized boxes. Enforced that empty normalized annotations retain their declaration and require explicit conversion before drawing. Guarded `handleSaveAnnotation` against saving normalized annotations as `pixel-intrinsic`.
  - **Version Asset URL Isolation & Fallback Removal (`VersionDiffModal.tsx`)**: Resolved `resolvedUrlV1` and `resolvedUrlV2` strictly from version-specific asset references without falling back to a shared asset URL. Enforced overlay compatibility refusal when either version lacks an asset or assets differ. Updated side-by-side mode to render truthful unavailable-media placeholders (`"No source image asset"` / `"Image load failed"`) with independent error states.
  - **Automated Verification**: Added 15 tests in `apps/web/tests/coordinate_contract.test.ts` and 4 new tests in `tests/unit/test_coordinate_transforms.py`.
- **Exit Gate:** `npm run test:coordinates` passed (15/15); `npm run build` passed (0 errors); 20/20 `test_coordinate_transforms.py` passed; 124/124 full pytest suite passed; `ruff check .` passed (0 lint errors).

#### Phase R5.2.4: Version-Diff IoU Comparability & Metric Integrity (COMPLETED)
- **Objective:** Establish strict spatial-comparison metric validity, symmetric 1-to-1 bipartite bounding box matching, nullable IoU metrics, and honest aggregation excluding incomparable records.
- **Tasks Delivered:**
  - **IoU Validity & Calibration Rules (`packages/dataset_versioning/service.py`)**: Required same verified source image (`same_asset == True` and matching asset IDs), calibrated coordinate systems (`pixel-intrinsic` or `normalized`), and consistent verified dimensions. Converted normalized geometry to common source-image pixels before computing intersection over union. Exposes nullable `mean_iou: None` with explicit `exclusion_reason` when incomparable.
  - **Symmetric 1-to-1 Bipartite Box Matching**: Implemented greedy maximum IoU matching for same-class boxes over the union of instances ($N_{total} = N_1 + N_2 - M$). Eliminates multi-matching against single boxes and treats additions and removals symmetrically.
  - **Honest Aggregation**: Excluded incomparable records from numeric summary averages. If no records are comparable, returns `None` for `mean_iou` and `mean_iou_shift` rather than fabricated `1.0`. Reports `spatial_records_compared`, `spatial_records_excluded`, and reason breakdown.
  - **Frontend Metric Representation (`coordinateContract.ts` & `VersionDiffModal.tsx`)**: Added `formatIoUMetric` helper distinguishing valid zero overlap (`0.0000`) from unavailable metrics (`"IoU unavailable (Reason)"`). Updated summary stat card and spatial diff headers to honestly present compared/excluded counts and unavailable aggregate states.
  - **Automated Verification**: Added 10 tests in `tests/unit/test_coordinate_transforms.py` (`TestVersionDiffMetricIntegrity`) and 2 new tests in `apps/web/tests/coordinate_contract.test.ts`.
- **Exit Gate:** `npm run test:coordinates` passed (17/17); `npm run build` passed (0 errors); 30/30 `test_coordinate_transforms.py` passed; 134/134 full pytest suite passed; `ruff check .` passed (0 lint errors).

#### Phase R5.2.4.1: Primary Asset Resolution Integrity (COMPLETED)
- **Objective:** Resolve primary images from explicit asset metadata (role and modality contract) rather than manifest order or asset ID sort position. Document and test greedy one-to-one matching approximation.
- **Tasks Delivered:**
  - **Metadata-Based Primary Image Resolution (`packages/dataset_versioning/service.py`)**: Implemented `resolve_primary_image_asset(assets)`. Resolves primary image strictly matching `role == "primary_image"` and image modality. Filters out auxiliary roles (`thumbnail`, `crop`, `attachment`, `paired_text`, `source_document`, `primary_audio`, `audio_recording`) and non-image modalities. Rejects ambiguous multiple primary images with `ambiguous_primary_image` without picking arbitrary assets.
  - **Greedy Matching Approximation Clarification**: Documented and verified that bounding box matching is a greedy one-to-one bipartite approximation running in $O(N \log N)$ time, consistent with benchmark practices (PASCAL/COCO eval), without asserting global optimality.
  - **Frontend Contract Integration (`coordinateContract.ts` & `VersionDiffModal.tsx`)**: Added `ambiguous_primary_image` handling to `formatIoUMetric`. Ensured side-by-side mode truthfully renders `"No source image asset"` when unresolved, and overlay mode strictly refuses co-projection when either version lacks a primary image.
  - **Automated Verification**: Added 7 tests in `tests/unit/test_coordinate_transforms.py` (`TestPrimaryAssetResolutionIntegrity`) and 1 test in `apps/web/tests/coordinate_contract.test.ts`.
- **Exit Gate:** `npm run test:coordinates` passed (18/18); `npm run build` passed (0 errors); 37/37 `test_coordinate_transforms.py` passed; 134/134 full pytest suite passed; `ruff check .` passed (0 lint errors).

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
