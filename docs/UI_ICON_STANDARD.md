# UI Icon Standardization Specification

## 1. Selected Icon System

The AI Dataset Engineering Platform standardizes exclusively on **Lucide React (`lucide-react`)** for all interface icons across the entire web application.

- **Library**: `lucide-react` (v0.475+)
- **Design Style**: Outline, stroke-based vector icons.
- **Visual Aesthetic**: Technical, clean, minimalist, matching developer tool design systems (Linear, Vercel, Raycast).
- **Zero Emojis**: All decorative emojis (e.g., `💾`, `📑`, `🛡️`, `👥`, `📜`, `📊`, `🚀`, `🧠`, `🎯`, `🤖`, `📁`), ASCII artwork, and ad hoc Unicode symbols (e.g., `✕`, `✓`) in the user interface are eliminated and replaced with semantic SVG components.

---

## 2. Standard Sizing & Stroke Scale

To ensure consistent optical balance and alignment across cards, headers, tables, buttons, and navigation, icons conform to the following discrete scale:

| Token / Size | Pixel Dimension | Stroke Width | Primary Usage |
|---|---|---|---|
| **Micro / Status** | `12px` - `14px` | `1.75` | Inline badges, small status tags, pill indicators |
| **Small / Action** | `15px` - `16px` | `1.75` | Action buttons, tab icons, table cell actions, form labels |
| **Default / Header** | `18px` - `20px` | `1.75` | Modal close buttons, section headings, card titles |
| **Large / Brand** | `22px` - `24px` | `1.75` | Modal header icons, hero badges, view titles |
| **Hero / Empty State** | `32px` - `36px` | `1.75` | Empty state cards, onboarding placeholders |

### Styling & Alignment Rules
1. **Stroke Width**: Standardized to `1.75` (or default Lucide `2` where omitted, never exceeding `2`).
2. **Alignment**: Use flex containers (`display: flex`, `alignItems: center`, `gap: 0.4rem` to `0.5rem`) to ensure optical baseline centering with adjacent typography.
3. **Flex Shrink**: Set `flexShrink: 0` on icons positioned beside multi-line paragraphs or alert descriptions to prevent undesirable distortion.
4. **Color Hierarchy**:
   - **Neutral by Default**: Use `var(--text-secondary)`, `var(--text-muted)`, or inherited text color.
   - **Semantic Color for State Only**:
     - Success / Approval / Publish: `var(--emerald)` (`#10B981` / `text-emerald-500`)
     - Warning / Attention / Review: `var(--amber)` (`#F59E0B` / `text-amber-500`)
     - Error / Danger / Blocker: `var(--rose)` (`#EF4444` / `text-rose-500`)
     - Active / Interactive / Brand: `var(--accent-interactive)` / `var(--blue-500)` (`#3B82F6`)

---

## 3. Semantic Icon Mapping Directory

