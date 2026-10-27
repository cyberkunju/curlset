# UI/UX Motion Physics, `boneyard` Skeletons & Perceptual Loading Specification (`docs/UI_MOTION_AND_LOADING_SPEC.md`)

**Status:** Authoritative Frontend & Interaction Engineering Contract  
**Target Stack:** React 18/19 + TypeScript + Tailwind CSS + `motion` (`framer-motion`) + `boneyard-js` + `lucide-react`  
**Companion Documents:** `AGENTS.md`, `docs/DESIGN.md`, `docs/REQUIREMENTS.md`, `docs/EXECUTION_PLAN.md`, `docs/PHASE_BY_PHASE_PLAN.md`  
**Rule:** Preserve all existing file names and Phase numbers (`Phase 0`–`Phase 15`). Apply this specification across all frontend phases (`Phase 2`, `Phase 3`, `Phase 4`, `Phase 5`, `Phase 6`, `Phase 7`, `Phase 8`, `Phase 9`, `Phase 10`, and `Phase 13`–`14`).

---

## 1. Anti-"AI Slop" Visual Philosophy & Minimalist Token System

The interface must look and feel like a precision-engineered desktop developer instrument (inspired by Apple macOS design systems, Linear, and Raycast)—never a generic AI template.

### 1.1 Strictly Forbidden Patterns ("AI Slop" Ban List)
1. **No Neon Glows or Outer Blooms:** Never use glowing purple, cyan, or magenta `box-shadow` outlines (`0 0 20px rgba(139, 92, 246, ...)` is strictly banned).
2. **No Rainbow/Cyberpunk Gradients:** Never use multi-stop neon gradients on buttons, text headers, or card borders.
3. **No AI Cliché Icons:** Avoid floating sparkle stars, magic wands, or AI-generated raster icons.
4. **No Linear/Robotic CSS Transitions:** Never use flat `transition: all 0.3s linear` or sluggish `500ms` fades that make the UI feel heavy.

### 1.2 Minimal Monochrome + High-Contrast Surface Palette
Use a restrained, low-fatigue monochrome palette with crisp `1px` structural borders and semantic status tokens:

```css
:root {
  /* Light Mode — Crisp Alabaster & Ink */
  --bg-canvas: #FAFAFA;
  --bg-surface: #FFFFFF;
  --bg-elevated: #F4F4F5;
  --bg-subtle-hover: #EFEFF1;
  --border-hairline: #E4E4E7;
  --border-strong: #D4D4D8;
  --text-primary: #09090B;
  --text-secondary: #52525B;
  --text-muted: #71717A;
  --accent-primary: #18181B;         /* Tactile obsidian primary button */
  --accent-primary-fg: #FAFAFA;
  --accent-interactive: #2563EB;     /* Precision technical blue for active selection/scan */

  /* Semantic Review & Quality Tokens */
  --status-approved: #10B981;
  --status-pending: #F59E0B;
  --status-disagreement: #F97316;
  --status-rejected: #EF4444;

  /* Apple / Linear Custom Bezier Timing Curves */
  --ease-apple-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-apple-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --ease-snappy-press: cubic-bezier(0.2, 0, 0, 1);
}

.dark {
  /* Dark Mode — Carbon Obsidian & Zinc */
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
}
```

---

## 2. Physics-Based Motion Architecture (Apple & Linear Timing Study)

Every interaction must produce immediate physical feedback so the interface feels responsive and tactile.

### 2.1 Master Timing & Spring Physics Matrix

