# Browser acceptance suites

Playwright + Chromium scripts that drive the real backend (`:8000`) and Vite dev server (`:5173`).
They fail on any console/page error. Screenshots are written to `e2e/screenshots/` (git-ignored).

```bash
# prerequisites: uvicorn on :8000, vite on :5173
cd apps/web
npm run e2e:ui          # smoke: home, generation, review, export
npm run e2e:ui:large    # large run / progress / cancel
npm run e2e:ui:image    # image import + auto-label hand-off
npm run e2e:types       # dataset-type chooser + NL detection
npm run e2e:boxing      # object-detection canvas
npm run e2e:gen         # image generation flow (paid provider required)
npm run e2e:export      # image bundle export option
npm run e2e:proposals   # SAM box proposals end to end (paid provider required)
npm run e2e:logo        # brand asset presence
```

Suites that call paid providers must be run manually with explicit keys; deterministic suites use
simulated providers. Dataset IDs used by a suite can be overridden with environment variables
(`DETECTION_DATASET_ID`, `EXPORT_DATASET_ID`, …) — see the top of each script.
