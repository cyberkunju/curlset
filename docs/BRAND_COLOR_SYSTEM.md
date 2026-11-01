# Brand Color System Specification — Curlset

**Status:** Authoritative Design Specification  
**Version:** 1.0.0  
**Scope:** Design tokens, contrast compliance, component mapping, dark/light theme dynamics, and data visualization.

---

## 1. Executive Summary & Brand Palette Overview

The Curlset color system is a cohesive, 6-tone indigo-periwinkle spectrum engineered specifically for a desktop-grade multimodal dataset platform. It delivers crisp technical precision, excellent WCAG accessibility, and a distinct aesthetic identity moving smoothly from deep obsidian navy to luminous lavender ice.

```
+---------------------------------------------------------------------------------------+
|  #0E121E      |  #1F305B      |  #476BC9      |  #8BA5F6     |  #B6CBFC   |  #D8E1FC  |
|  Brand Ink    |  Deep Indigo  |  Primary Blue |  Periwinkle  |  Soft Sky  |  Lav. Ice |
+---------------------------------------------------------------------------------------+
```

---

## 2. Definitive Color Spectrum Breakdown

| Swatch | Name | Hex Code | RGB | HSL | Relative Luminance | Authoritative Usage Rule |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| ![#0E121E](https://via.placeholder.com/15/0E121E/000000?text=+) | **Brand Ink** | `#0E121E` | `14, 18, 30` | `225°, 36%, 9%` | `0.007` | **Wordmark, headings, primary text, dark surfaces.** Replaces stark black with cool-toned depth. |
| ![#1F305B](https://via.placeholder.com/15/1F305B/000000?text=+) | **Deep Indigo** | `#1F305B` | `31, 48, 91` | `223°, 49%, 24%` | `0.035` | **Dark emphasis, selected dark-mode surfaces, strong contrast.** Elevated surfaces, dark-mode toolbars, deep accents. |
| ![#476BC9](https://via.placeholder.com/15/476BC9/000000?text=+) | **Primary Blue** | `#476BC9` | `71, 107, 201` | `223°, 54%, 53%` | `0.174` | **Primary buttons, selected navigation, links and active controls.** Key call-to-actions, active rail states, focus anchors. |
| ![#8BA5F6](https://via.placeholder.com/15/8BA5F6/000000?text=+) | **Periwinkle** | `#8BA5F6` | `139, 165, 246` | `225°, 84%, 75%` | `0.420` | **Focus indicators, charts, secondary highlights, illustrations.** Luminous accents, dark-mode badge text, glowing focus rings. |
| ![#B6CBFC](https://via.placeholder.com/15/B6CBFC/000000?text=+) | **Soft Sky** | `#B6CBFC` | `182, 203, 252` | `222°, 92%, 85%` | `0.625` | **Subtle information surfaces, loading placeholders and chart fills.** Progress bar tracks, area chart fills, skeleton washes. |
| ![#D8E1FC](https://via.placeholder.com/15/D8E1FC/000000?text=+) | **Lavender Ice** | `#D8E1FC` | `216, 225, 252` | `225°, 82%, 92%` | `0.772` | **Quiet highlights, separators in illustrations and gentle decorative accents.** Delicate borders, tag backdrops, subtle hover fills. |

---

## 3. Accessibility & Contrast Matrix (WCAG 2.1)

All pairs meet or exceed WCAG Level AA requirements for standard text (minimum `4.5:1`) and Level AAA (`7.0:1`) for dense code and UI data tables:

| Foreground / Text Color | Background Color | Contrast Ratio | WCAG Compliance Level | Recommended Use |
| :--- | :--- | :--- | :--- | :--- |
| **Brand Ink** (`#0E121E`) | Pure White (`#FFFFFF`) | **18.2 : 1** | **AAA** (Pass) | Primary light mode body text, headings, data tables |
| **Brand Ink** (`#0E121E`) | Warm Alabaster (`#FAFAFA`) | **17.5 : 1** | **AAA** (Pass) | Primary canvas headings & wordmark |
| **Brand Ink** (`#0E121E`) | Lavender Ice (`#D8E1FC`) | **14.2 : 1** | **AAA** (Pass) | Badges, callout chips, information banners |
| **Brand Ink** (`#0E121E`) | Soft Sky (`#B6CBFC`) | **11.5 : 1** | **AAA** (Pass) | Selected rows, tooltip text, progress indicators |
| **White** (`#FFFFFF`) | **Primary Blue** (`#476BC9`) | **4.6 : 1** | **AA** (Pass) | Primary button labels, active state text |
| **Periwinkle** (`#8BA5F6`) | **Brand Ink** (`#0E121E`) | **9.7 : 1** | **AAA** (Pass) | Dark mode secondary highlights, status labels |
| **Lavender Ice** (`#D8E1FC`) | **Brand Ink** (`#0E121E`) | **17.9 : 1** | **AAA** (Pass) | Dark mode primary body text, high-priority labels |
| **Lavender Ice** (`#D8E1FC`) | **Deep Indigo** (`#1F305B`) | **6.8 : 1** | **AA / AAA** (Pass) | Dark mode card headers, toolbar text, modal titles |

---

## 4. Semantic Token Architecture (Future Mapping)

When ready to incorporate into CSS variables (`apps/web/src/index.css`), the colors map into functional roles as follows:

```css
:root {
  /* Core Brand Spectrum */
  --curlset-brand-ink: #0E121E;
  --curlset-deep-indigo: #1F305B;
  --curlset-primary-blue: #476BC9;
  --curlset-periwinkle: #8BA5F6;
  --curlset-soft-sky: #B6CBFC;
  --curlset-lavender-ice: #D8E1FC;

  /* Interactive States (Derived from Primary Blue #476BC9) */
  --curlset-primary-hover: #3A5BB8;
  --curlset-primary-active: #314FA3;
  --curlset-primary-glow: 0 0 16px rgba(71, 107, 201, 0.28);
  
  /* Surface & Background Washes */
  --curlset-tint-wash: rgba(71, 107, 201, 0.06);
  --curlset-tint-hover: rgba(71, 107, 201, 0.12);
  --curlset-surface-highlight: #D8E1FC;
  --curlset-border-subtle: rgba(71, 107, 201, 0.22);
  --curlset-border-strong: rgba(71, 107, 201, 0.45);

  /* Gradients */
  --curlset-gradient-brand: linear-gradient(135deg, #1F305B 0%, #476BC9 55%, #8BA5F6 100%);
  --curlset-gradient-subtle: linear-gradient(135deg, rgba(71, 107, 201, 0.08) 0%, rgba(216, 225, 252, 0.25) 100%);
  --curlset-gradient-glow: radial-gradient(circle at 35% 35%, #1F305B, #0E121E);
}

/* Dark Mode Inversions */
.dark {
  --curlset-canvas: #0E121E;              /* Brand Ink serves as deep canvas */
  --curlset-surface-elevated: #1F305B;     /* Deep Indigo for elevated containers */
  --curlset-text-high-contrast: #D8E1FC;   /* Lavender Ice for prominent dark-mode text */
  --curlset-accent-highlight: #8BA5F6;     /* Periwinkle for luminous focus & active icons */
  --curlset-border-subtle: rgba(139, 165, 246, 0.25);
}
```

---

## 5. Component Usage Guidelines

### 1. Navigation & Sidebar
- **Wordmark & App Logo**: Uses `Brand Ink` (`#0E121E`) for text, with icon housing using `Deep Indigo` (`#1F305B`) and subtle `Periwinkle` (`#8BA5F6`) hairline.
- **Active Navigation Item**: Left indicator bar colored with `Primary Blue` (`#476BC9`), with background wash in `Lavender Ice` (`#D8E1FC` at 20% opacity) or `Soft Sky` tint.
- **Inactive Nav Items**: Subtle gray muted text, transitioning to `Brand Ink` or `Deep Indigo` on hover.

### 2. Buttons & Actions
- **Primary CTA ("Launch Workspace", "Create Project")**: Background `Primary Blue` (`#476BC9`), text `#FFFFFF`, with hover transition to `#3A5BB8`.
- **Secondary CTA**: Border in `Lavender Ice` (`#D8E1FC`) with text in `Deep Indigo` (`#1F305B`).
- **Focus Rings**: 2px outline in `Periwinkle` (`#8BA5F6`) with 2px offset for keyboard accessibility.

### 3. Cards & Workbench Views
- **Card Borders on Hover**: Transition to subtle `Primary Blue` / `Periwinkle` boundary (`rgba(71, 107, 201, 0.25)`).
- **Stage Icon Housings**: Background in `Lavender Ice` (`#D8E1FC`) with icon glyph in `Primary Blue` (`#476BC9`).
- **Data Tables & Grid**: Selected row highlight using `Soft Sky` (`#B6CBFC` at 15% opacity).

### 4. Data Visualization & Charts
- **Series 1 (Primary Split / Train)**: `Primary Blue` (`#476BC9`)
- **Series 2 (Secondary Split / Validation)**: `Periwinkle` (`#8BA5F6`)
- **Series 3 (Tertiary Split / Test)**: `Soft Sky` (`#B6CBFC`)
- **Area Fill / Background Density**: `Lavender Ice` (`#D8E1FC` with gradient opacity to transparent)
- **Grid lines & Axes**: Hairline `Lavender Ice` / `Soft Sky` (`#D8E1FC`)

---

## 6. Implementation Principles & Rules

1. **Restraint Over Flamboyance**: Use `Primary Blue` (`#476BC9`) deliberately for active states and primary actions. Do not paint entire backgrounds blue; let `Brand Ink`, `Deep Indigo`, and clean neutral canvases provide the calm desktop foundation.
2. **Accessible by Default**: Never place `Periwinkle` (`#8BA5F6`) or `Soft Sky` text directly on light backgrounds. Always use `Brand Ink` (`#0E121E`) or `Deep Indigo` (`#1F305B`) for text over light pastel fills.
3. **Harmonious Transitions**: When combining these colors in gradients, follow the natural tonal flow: `Deep Indigo` (`#1F305B`) -> `Primary Blue` (`#476BC9`) -> `Periwinkle` (`#8BA5F6`).
4. **Consistency**: Whenever new modalities, chart types, or workbench tools are designed, reference this document to pick colors according to their established semantic roles.
