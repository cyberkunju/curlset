# UI — Routes, Modes, Design System

This document is the single source of truth for the interface. It replaces the earlier brand, motion,
icon, redesign and Simple-Mode documents.

## 1. Routes (hash router)

| Route | View | Purpose |
|---|---|---|
| `#home` | Home | default; two doors (Generate / Label), recent work, Quick start |
| `#landing` | Landing | product entry for a cold visit |
| `#projects` | Projects | project list |
| `#project/<id>` | Project detail | datasets in a project |
| `#dataset/<id>` | Dataset detail | records, review, versions, exports, tools |
| `#providers` | Providers | connect models, live provider status |
| `#governance` | Governance | RBAC/audit surfaces (local-mode) |
| `#health` | Health | system and provider diagnostics |

## 2. Two modes

**Simple mode** is the default experience. It never exposes jargon and never hides consequences.

1. **Choose a dataset type** — the New-dataset chooser lists all catalogue types grouped by status.
   Planned types are disabled; beta types open the dataset for import/annotation; available types
   continue into a wizard.
2. **Generate** — natural-language prompt → deterministic plan → at most three plain questions (count,
   classes, dataset type if not obvious) → sample upload optional (analyze + reuse style; images are a
   reference only) → live progress with measured ETA → hand-off to labeling.
3. **Label** — import or pick a dataset → review queue → keyboard-first labeling → optional AI
   pre-labeling (pending review) → one-click export.

**Advanced mode** exposes every control: per-class counts, provider/model choice, thresholds, ensemble
weights, quality findings, version diffs, raw export formats, governance views.

The mode switch never changes data: a record generated in Simple mode is `synthetic` / `pending_review`
exactly as in Advanced mode.

## 3. Component inventory

31 components/modals, notable ones:

- `HomeDashboard`, `LandingPage`, `ProjectList`, `ProjectDetail`, `DatasetDetail`
- `GenerateWizard` (plan → confirm → sample → run → hand-off), `LabelWizard`, `NewDatasetModal`
- `AnnotationWorkspace`, `ObjectDetectionCanvas` (draw/edit/delete boxes; empty boxes never save)
- `AIAnnotationModal`, `SyntheticGenerationModal`, `GenerationLab`, `EnsembleLab`, `EvaluationModal`
- `ImportModal`, `ExportModal`, `VersionSnapshotsModal`, `VersionDiffModal`, `QualityDashboardModal`
- `EditByDescriptionModal` (natural-language edit preview/apply/undo)
- `ProvidersView`, `GovernanceView`, `SystemHealthView`, `Sidebar`, `Header`
- `ui/SpringButton`, `ui/ErrorBoundary`, `ui/PerceptualProgressBar`, `ui/ProgressiveAssetImage`

## 4. Design tokens

Defined in `apps/web/src/index.css`. Authoritative values:

| Token | Value | Use |
|---|---|---|
| `--bg-canvas` | `#FAFAFA` | page background |
| `--bg-surface` | `#FFFFFF` | cards, modal |
| `--bg-elevated` | `#F4F4F5` | toolbars, secondary surfaces |
| `--border-hairline` | `#E4E4E7` | 1px structural borders |
| `--text-primary` | `#18181B` | primary text |
| `--text-secondary` | `#52525B` | descriptions |
| `--text-muted` | `#71717A` | metadata |
| `--accent-primary` | `#18181B` | primary buttons (solid near-black) |
| `--accent-interactive` / `--brand-primary` | `#2563EB` | focus, selection, links, brand accent |
| `--danger` / `--rose` | token | destructive actions and errors |
| radius | 8–12 px | cards vs controls |
| typography | `Curlset` (self-hosted font), `JetBrains Mono` | UI vs numeric/code |

Do not introduce ad-hoc hex values; use the tokens. The superseded six-tone blue palette (ADR-017) is
retired.

## 5. Interaction and motion

- Physics-based but restrained: spring transitions for page/panel changes, no looping decorative motion.
- Progress is honest: determinate bars when a total is known, indeterminate otherwise; measured ETA
  shown only when the API returns one.
- Loading states use skeletons only for content-shaped waits; actions show inline progress.
- Cancellation is always available for running jobs; the UI offers "stop waiting" when a job is stale.
- Destructive actions require confirmation and state the consequence (records kept vs removed).

## 6. Accessibility and keyboard

- All annotation actions are keyboard-reachable; visible focus rings use `--border-focus`.
- Labeling hotkeys: 1–9 select class, Enter saves, Esc closes/clears; guards prevent saving empty or
  stale boxes.
- Canvas interactions have pointer and keyboard equivalents where applicable.
- Color is never the only carrier of state: status text/badges accompany color.
- Reduced-motion preference is respected for page transitions.

## 7. Honesty rules (enforced in review)

- No marketing puffery or unverifiable claims in UI copy (repository rule, AGENTS §10).
- No fake data on production screens; demo fixtures are labelled.
- No button that looks functional but does nothing.
- Planned capabilities are shown as disabled with a plain reason, never as available.
- Errors are plain sentences, not raw JSON; validation arrays are translated client-side.