| UI Concept / Purpose | Semantic Lucide Icon | Component Reference |
|---|---|---|
| **Storage Consumption** | `<HardDrive size={16} />` | `ProjectSettingsModal`, `GovernanceView` |
| **Record Volume / Capacity Quota** | `<Layers size={16} />` | `ProjectSettingsModal`, `GovernanceView` |
| **Quotas & Usage Limits** | `<BarChart2 size={16} />` | `ProjectSettingsModal`, `GovernanceView` |
| **Team & Access Control (RBAC)** | `<Users size={16} />` | `ProjectSettingsModal`, `GovernanceView` |
| **Audit Trail / History** | `<FileText size={16} />` or `<History size={16} />` | `ProjectSettingsModal`, `GovernanceView` |
| **Governance & Policy Clearance** | `<ShieldCheck size={20} />` | `GovernanceView`, `ProjectSettingsModal` |
| **Rate Limiting & Safety Warnings** | `<ShieldAlert size={15} />` | `ProjectSettingsModal` |
| **Model Evaluation & Baseline** | `<Brain size={20} />` | `EvaluationModal` |
| **Active Learning Priority Queue** | `<Target size={15} />` | `EvaluationModal` |
| **2D Semantic Cluster Projection** | `<Compass size={15} />` / `<Target size={20} />` | `EvaluationModal`, `ClusterMapModal` |
| **Training Exporter / Package** | `<Package size={20} />` | `ExportModal` |
| **Export Formats (CSV)** | `<FileText size={16} />` | `ExportModal` |
| **Export Formats (JSONL)** | `<Database size={16} />` | `ExportModal` |
| **Export Formats (COCO)** | `<Image size={16} />` | `ExportModal` |
| **Export Formats (YOLO)** | `<Crosshair size={16} />` | `ExportModal` |
| **Export Formats (VLM / Unsloth)** | `<Sparkles size={16} />` | `ExportModal` |
| **Export Formats (ChatML / Axolotl)** | `<Terminal size={16} />` | `ExportModal` |
| **Export Formats (Subtitles / WebVTT)**| `<Mic size={16} />` | `ExportModal` |
| **Quality Audit & Validation** | `<ShieldCheck size={20} />` | `QualityDashboardModal` |
| **Class Distribution** | `<Tag size={15} />` | `QualityDashboardModal` |
| **Split Distribution** | `<BarChart2 size={15} />` | `QualityDashboardModal` |
| **Annotation Provenance** | `<Layers size={15} />` | `QualityDashboardModal` |
| **Immutable Version Snapshots** | `<GitBranch size={20} />` | `VersionSnapshotsModal` |
| **Version Git-Diff** | `<GitCompare size={20} />` | `VersionDiffModal` |
| **Dataset Card / README** | `<FileText size={14} />` | `VersionSnapshotsModal` |
| **Cryptographic Manifest JSON** | `<FileCode size={14} />` | `VersionSnapshotsModal` |
| **Source Discovery & Web Catalog** | `<Globe size={22} />` | `SourceDiscoveryModal` |
| **Legal / Rights Review** | `<Scale size={16} />` | `SourceDiscoveryModal` |
| **Catalog Discovery Tab** | `<BookOpen size={15} />` | `SourceDiscoveryModal` |
| **Synthetic Data Generation** | `<Sparkles size={22} />` | `SyntheticGenerationModal` |
| **AI Assisted Annotation** | `<Bot size={22} />` | `AIAnnotationModal` |
| **File Ingest / Upload** | `<UploadCloud size={36} />` | `ImportModal` |
| **Empty Record Selection** | `<Inbox size={36} />` | `AnnotationWorkspace` |
| **Remove / Delete Action** | `<Trash2 size={13} />` | `ObjectDetectionCanvas` |
| **Modal Close Controls** | `<X size={18} />` | All modal dialog headers |
| **Refresh Data** | `<RefreshCw size={14} />` | Modals & tables |
| **Immutability Lock** | `<Lock size={12} />` | Version tags & disclaimer notices |

---

## 4. Accessibility & Interactive Standards

1. **Icon-Only Buttons**: Any interactive control rendering an icon without adjacent visible text MUST include an `aria-label` attribute describing the action (e.g. `aria-label="Close dialog"`, `aria-label="Remove bounding box"`).
2. **Decorative Icons**: When an icon accompanies descriptive text (e.g. `<Package size={16} /> Standard CSV`), the text provides the accessible label.
3. **Contrast Requirements**: All icons in both Dark Theme and Light Theme satisfy WCAG 2.1 AA non-text contrast ratios (minimum 3:1 against background).

---

## 5. Audit & Verification Methodology

To verify zero emoji leakage across user interface surfaces:
- Run the Unicode-aware scanner script:
  ```powershell
  python -c "import os, re; p=re.compile(r'[\U00010000-\U0010ffff]|[\u2600-\u27bf]|[\u2300-\u23ff]|[\u2b50]|[\u203c-\u2049]'); [print(f'{root}/{f}') for root, _, files in os.walk('apps/web/src') for f in files if f.endswith(('.tsx', '.ts')) and any(p.search(l) for l in open(os.path.join(root,f), encoding='utf-8', errors='ignore'))]"
  ```
- **Result**: Exactly `0` emoji occurrences in `apps/web/src`.

### Intentional Exceptions
- **User-Authored Dataset Payloads**: Training text, sample records, or multimodal data containing Unicode emojis uploaded or labeled by users are preserved verbatim.
- **Test Fixtures**: Tests validating raw Unicode handling in backend datasets are preserved.