| Interaction Type | Target Feel | Physics / Timing Curve | Duration / Parameters |
| --- | --- | --- | --- |
| **Button Press Down (`pointerdown`)** | Instant physical compression | `cubic-bezier(0.2, 0, 0, 1)` | `65ms` $\rightarrow$ `scale(0.955)` |
| **Button Release (`pointerup` Bubble)** | Elastic spring-bubble rebound | Spring physics (`motion`) | `stiffness: 540, damping: 22, mass: 0.65` |
| **Dropdown / Popover Open** | Anchored corner expansion | Spring + Staggered Children | `stiffness: 480, damping: 28, mass: 0.7`, child stagger `12ms` |
| **Page / Tab Directional Switch** | Spatial slide + crossfade from active side | `cubic-bezier(0.16, 1, 0.3, 1)` | `220ms` (`x: ±22px` $\rightarrow$ `0px`, `opacity: 0` $\rightarrow$ `1`) |
| **Icon Micro-Interaction** | SVG path/part articulation | Spring physics | `stiffness: 420, damping: 20` |
| **Modal / Drawer Sheet** | Weighted deceleration settle | `cubic-bezier(0.16, 1, 0.3, 1)` | `260ms` |

### 2.2 Tactile Spring-Bubble Button & Interactive Icon Component (`apps/web/src/components/ui/SpringButton.tsx`)

Buttons must never use ugly neon glows. Instead, they compress on press, rebound with a subtle spring-bubble physics curve on release, and articulate their embedded vector icon:

```tsx
import React from "react";
import { motion, HTMLMotionProps } from "framer-motion";

export interface SpringButtonProps extends HTMLMotionProps<"button"> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  icon?: React.ReactNode;
  shortcut?: string;
}

const SPRING_BUBBLE = {
  type: "spring" as const,
  stiffness: 540,
  damping: 22,
  mass: 0.65,
};

export const SpringButton: React.FC<SpringButtonProps> = ({
  variant = "primary",
  size = "md",
  icon,
  shortcut,
  children,
  className = "",
  disabled,
  ...props
}) => {
  const baseStyles =
    "relative inline-flex items-center justify-center gap-2 font-medium select-none rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-interactive)] disabled:opacity-45 disabled:pointer-events-none";

  const variants = {
    primary:
      "bg-[var(--accent-primary)] text-[var(--accent-primary-fg)] border-transparent shadow-xs",
    secondary:
      "bg-[var(--bg-surface)] text-[var(--text-primary)] border-[var(--border-hairline)] hover:bg-[var(--bg-subtle-hover)] hover:border-[var(--border-strong)]",
    ghost:
      "bg-transparent text-[var(--text-secondary)] border-transparent hover:bg-[var(--bg-subtle-hover)] hover:text-[var(--text-primary)]",
    danger:
      "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20 hover:bg-red-500/15",
  };

  const sizes = {
    sm: "h-8 px-2.5 text-xs",
    md: "h-9 px-3.5 text-sm",
    lg: "h-10 px-4 text-sm",
  };

  return (
    <motion.button
      whileHover={disabled ? undefined : { scale: 1.018, y: -0.5 }}
      whileTap={disabled ? undefined : { scale: 0.945, y: 0.5 }}
      transition={SPRING_BUBBLE}
      disabled={disabled}
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {icon && (
        <motion.span
          className="inline-flex items-center justify-center shrink-0"
          whileHover={{ rotate: -6, scale: 1.1 }}
          whileTap={{ scale: 0.88 }}
          transition={SPRING_BUBBLE}
        >
          {icon}
        </motion.span>
      )}
      <span>{children}</span>
      {shortcut && (
        <kbd className="ml-1 px-1.5 py-0.5 text-[10px] font-mono rounded bg-black/10 dark:bg-white/10 text-current opacity-75">
          {shortcut}
        </kbd>
      )}
    </motion.button>
  );
};
```

### 2.3 Standardized Iconography Rules (`lucide-react` + SVG Part Physics)

1. **Single Unified Icon Family:** Use **`lucide-react`** exclusively across the entire platform with a locked `strokeWidth={1.75}` and rounded line joins/caps. Never mix raster PNGs, emojis, or AI-generated SVGs.
2. **Interactive Icon Micro-Reactions:**
* **Dropdown Chevrons:** Rotate from `0deg` to `180deg` using spring physics (`stiffness: 460, damping: 24`).
* **Approval Checkmarks:** Animate `pathLength` from `0` to `1` over `180ms` when a record is approved.
* **Delete / Reject Icons:** Tilt `rotate: 12deg` on hover.
* **Copy Hash / ID Buttons:** Morph smoothly from `Copy` icon to `Check` icon with a `scale(0.6) -> scale(1.0)` spring pop.

