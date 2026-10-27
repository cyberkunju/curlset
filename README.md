# AI Dataset Engineering Platform

An open-source, multimodal dataset engineering workbench that helps developers move from raw data to reviewed, validated, versioned, documented, training-ready datasets.

The platform is dataset-first: AI models assist with research, generation and annotation, but data quality, provenance, human review and portable exports remain the core product.

## Start here

**If you are an AI coding agent, read AGENTS.md first and follow it before changing code.** Then read the documents in this order:

1. AGENTS.md — mandatory implementation and execution behavior.
2. docs/DESIGN.md — architecture, system boundaries, data model and technical decisions.
3. docs/REQUIREMENTS.md — functional requirements, user stories and acceptance criteria.
4. docs/EXECUTION_PLAN.md — high-level roadmap and current phase status.
5. docs/PHASE_BY_PHASE_PLAN.md — detailed work packages, dependencies, tests, acceptance gates and completion reports for all phases.
6. docs/EXAMPLES.md — end-to-end sample scenario, schemas, records and expected exports.
7. docs/DECISIONS.md — recorded architecture and implementation decisions.

## Product goals

- Import images, text, CSV, JSON and archives safely.
- Define task-specific schemas and annotation guidelines.
- Use pluggable AI providers to propose labels, captions and structured outputs.
- Keep AI proposals distinguishable from human-reviewed annotations.
- Provide a practical annotation and review workflow.
- Validate records, detect duplicates and expose dataset quality issues.
- Track source, transformations, model runs and annotation revisions.
- Publish immutable dataset versions and reproducible exports.
- Generate dataset cards, manifests and quality reports.
- Support local-first development and a future hosted deployment without locking data to one vendor.

## Initial scope

The first complete vertical slice supports image classification and text classification, then adds object detection with COCO and YOLO exports. Initial imports/exports include JSONL and CSV. Audio, video, advanced synthetic generation, active learning and multi-agent research are later milestones; do not pretend they are implemented before their acceptance tests pass.

## Working principles

- Build a reliable modular monolith before considering microservices.
- Keep provider SDKs behind a stable gateway.
- Keep original assets, normalized records, annotations, provenance and dataset versions separate.
- Make expensive or long-running work asynchronous and idempotent.
- Prefer explicit workflows and validated outputs over unbounded autonomous agent behavior.
- Preserve data portability and document limitations.
- Never claim a license is approved merely because a URL is public.
- Do not expose API keys to the browser or send data to an external provider without an explicit, visible configuration.

## Status

This repository begins with the product contract and execution plan. The coding agent must inspect the repository, reconcile these documents with the current codebase, and execute the phases in order. It must update the execution log as work progresses and must not mark a feature complete without tests or documented evidence.

## Quickstart & Local Deployment

For complete details, see [docs/DEPLOYMENT.md](file:///c:/my%20files%20in%20athuls%20lap/my%20files%20in%20athuls%20lap/projects/AI-DATASET-ENGINEERING-PLATFORM--main/docs/DEPLOYMENT.md).

### Option 1: Native Local Setup (Zero Containers, SQLite)
```bash
# 1. Setup Python virtual environment
python -m venv .venv
source .venv/bin/activate  # Or .venv\Scripts\activate on Windows
pip install -e .

# 2. Seed realistic multimodal demo datasets ($0 external API cost)
python scripts/seed_demo_dataset.py

# 3. Start Backend API
uvicorn services.api.main:app --host 127.0.0.1 --port 8000 --reload

# 4. Start Web UI (in another terminal)
cd apps/web && npm install && npm run dev
```
Open [http://localhost:5173](http://localhost:5173).

### Option 2: Docker Compose (PostgreSQL 16 + Redis 7 + Nginx)
```bash
docker compose up --build -d
```
Access the application at [http://localhost:5173](http://localhost:5173).

### Backup & Restore
```bash
# Create verified backup with SHA-256 manifest
python scripts/backup_restore.py backup --output ./backups/backup_latest.tar.gz

# Verify backup integrity
python scripts/backup_restore.py verify --input ./backups/backup_latest.tar.gz
```

## Documentation

Use [docs/EXECUTION_PLAN.md](file:///c:/my%20files%20in%20athuls%20lap/my%20files%20in%20athuls%20lap/projects/AI-DATASET-ENGINEERING-PLATFORM--main/docs/EXECUTION_PLAN.md) for the roadmap and phase status, [docs/PHASE_BY_PHASE_PLAN.md](file:///c:/my%20files%20in%20athuls%20lap/my%20files%20in%20athuls%20lap/projects/AI-DATASET-ENGINEERING-PLATFORM--main/docs/PHASE_BY_PHASE_PLAN.md) for detailed implementation tasks and acceptance gates, and [docs/DEPLOYMENT.md](file:///c:/my%20files%20in%20athuls%20lap/my%20files%20in%20athuls%20lap/projects/AI-DATASET-ENGINEERING-PLATFORM--main/docs/DEPLOYMENT.md) for setup and operations.
