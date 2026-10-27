# Local Deployment and Developer Experience Guide

This document details how to run, configure, seed, back up, and troubleshoot the **AI Dataset Engineering Platform** on local machines and self-hosted environments.

---

## 1. System Architecture

The platform is designed as a clean, local-first modular monolith:

| Component | Technology | Default Port | Description |
|---|---|---|---|
| **Web Frontend** | React 19 + TypeScript + Vite / Nginx | `5173` (or `80`) | Dense developer UI for labeling, validation, diffing, and export |
| **API Backend** | FastAPI + Pydantic v2 + SQLAlchemy | `8000` | REST API routes, domain services, and schema validation |
| **Worker** | Python Background Runner | N/A | Asynchronous batch inference and export packaging |
| **Database** | SQLite (Dev) / PostgreSQL 16 (Compose) | `5432` | Relational metadata store for projects, records, versions |
| **Object Storage** | Local Filesystem / MinIO / S3 | N/A | Safe content-addressed store for images, audio, ZIPs |
| **Redis** | Redis 7 Alpine | `6379` | Ephemeral cache and message broker |

---

## 2. Option A: Fast Local Native Setup (Zero Containers)

Ideal for rapid everyday development without Docker overhead.

### Prerequisites
- **Python**: 3.11 to 3.13
- **Node.js**: v20 or higher (v24 supported)

### Step 1: Clone and Configure Environment
```bash
cp .env.example .env
```
The default `.env` uses SQLite (`./data/dataset_platform.db`) and local filesystem storage (`./data/storage`), requiring no running database server.

### Step 2: Install Python Dependencies & Initialize Database
```bash
# In virtualenv:
python -m venv .venv
# On Windows:
.venv\Scripts\activate
# On Linux / macOS:
source .venv/bin/activate

pip install -e .
```

### Step 3: Start the Backend API
```bash
uvicorn services.api.main:app --host 127.0.0.1 --port 8000 --reload
```
Verify the API is running at: `http://127.0.0.1:8000/api/v1/health`

### Step 4: Start the Web Frontend
In a separate terminal:
```bash
cd apps/web
npm install
npm run dev
```
Open your browser at `http://localhost:5173`.

---

## 3. Option B: Docker Compose Deployment

Single-command setup with PostgreSQL 16, Redis 7, backend API, worker, and Nginx-served frontend.

### Step 1: Start Services
```bash
docker compose up --build -d
```

### Step 2: Verify Service Health
```bash
docker compose ps
```
All containers (`dataset-platform-api`, `dataset-platform-web`, `dataset-platform-postgres`, `dataset-platform-redis`) will show as `healthy`.

### Step 3: Access Web UI
Navigate to `http://localhost:5173`. API calls are automatically reverse-proxied to the backend via Nginx.

---

## 4. Seeding Demo Datasets ($0 Cost, Offline)

To explore the platform immediately with realistic multimodal data without needing external APIs:

```bash
python scripts/seed_demo_dataset.py
```
This populates:
1. **Multimodal AI Engineering Benchmark Project**
2. **Customer Support Intent Dataset**: 6 text records across train/val/test with human-verified annotations.
3. **Synthetic Geometry & Shape Classifier**: Real PNG assets generated on the fly with PIL, SHA-256 digests, and pHash values.
4. **Autonomous Vehicle Street Scene Detection**: High-contrast street scenes with multi-class bounding boxes (`car`, `pedestrian`) and a frozen, published **Version 1.0.0** with cryptographic manifest and dataset card.

---

## 5. Backup, Restore, and Dev Reset

The platform includes a dedicated utility (`scripts/backup_restore.py`) that backs up both the metadata database and the binary media storage into a single `.tar.gz` archive with a cryptographically signed SHA-256 manifest.

### Create a Verified Backup
```bash
python scripts/backup_restore.py backup --output ./backups/snapshot_$(date +%Y%m%d).tar.gz
```

### Verify Backup Integrity
```bash
python scripts/backup_restore.py verify --input ./backups/snapshot_20261026.tar.gz
```
Checks every extracted file's size and SHA-256 against `backup_manifest.json`.

### Restore from Backup
```bash
python scripts/backup_restore.py restore --input ./backups/snapshot_20261026.tar.gz
```

### Safe Development Reset
To cleanly wipe and recreate database tables and purge temporary storage:
```bash
python scripts/backup_restore.py reset-dev --confirm
```

---

## 6. Offline Local LLM Setup (Ollama)

To use AI-assisted auto-annotation with $0 API costs:

1. Download and run [Ollama](https://ollama.ai/).
2. Pull a local model:
   ```bash
   ollama pull llama3.2:1b
   ```
3. Set in `.env`:
   ```env
   PRIVACY_MODE=local_only
   OLLAMA_BASE_URL=http://localhost:11434
   ```
4. In the UI, click **AI Auto-Annotate** and select `Ollama (Local)`. No external data leaves your machine.

---

## 7. Troubleshooting

### Port Conflicts
- Port `8000` in use: Set `API_PORT=8001` in `.env` and restart.
- Port `5173` in use: Set `WEB_PORT=5174` in `.env`.

### Database Locked (SQLite)
If you encounter `sqlite3.OperationalError: database is locked`, ensure only one process is performing bulk writes, or switch to PostgreSQL by setting:
```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/dataset_platform
```

### File Upload Limits
Upload size limits are enforced strictly by both FastAPI and Nginx:
- Default: 100 MB (`MAX_UPLOAD_SIZE_BYTES=104857600`).
- To increase, update `MAX_UPLOAD_SIZE_BYTES` in `.env` and `client_max_body_size` in `apps/web/nginx.conf`.