### 2.4 Directional Page & Tab Transitions (`apps/web/src/components/ui/DirectionalPageTransition.tsx`)

When switching between navigation tabs or workflow steps (e.g., `Import [0]` $\leftrightarrow$ `Annotate [1]` $\leftrightarrow$ `Quality [2]` $\leftrightarrow$ `Versions [3]` $\leftrightarrow$ `Export [4]`), content must enter smoothly from the direction of movement:

```tsx
import React from "react";
import { AnimatePresence, motion } from "framer-motion";

interface DirectionalTransitionProps {
  activeKey: string;
  direction: 1 | -1; // +1 when moving right/forward, -1 when moving left/back
  children: React.ReactNode;
}

const variants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 24 : -24,
    opacity: 0,
    filter: "blur(2px)",
  }),
  center: {
    x: 0,
    opacity: 1,
    filter: "blur(0px)",
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -18 : 18,
    opacity: 0,
    filter: "blur(1px)",
  }),
};

export const DirectionalPageTransition: React.FC<DirectionalTransitionProps> = ({
  activeKey,
  direction,
  children,
}) => {
  return (
    <div className="relative w-full overflow-hidden">
      <AnimatePresence custom={direction} initial={false} mode="wait">
        <motion.div
          key={activeKey}
          custom={direction}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{
            x: { type: "spring", stiffness: 420, damping: 34, mass: 0.8 },
            opacity: { duration: 0.18, ease: [0.16, 1, 0.3, 1] },
            filter: { duration: 0.16 },
          }}
          className="w-full"
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
```

---

## 3. The 3 Mandatory View States & `boneyard` (`0xGF/boneyard`) Skeleton Integration

Every view, list, dashboard card, and annotation workspace in the application **must** explicitly implement 3 deterministic states:

1. **`EMPTY_STATE`** (When `loading === false` and dataset/collection has `0` items)
2. **`SKELETON_STATE`** (When `loading === true`, powered by **`boneyard-js`**)
3. **`LOADED_STATE`** (When `loading === false` and real data is present)

### 3.1 How `boneyard` (`boneyard-js`) Must Be Installed and Wired

Instead of hand-coding approximate gray rectangles that drift out of sync with the real UI and cause layout jumps, the frontend uses **[0xGF/boneyard](https://github.com/0xGF/boneyard)** (`boneyard-js`):

1. **Install Package (`apps/web/package.json`):**
```bash
npm install boneyard-js
```

2. **Import Bone Registry in Entry Point (`apps/web/src/main.tsx`):**
```tsx
import "./bones/registry"; // Generated by `npx boneyard-js build`
```

3. **Add Build Script (`apps/web/package.json`):**
```json
{
  "scripts": {
    "bones:build": "boneyard-js build --wait 1000",
    "dev": "vite",
    "build": "tsc && vite build"
  }
}
```

Running `npx boneyard-js build` snapshots the rendered DOM across responsive viewport breakpoints (`375px` mobile, `768px` tablet, `1280px` desktop) and writes static `.bones.json` definitions with exact coordinates $(x, y, w, h, r)$.

### 3.2 Reusable `<TriStateView>` Wrapper with `boneyard-js` (`apps/web/src/components/ui/TriStateView.tsx`)

```tsx
import React from "react";
import { Skeleton } from "boneyard-js/react";
import { motion, AnimatePresence } from "framer-motion";

interface TriStateViewProps<T> {
  /** Unique boneyard skeleton registry name (e.g. "dataset-record-grid") */
  skeletonName: string;
  loading: boolean;
  data: T | null | undefined;
  isEmpty: (data: T) => boolean;
  /** Static fixture component rendered during `npx boneyard-js build` bone capture */
  boneyardFixture: React.ReactNode;
  /** Rendered when loading is false and isEmpty(data) is true */
  emptyState: React.ReactNode;
  /** Rendered when loading is false and data is non-empty */
  children: (data: T) => React.ReactNode;
  minHeight?: number;
}

export function TriStateView<T>({
  skeletonName,
  loading,
  data,
  isEmpty,
  boneyardFixture,
  emptyState,
  children,
  minHeight = 280,
}: TriStateViewProps<T>) {
  const hasData = Boolean(data && !isEmpty(data));

  return (
    <div className="relative w-full" style={{ minHeight: loading ? minHeight : undefined }}>
      <Skeleton fixture={boneyardFixture} loading={loading} name={skeletonName} select="viewport">
        <AnimatePresence mode="wait">
          {!loading && !hasData && (
            <motion.div
              key="empty-state"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="w-full"
            >
              {emptyState}
            </motion.div>
          )}

          {!loading && hasData && data && (
            <motion.div
              key="loaded-state"
              initial={{ opacity: 0, scale: 0.992 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="w-full"
            >
              {children(data)}
            </motion.div>
          )}
        </AnimatePresence>
      </Skeleton>
    </div>
  );
}
```

---

## 4. Psychological Non-Linear Loading Bar Engine ("Buying Time" Perception Architecture)

A static or linear progress bar makes users feel like the application is frozen. All file uploads, archive extractions, AI annotation runs, quality validations, and dataset exports must use a **Non-Linear Perceptual Progress Engine** that continuously communicates forward momentum while buying time for backend tasks to finish.

### 4.1 The 4-Phase Perceptual Velocity Curve

1. **Phase 1 — Instant Ignition (`0% -> 28%` in `0ms–250ms`):** Jumps immediately on task start so the user perceives zero input latency.
2. **Phase 2 — Harmonic Cadence (`28% -> 76%`):** Advances in irregular, natural-feeling increments (`+3.2%`, `+5.8%`, `+2.4%`) synced with actual `RunItem` progress if available.
3. **Phase 3 — Asymptotic Zeno Trickle (`76% -> 96.4%`):** When waiting on heavy backend work (e.g., hashing, model inference, or archive compression), the bar **never stops moving**. It advances asymptotically:

$$p_{t+1} = p_t + (96.5 - p_t) \times 0.075$$

Simultaneously, it rotates contextual **"Almost Finished" Telemetry Micro-Copy** so the user knows the system is actively wrapping up.
4. **Phase 4 — Completion Snap (`96.4% -> 100%` in `120ms`):** The instant the backend responds, the bar accelerates to `100%` and springs a completion badge into view.

### 4.2 Reference Implementation (`apps/web/src/components/ui/PerceptualProgressBar.tsx`)

```tsx
import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Loader2 } from "lucide-react";

export interface PerceptualProgressProps {
  /** Whether the operation is actively running */
  active: boolean;
  /** Optional real backend percentage (0-100) if reported by ProcessingRun */
  backendPercent?: number | null;
  /** Task context to tailor stage micro-copy */
  taskType?: "ingest" | "annotate" | "validate" | "export" | "synthesize";
  onComplete?: () => void;
}

const STAGE_MESSAGES: Record<NonNullable<PerceptualProgressProps["taskType"]>, string[]> = {
  ingest: [
    "Inspecting magic-byte signatures & archive headers...",
    "Streaming assets & computing SHA-256 checksums...",
    "Calculating 64-bit perceptual pHash matrices...",
    "Bundling multi-modal record pairs...",
    "Almost finished — indexing records & cleaning staging buffers...",
  ],
  annotate: [
    "Warming provider gateway & validating task schema...",
    "Dispatching multi-modal batches to primary annotator...",
    "Running Critic verification & consensus scoring...",
    "Normalizing spatial coordinates & confidence bounds...",
    "Almost finished — committing append-only annotation revisions...",
  ],
  validate: [
    "Scanning schema contracts & required label ontologies...",
    "Checking exact SHA-256 & perceptual pHash duplicate clusters...",
    "Auditing train / val / test splits for cross-split leakage...",
    "Running Confident Learning label-noise neighborhoods...",
    "Almost finished — compiling quality report...",
  ],
  export: [
    "Verifying immutable DatasetVersion cryptographic manifest...",
    "Serializing records & transforming spatial coordinates...",
    "Compiling automated Dataset Card (README.md) statistics...",
    "Packaging archive & computing file SHA-256 digests...",
    "Almost finished — finalizing downloadable artifact...",
  ],
  synthesize: [
    "Sampling seed records & target class distributions...",
    "Generating candidate multi-modal variations...",
    "Running 3-gram & perceptual anti-collapse diversity filter...",
    "Attaching synthetic lineage & provenance metadata...",
    "Almost finished — staging candidates for review...",
  ],
};

export const PerceptualProgressBar: React.FC<PerceptualProgressProps> = ({
  active,
  backendPercent = null,
  taskType = "ingest",
  onComplete,
}) => {
  const [progress, setProgress] = useState(0);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (!active && progress > 0 && !completed) {
      // Snap to 100% when backend resolves
      setProgress(100);
      setCompleted(true);
      const timer = setTimeout(() => onComplete?.(), 420);
      return () => clearTimeout(timer);
    }

    if (!active) {
      setProgress(0);
      setCompleted(false);
      return;
    }

    // Phase 1: Instant ignition jump
    setProgress((prev) => (prev < 12 ? 16 : prev));

    const interval = setInterval(() => {
      setProgress((prev) => {
        if (backendPercent !== null && backendPercent > prev) {
          return Math.min(96.5, backendPercent);
        }
        if (prev < 35) {
          return prev + 4.8; // Fast initial surge
        }
        if (prev < 75) {
          const harmonicStep = 1.6 + Math.random() * 2.8;
          return prev + harmonicStep;
        }
        if (prev < 96.4) {
          // Phase 3: Zeno's asymptotic trickle (buys time without ever freezing)
          const remaining = 96.5 - prev;
          return prev + Math.max(0.12, remaining * 0.075);
        }
        return prev;
      });
    }, 240);

    return () => clearInterval(interval);
  }, [active, backendPercent, completed, onComplete, progress]);

  const messages = STAGE_MESSAGES[taskType];
  const stageIndex =
    progress < 25
      ? 0
      : progress < 50
      ? 1
      : progress < 76
      ? 2
      : progress < 89
      ? 3
      : 4;

  if (!active && !completed) return null;

  return (
    <div className="w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-3.5 shadow-xs">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {completed ? (
            <motion.span
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 520, damping: 20 }}
              className="text-emerald-500 shrink-0"
            >
              <CheckCircle2 size={16} strokeWidth={2}/>
            </motion.span>
          ) : (
            <Loader2 className="animate-spin text-[var(--accent-interactive)] shrink-0" size={15} strokeWidth={1.75}/>
          )}

          <AnimatePresence mode="wait">
            <motion.span
              key={completed ? "done" : stageIndex}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              className="text-xs font-medium text-[var(--text-primary)] truncate"
            >
              {completed ? "Completed — dataset state synchronized" : messages[stageIndex]}
            </motion.span>
          </AnimatePresence>
        </div>

        <span className="text-xs font-mono tabular-nums text-[var(--text-secondary)] shrink-0">
          {Math.round(progress)}%
        </span>
      </div>

      {/* Progress Track */}
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-elevated)]">
        <motion.div
          className="h-full rounded-full bg-[var(--accent-primary)]"
          initial={{ width: "0%" }}
          animate={{ width: `${progress}%` }}
          transition={{
            type: "spring",
            stiffness: completed ? 420 : 140,
            damping: 26,
            mass: 0.6,
          }}
        />
      </div>
    </div>
  );
};
```

---

## 5. 4-Stage Progressive Image & Synthetic Media Materialization Pipeline

Whenever a dataset image is loaded in the grid/canvas, fetched via Web Research, or synthesized by a model, it must **never** pop in raw or show a broken browser icon. It must transition through a **4-Stage Visual Materialization Pipeline**:

1. **Stage 1 — Dynamic Film Grain (`grain`):** Fine monochrome SVG `feTurbulence` noise matrix fills the aspect-ratio frame immediately.
2. **Stage 2 — Optical Diagnostic Scan (`scanning`):** A clean horizontal scanline sweeps across the asset frame ("Scanning / reconstructing asset...").
3. **Stage 3 — Pixelated & Blue Blueprint Blur Pass (`blueprint_blur`):** The image renders with a pixelated/blurred technical blue tint (`filter: blur(16px) contrast(1.1) sepia(0.35) hue-rotate(185deg) saturate(1.6)`) that progressively sharpens.
4. **Stage 4 — Full-Resolution Lock-In (`sharp`):** The blueprint tint and blur smoothly dissolve over `280ms` (`cubic-bezier(0.16, 1, 0.3, 1)`) into the crisp full-resolution photograph.

### 5.1 Reference Component (`apps/web/src/components/ui/ProgressiveAssetImage.tsx`)

```tsx
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ImageOff } from "lucide-react";

type MaterializationStage = "grain" | "scanning" | "blueprint_blur" | "sharp" | "error";

export interface ProgressiveAssetImageProps {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  /** Set true when an AI model is actively generating/labeling the image */
  isGeneratingOrScanning?: boolean;
}

export const ProgressiveAssetImage: React.FC<ProgressiveAssetImageProps> = ({
  src,
  alt,
  width = 640,
  height = 480,
  className = "",
  isGeneratingOrScanning = false,
}) => {
  const [stage, setStage] = useState<MaterializationStage>("grain");
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    setStage("grain");
    setImageLoaded(false);

    const scanTimer = setTimeout(() => {
      setStage((prev) => (prev === "grain" ? "scanning" : prev));
    }, 140);

    return () => clearTimeout(scanTimer);
  }, [src]);

  useEffect(() => {
    if (!imageLoaded || isGeneratingOrScanning) return;

    // Transition: scanning -> blueprint_blur -> sharp
    setStage("blueprint_blur");
    const sharpTimer = setTimeout(() => {
      setStage("sharp");
    }, 240);

    return () => clearTimeout(sharpTimer);
  }, [imageLoaded, isGeneratingOrScanning]);

  return (
    <div
      className={`relative overflow-hidden bg-[var(--bg-elevated)] select-none ${className}`}
      style={{ aspectRatio: `${width} / ${height}` }}
    >
      {/* Hidden preloader image */}
      <img
        src={src}
        alt={alt}
        onLoad={() => setImageLoaded(true)}
        onError={() => setStage("error")}
        className={`h-full w-full object-contain transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          stage === "grain" || stage === "scanning"
            ? "opacity-0 scale-[1.03]"
            : stage === "blueprint_blur"
            ? "opacity-90 scale-[1.01] blur-md contrast-125 sepia-[.45] hue-rotate-[185deg] saturate-150"
            : stage === "sharp"
            ? "opacity-100 scale-100 blur-0 filter-none"
            : "hidden"
        }`}
      />

      {/* Stage 1 & 2: Film Grain + Optical Scanline Overlay */}
      <AnimatePresence>
        {(stage === "grain" || stage === "scanning" || stage === "blueprint_blur") && (
          <motion.div
            key="materializer-overlay"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
            className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3"
          >
            {/* Subtle SVG Film Grain Texture */}
            <svg className="absolute inset-0 h-full w-full opacity-[0.14]">
              <filter id="tactile-grain">
                <feTurbulence
                  type="fractalNoise"
                  baseFrequency="0.85"
                  numOctaves="3"
                  stitchTiles="stitch"
                />
              </filter>
              <rect width="100%" height="100%" filter="url(#tactile-grain)" />
            </svg>

            {/* Stage 2: Sweeping Diagnostic Scanline */}
            {(stage === "scanning" || isGeneratingOrScanning) && (
              <motion.div
                initial={{ top: "-8%" }}
                animate={{ top: "108%" }}
                transition={{
                  duration: 1.15,
                  repeat: Infinity,
                  ease: "linear",
                }}
                className="absolute left-0 right-0 h-[2px] bg-[var(--accent-interactive)]/80"
              />
            )}

            {/* Status Micro-Badge */}
            <div className="relative z-10 mt-auto inline-flex self-start items-center gap-1.5 rounded bg-black/65 px-2 py-0.5 text-[10px] font-mono text-zinc-200 backdrop-blur-xs">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-interactive)] animate-pulse" />
              {stage === "grain" && "Allocating frame buffer..."}
              {stage === "scanning" && "Scanning asset geometry..."}
              {stage === "blueprint_blur" && "De-quantizing full resolution..."}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error Fallback */}
      {stage === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-xs text-[var(--text-muted)]">
          <ImageOff size={20} strokeWidth={1.75}/>
          <span>Asset unreadable or missing from storage</span>
        </div>
      )}
    </div>
  );
};
```

---

## 6. Universal Responsive & Adaptive Viewport System (`375px` Mobile $\rightarrow$ `2560px` Desktop)

Every page, table, and annotation canvas must adapt smoothly across phone, tablet, laptop, and ultrawide monitors without horizontal overflow or clipped controls.

### 6.1 Breakpoint & Layout Adaptation Rules

| Breakpoint | Target Devices | Navigation Pattern | Annotation Workbench Layout | `boneyard` Bone Profile |
| --- | --- | --- | --- | --- |
| **`< 640px` (`sm`)** | Mobile Phones (`375px–639px`) | Collapsible top bar + bottom quick-action dock | Stacked single-column: Canvas on top (`52vh`), swipeable bottom sheet for labels & review buttons | `375` breakpoint bones |
| **`640px–1023px` (`md`)** | Tablets & Split Windows (`768px`) | Compact icon rail (`56px` wide) | 2-pane layout: Primary media/text editor (`65%`) + collapsible right inspector drawer (`35%`) | `768` breakpoint bones |
| **`>= 1024px` (`lg`/`xl`)** | Windows Laptops & Desktops (`1280px+`) | Full collapsible sidebar (`240px`) + status footer | 3-pane IDE workbench: Record Queue (`240px`) + Central Spatial Canvas (`flex-1`) + Schema/Provenance Inspector (`320px`) | `1280` breakpoint bones |

### 6.2 Fluid Typography, Touch-Safe Targets & Canvas Pointer Unification

1. **Fluid Typography Scale:** Use CSS `clamp()` for headings so text scales proportionally across viewports without breaking lines:
* Page Title: `font-size: clamp(1.125rem, 1rem + 0.5vw, 1.5rem)`
* Body / Controls: `0.875rem` (`14px`) with `line-height: 1.45`
* Hashes / Coordinates / Metrics: `JetBrains Mono` / `monospace` at `0.75rem` (`12px`) with `font-variant-numeric: tabular-nums` so numbers never jitter when counters update.

2. **Unified Touch + Mouse Spatial Canvas (`PointerEvents`):**
* The Object Detection Canvas (`Phase 9`) must bind `onPointerDown`, `onPointerMove`, and `onPointerUp` (instead of mouse-only events) so bounding boxes can be drawn and resized on both desktop mice and mobile/tablet touchscreens.
* Touch targets on `< 768px` viewports must maintain a minimum interactive hit area of `40px × 40px`, expanding bounding-box corner resize handles from `8px` (desktop mouse) to `18px` when `pointerType === "touch"`.
