# R8 — Data Infrastructure and Reproducibility (State of the Art)

**Status:** research note for the Curlset rebuild · **Date:** 2026-11-04
**Scope:** content addressing, deterministic artifacts, versioning models, metadata standards, training formats, immutability, scale, and a migration for `dataset_io`, `dataset_versioning`, `dataset_export`, and `dataset_core/db`.

**Evidence convention.** Code claims are from `C:\Users\knava\Downloads\curlset\repo` (commit `37d5d05` plus uncommitted remediation). External claims cite a primary source. **[unverified]** = reasoned from format properties, not executed here. **[measured]** = run locally on Python 3.12.10 / zlib 1.3.1.

---

## 1. Executive summary

- **The ZIP timestamp fix is necessary but not sufficient.** The tree now writes fixed `(1980,1,1,0,0,0)` timestamps, `create_system=3`, fixed `external_attr` and sorted members. But export still re-serializes the manifest with `indent=2` instead of shipping the bytes that were hashed; assets are still keyed by random `asset_id`; missing assets are still skipped; and `manifest_hash` still covers a random `version_id` and wall-clock `created_at`.
- **Split identity into two hashes.** A *statement* (dataset, schema, version number/parent, records with chosen annotation revisions and asset hashes, quality, file list) canonicalised with RFC 8785 JCS and hashed to `statement_sha256` is reproducible from DB rows. An *envelope* adds `created_at`, `created_by` and Ed25519 signatures. The envelope is what consumers verify; the statement is what identity means.
- **Move bytes into a whole-file SHA-256 CAS** (`cas/sha256/aa/bb/<hash>`) with a `blobs` table; logical `assets` rows point at it. Add FastCDC only above ~64 MiB. GC is mark-and-sweep from immutable version roots with a grace period, never refcounting.
- **Byte-identical export is an algorithm:** copy stored statement bytes verbatim, impose a total order on UTF-8/NFC member paths, name media by content hash, fix ZIP metadata, use `ZIP_STORED` for the canonical artifact (or pin zlib and record it), stream to a temp file, verify every blob before writing, and store the archive in CAS so re-export is idempotent.
- **Copy models, not stacks.** Blob pointers from Git/DVC/Git-LFS; layered immutable manifests from Iceberg/Lance; append-only commit logs from Delta/lakeFS; chunk dedup from Xet. Emit Croissant 1.1, PROV-O, SPDX 3.0 and a Datasheets-style card as deterministic *projections* of the manifest. Do not adopt Delta/Iceberg as the storage format, and do not make the canonical manifest JSON-LD.

---

## 2. What the code does today

| Area | Evidence | Fix |
|---|---|---|
| Asset identity | `assets/<dataset>/<asset_id>.<ext>`, random id (`ingestion_service.py`) | CAS + `blobs.content_hash` |
| Dedup | Per-dataset sha256 check that **skips** the duplicate (`ingestion_service.py:255-272`) | Link existing blob; keep the record |
| Manifest | `json.dumps(sort_keys=True)` (`manifest.py:59-76`); hash covers random `version_id` + clock (`service.py:175,255-273`) | JCS statement + Merkle content root |
| Stored hash | Written once, never recomputed (`get_version_manifest`) | Verify on every read |
| Export manifest | Re-dumped with `indent=2` (`export/service.py:137-141`) | Ship stored bytes |
| Export assets | `assets/{original_filename}`, `continue` on error (`:148-169`) | Content-addressed names; fail closed |
| Export memory | `io.BytesIO` + `writestr` (`:131-172`) | Stream to temp file |
| Immutability | `ImmutableVersionError` never raised; cascade deletes versions | Triggers + RESTRICT + events |

The audit's C6 (wall-clock ZIP) is closed. Its deeper cause — the artifact is not a function of content — is not.

---

## 3. Comparison tables

### 3.1 Content addressing and chunking

| System | Unit | Hash | Dedup scope | What to copy |
|---|---|---|---|---|
| Git | blob/tree/commit | SHA-1 (SHA-256 optional) | repo | Merkle DAG, immutable objects |
| Git LFS | whole file | `oid sha256:<hex>` + `size` [16] | server | Pointer contract |
| DVC | file or `.dir` object | MD5 (`md5` field) [14][15] | cache/remote | `.dir` manifests, 2-char fanout |
| restic | CDC chunk (Rabin) | per chunk | repo | 512 KiB min / 1 MiB avg / 8 MiB max [13] |
| FastCDC | CDC chunk (Gear) | per chunk | store | 16/64/256 KiB-style bounds [11][12] |
| HF Xet | CDC chunk (~64 KiB), 64 MB blocks | chunk + block | global | Chunk dedup for large files [20][21] |

**Decision.** Whole-file CAS for small media: exact duplicates are common, verification is one hash, metadata is one row. CDC only for large, edited objects (video, archives), where Xet's "only the modified content" win applies [20]. A 200 KB JPEG does not benefit.

### 3.2 Dataset versioning systems

| System | Version model | Guarantee | Weakness | Verdict |
|---|---|---|---|---|
| **DVC** | pointer in Git; commit is the version | content integrity | MD5; Git required; no server immutability [14][15] | Copy pointer + dir manifest |
| **Git LFS** | commit + pointer | integrity | per-file, no chunking, hosting cost [16] | Copy pointer only |
| **lakeFS** | commit DAG over object store | zero-copy branch = pointer to commit [17] | needs object store + DB | Copy commits/tags/branches |
| **Delta Lake** | append-only `_delta_log`, 20-digit versions, checkpoints [18] | ACID, time travel | table semantics, Spark gravity | Copy log + checkpoint as audit layer |
| **Iceberg** | metadata.json → snapshot → manifest list → manifests [19] | snapshot isolation, manifest reuse | heavy, catalog required | Copy layered manifests |
| **HF Hub/Xet** | Git revision + Xet chunks | immutable revision, chunk dedup [20] | hosted | Copy chunk CAS, revision per freeze |
| **Lance** | immutable manifest per version; version numbers, not content hashes [22] | time travel, random access | young ecosystem | Copy manifest-per-version |

**Decision.** A Git-shaped Merkle DAG inside the product (record leaf → content root → statement → artifact), an Iceberg/Lance-shaped immutable manifest per version, and a Delta-shaped append-only event log. Do not adopt Delta/Iceberg physically: their unit is a partitioned table, Curlset's is a record with heterogeneous assets, review state and provenance.

### 3.3 Metadata standards

| Standard | Role | Adopt? |
|---|---|---|
| **Croissant 1.1** (Feb 2026): `cr:FileObject` with `sha256`, `cr:RecordSet`, `cr:Field`, `cr:Split`; adds provenance/vocabulary interop [23][24][25] | ML interoperability | **Yes** — `croissant.json` |
| **RO-Crate 1.3** — JSON-LD research-object packaging [26][27] | archival exchange | Optional |
| **Datasheets for Datasets** / **Data Cards** [28][29] | human documentation | **Yes** — card structure |
| **W3C PROV-O** — Entity/Activity/Agent lineage [30] | provenance graph | **Yes** — `prov.json` |
| **SPDX 3.0** — licences/SBOM; in ISO/IEC 5962 revision [31][32] | rights | **Yes** — `spdx.json` |
| **schema.org Dataset** [33] | discovery | Yes, embedded |
| **in-toto/SLSA** [43][44] | build attestations | Optional |

**Which should the manifest implement?** None as the canonical form. No standard covers annotation revision + review status + blob hash + quality findings with a byte-level canonicalisation rule. Keep the manifest plain canonical JSON and generate standards as frozen projections. This also avoids depending on RDF canonicalisation (RDFC-1.0 [42]) for byte identity.

### 3.4 Training formats

| Format | Access | Byte-determinism | Best for |
|---|---|---|---|
| **JSONL** | streaming, universal | high if keys/numbers fixed | text, chat, labels |
| **Parquet** | random + pushdown | **conditional**: footer embeds writer string [34][35] | label tables, analytics |
| **Arrow IPC** | random, zero-copy | conditional on writer [36] | process interop |
| **WebDataset** | sequential shards | high only if tar headers zeroed [37] | media at scale |
| **MDS** | random + resumable | conditional on writer [38] | pretraining |
| **TFRecord** | sequential | **low**: protobuf is not canonical [39][40] | TF-native pipelines |

**Decision.** Internal truth = CAS + relational metadata + canonical statement. Exports are views: JSONL default, Parquet for tabular, WebDataset for media, COCO/YOLO for vision. Columnar wins when you read few columns over many rows (label audits, statistics); row-oriented wins when every sample touches every field (media training). Record writer versions; treat Parquet/Arrow digests as "reproducible under the pinned writer". Never make a training format the system of record.

### 3.5 Integrity mechanisms

| Mechanism | Detects | Blind to |
|---|---|---|
| SHA-256 per blob | corruption, substitution | coordinated hash rewrite |
| Hash chain | edits, reordering | truncation, whole-log rewrite |
| Ed25519 [2] | forgery without the key | key compromise |
| Merkle proof [3] | exclusion/substitution vs a root | a rewritten root |
| Transparency log [45] | split view/rewrite **if witnessed** | unwatched logs |
| External anchor [46] | backdating | post-anchor tampering is still hash-checked |

Honest threat model: a local chain plus a local key proves nothing against the machine's owner. It proves a lot against corruption, a stray script, a partial restore, or a different party who received the artifact. Only external anchoring makes it third-party tamper-evident.

---

## 4. The reproducibility recipe

### 4.1 Decomposition

```
artifact_bytes = F(statement_bytes, asset_bytes[], member_policy, archive_policy, code_version, environment)
```

Every term must be pinned or eliminated. Today `statement_bytes` (re-serialized), `asset_bytes[]` (unverified), `archive_policy` (default deflate) and `environment` (zlib) are unpinned.

This is the reproducible-builds discipline applied to data: the output must be a pure function of declared inputs, the toolchain must be pinned and recorded, no network or clock may influence the bytes, ordering must be explicit, and an independent party must be able to rebuild and compare digests [5]. `SOURCE_DATE_EPOCH` is the established convention for clamping embedded timestamps [6]; here the ZIP epoch is fixed at 1980-01-01, the minimum DOS timestamp, so no environment variable is needed at export time.

### 4.2 Exact export algorithm

1. **Load, do not regenerate.** Read `statement.json` bytes from CAS; verify `sha256(bytes) == statement_sha256` and the DB row. Fail on mismatch.
2. **Resolve the member set up front** from `statement.files[]` + exporter outputs. Missing output = failure, never omission.
3. **Verify assets before writing.** Stream each unique blob through SHA-256; compare size and digest; collect *all* failures and raise one `IntegrityError`. A partial archive is never success.
4. **Name media by content.** `assets/<sha256><canonical-ext>`, extension from stored media type (`image/jpeg → .jpg`). Identical bytes appear once; collisions are impossible; `original_filename` lives in the statement.
5. **Normalise paths.** Relative, `/`, NFC, no `.`/`..`/leading `/`/backslash/control chars, ≤255 bytes per segment, no duplicates.
6. **Total order.** Sort by UTF-8 bytes of the path, never locale, never `os.listdir`.
7. **Fixed member metadata.** Fresh `ZipInfo(name, (1980,1,1,0,0,0))`; `create_system=3`; `external_attr=0o100644<<16`; `internal_attr=0`; `extra=b""`; `comment=b""`; `compress_type=ZIP_STORED` (the local header's optional extra fields are what APPNOTE [7] allows and what must stay empty). `ZipInfo` defaults `create_system` to 0 on Windows and 3 elsewhere [8], so set it explicitly.
8. **Canonical companions.** `manifest.json`, `statement.json`, `statement.sha256` (`<hex>  statement.json\n`), `signatures.json`, frozen `README.md`, `croissant.json`, `prov.json`, `spdx.json`, `index/records.jsonl`.
9. **Stream and hash.** Write `cas/tmp/<uuid>.zip` via `ZipFile.open(name,"w")` or `write()` from a path; hash while writing; `fsync`; `os.replace` into `cas/exports/<hash>.zip`; `chmod 0444`.
10. **Idempotent registration.** `artifact_id = "exp_"+sha256[:20]`; unique `(version_id, format, compression, exporter_version, sha256)`. Re-export returns the existing row.
11. **Record the environment**: `exporter_version`, `python_version`, `zlib_version` (if deflated), spec versions, `member_count`.
12. **Serve integrity**: `Content-Digest: sha-256=:...:` (RFC 9530 [4]), strong ETag, `Content-Length`, range-capable `FileResponse` — not a whole-file `Response`.

### 4.3 Canonical JSON: use RFC 8785, not `json.dumps`

`json.dumps(sort_keys=True, separators=(",",":"))` is stable within CPython but is **not** JCS, which requires ECMAScript number formatting and UTF-16 key ordering [1]. **[measured]** on Python 3.12.10:

| Value | Python | JCS/ECMAScript |
|---|---|---|
| `1e-7` | `1e-07` | `1e-7` |
| `1.0` | `1.0` | `1` |
| `-0.0` | `-0.0` | `0` |
| `NaN`/`Infinity` | emitted (invalid JSON) | rejected (I-JSON) |

Use a vetted implementation (`rfc8785` [47]) or integers/decimal strings only. Reject non-finite floats at the boundary — this also closes the audit's `1e400` geometry acceptance, which Python parses as infinity. Quantise derived metrics to fixed decimals; float summation order is otherwise a cross-platform hash hazard.

### 4.4 What must be pinned

| Layer | Pin | Why |
|---|---|---|
| Serialisation | `rfc8785` + `manifest_spec` version | defines the bytes |
| Text | NFC, `unicodedata.unidata_version` | macOS NFD; Unicode data changes between Pythons |
| Sorting | UTF-8 byte order, explicit keys | locale collation differs |
| Time | UTC, fixed ZIP epoch, seconds precision | wall clock must not enter a hash |
| Compression | `ZIP_STORED`; else zlib build + level + `ZLIB_RUNTIME_VERSION` | zlib-ng is "not fully deterministic" [9]; deflate-in-ZIP thread [10] |
| ZIP writer | Python version; explicit `create_system`/`external_attr`/`extra` | OS defaults and reused `ZipInfo` leak metadata |
| Code | exporter version bumped on any byte change; hash-locked deps; container digest | otherwise a refactor changes bytes |
| Derived formats | CSV dialect + `\n`; float format (`%.6f`); COCO/YOLO sort+clamp; Parquet/Arrow writer | each exporter is part of F |
| Runtime | fixed thread count; no set-iteration leaks | hidden nondeterminism |

### 4.5 Verification (the inverse)

`curlset verify <zip>`: (1) reject duplicate/absolute/`..`/backslash/non-NFC names and members absent from `statement.files[]`; (2) assert every `date_time == (1980,1,1,0,0,0)`, `extra == b""`, `comment == b""`, `create_system == 3`, `external_attr == 0o100644<<16`, `compress_type == 0`; (3) hash members against `files[].sha256`; (4) hash `statement.json` against `statement.sha256` and the DB; (5) verify Ed25519 over `JCS({statement_sha256, created_at, created_by})` with a **pinned** key; (6) recompute `content_hash` from records; (7) compare the archive digest with the artifact row and `Content-Digest`; (8) optionally check a log inclusion proof.

---

## 5. Concrete redesign

### 5.1 Storage

**Layout.** `cas/sha256/<h[0:2]>/<h[2:4]>/<h>`, no extension, mode `0444`. Two fanout levels give 65,536 directories — enough for tens of millions of blobs.

**Write.** Stream to `cas/tmp/<uuid>`; `hashlib.file_digest`; `fsync`; if the target exists verify size and discard; else `os.replace` and `chmod 0444`.

**Schema.** `blobs` table; `assets.content_hash`; dedup via `ON CONFLICT DO NOTHING` and *link* the existing blob instead of dropping the record. Keep `storage_key` as `legacy_storage_key` during migration.

**Chunking.** Whole-file up to 64 MiB. Above, FastCDC 16/64/256 KiB, Gear hash, parameters stored on the blob row; the chunk list is a canonical JSON blob, so a large file's identity is a Merkle root over chunks.

**GC.** Mark-and-sweep: roots = all `dataset_versions` (published versions pin forever), `manifest_blob`, `export_artifacts`, and blobs of non-archived assets. Sweep only blobs older than 24 h into `cas/.trash/<date>/`; `gc --purge` is explicit. The grace period protects in-flight writes that have not committed their row.

**Scrub.** `curlset fsck --sample 1%` re-hashes, records `verified_at`, quarantines mismatches.

**Migration from the id layout.** Ledger `migration_items(kind,key,status,attempts,error)`: stream each `storage_key`, hash it, compare to `assets.sha256`/`byte_size`; mismatch → `quarantined`, never accepted. Insert `blobs`, `os.link` the old file to the CAS path (same filesystem, no extra space), set `content_hash`, keep `legacy_storage_key`. Re-run until zero pending; dual-read one release; then `gc --legacy`.

### 5.2 Schema

```sql
CREATE TABLE blobs (
  hash char(64) PRIMARY KEY CHECK (hash ~ '^[0-9a-f]{64}$'),
  size_bytes bigint NOT NULL, media_type text,
  chunking text NOT NULL DEFAULT 'whole', chunk_manifest char(64) REFERENCES blobs(hash),
  created_at timestamptz NOT NULL, verified_at timestamptz);

ALTER TABLE assets ADD COLUMN content_hash char(64) REFERENCES blobs(hash);
CREATE INDEX idx_assets_content_hash ON assets(content_hash);

ALTER TABLE dataset_versions
  ADD COLUMN statement_sha256 char(64) NOT NULL,
  ADD COLUMN content_hash char(64) NOT NULL,
  ADD COLUMN manifest_blob char(64) REFERENCES blobs(hash),
  ADD COLUMN signature text, ADD COLUMN signing_key_id text,
  ADD COLUMN freeze_key text UNIQUE;

CREATE UNIQUE INDEX uq_version_number ON dataset_versions(dataset_id, version_number);
CREATE UNIQUE INDEX uq_version_tag ON dataset_versions(dataset_id, version_tag);
CREATE UNIQUE INDEX uq_version_content ON dataset_versions(dataset_id, content_hash, COALESCE(parent_version_id, ''));
ALTER TABLE dataset_versions DROP CONSTRAINT dataset_versions_dataset_id_fkey,
  ADD CONSTRAINT dataset_versions_dataset_id_fkey FOREIGN KEY (dataset_id)
  REFERENCES datasets(id) ON DELETE RESTRICT;

CREATE TABLE version_records (
  version_id text REFERENCES dataset_versions(id) ON DELETE RESTRICT,
  record_id text NOT NULL, leaf_hash char(64) NOT NULL,
  annotation_revision_id text, position integer NOT NULL,
  PRIMARY KEY (version_id, record_id));

CREATE TABLE version_events (
  seq bigserial PRIMARY KEY, event_id text UNIQUE NOT NULL, version_id text NOT NULL,
  event_type text NOT NULL, payload jsonb NOT NULL, actor_id text NOT NULL,
  created_at timestamptz NOT NULL, prev_hash char(64) NOT NULL, event_hash char(64) NOT NULL);

CREATE TABLE jobs (
  id text PRIMARY KEY, type text NOT NULL, payload jsonb NOT NULL,
  status text DEFAULT 'queued', attempts int DEFAULT 0, run_after timestamptz DEFAULT now(),
  locked_by text, locked_until timestamptz, idempotency_key text UNIQUE, last_error text,
  created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL);
```

`version_records.leaf_hash` is the Merkle leaf; `content_hash` is the root over leaves sorted by `record_id`, with RFC 6962 domain separation (`SHA256(0x00||leaf)`, `SHA256(0x01||left||right)` [3]). That gives O(log n) proofs: "record X with revision Y is in version Z" without shipping a gigabyte manifest. `record_id` deliberately has **no** foreign key: deleting a live record must never mutate frozen history.

SQLite: Alembic `render_as_batch=True` [41], `journal_mode=WAL`, `busy_timeout`, `foreign_keys=ON`. Postgres: `JSONB` via `JSON().with_variant(JSONB, "postgresql")`, `timestamptz`, `text`, partial indexes.

### 5.3 Manifest v2: statement + envelope

`statement.json` — JCS, **no wall clock, no signatures**:

```json
{"spec":{"manifest":"2.0.0","canonicalization":"RFC8785","hash":"sha256","merkle":"RFC6962"},
 "dataset":{"id":"...","name":"...","task_type":"...","schema_version":1,"label_schema":{}},
 "version":{"number":7,"tag":"v7.0.0","parent_id":"ver_..."},
 "content":{"record_count":12043,"content_hash":"<root>","split_counts":{"train":10000,"val":1000,"test":1043}},
 "records":[{"record_id":"...","leaf_hash":"...","split":"train","metadata":{},
   "annotation":{"revision_id":"...","revision_number":3,"origin":"human","status":"approved","payload":{}},
   "assets":[{"role":"primary_image","content_hash":"...","media_type":"image/jpeg",
              "byte_size":812345,"dimensions":{"width":1024,"height":768}}]}],
 "quality":{"is_publishable":true,"blocking_count":0,"findings":[]},
 "files":[{"path":"assets/<sha>.jpg","sha256":"...","size":812345,"media_type":"image/jpeg"}]}
```

Records sorted by `record_id`; assets by `(role, position, content_hash)`; no `asset_id` (content hash is identity); no unquantised floats. `files[]` enumerates every archive member **except** `manifest.json`, `statement.json`, `statement.sha256` and `signatures.json`; those are covered by the statement hash and the signature, which avoids a manifest hashing itself. Above 50k records, replace `records` with `shards:[{path,sha256,count,first_record_id,last_record_id}]` and put per-record data in `records/shard-NNNN.jsonl`, assigned by `int(sha256(record_id)[:8],16) % shard_count` and sorted within each shard.

`manifest.json` envelope adds `statement`, `statement_sha256`, `created_at`, `created_by`, `signatures[]`. The signature covers `JCS({statement_sha256, created_at, created_by})`, domain-separated with `b"curlset-manifest-v2\x00"`. `version_id = "ver_" + base32(sha256(statement_bytes))[:20]`, so re-freezing the same rows (same parent/number) yields the same ID; `freeze_key` makes it idempotent.

### 5.4 Immutability, signing, transparency

**App:** `VersioningService` raises `ImmutableVersionError` on any mutation of a frozen row; corrections create a new version with `parent_version_id`.

**DB:** SQLite `BEFORE UPDATE/DELETE` triggers with `RAISE(ABORT)`; Postgres trigger plus a `curlset_app` role with `SELECT, INSERT` only and `REVOKE UPDATE, DELETE`. FKs become `ON DELETE RESTRICT`; dataset deletion becomes `archived=true`, purge requires a `tombstoned` event and zero versions. Triggers can be dropped by the DB owner: immutability is only as strong as role separation.

**Events:** every freeze/sign/export/verify appends `version_events` with `prev_hash` = prior `event_hash`; `event_hash = sha256(JCS(event_without_hash) || prev_hash)`. This is the Delta/lakeFS log applied to dataset lifecycle.

**Signing:** Ed25519 (RFC 8032 [2]) via `cryptography`; private key file mode `0600` outside the DB or from `CURLSET_SIGNING_KEY`; public key at `keys/<key_id>.pub`; rotation = new `key_id`. Verify against a pinned trust set, not the embedded key.

**Transparency:** local RFC 6962-style Merkle log over `(seq, event_hash)` [3]; `log proof` returns inclusion, `log checkpoint` returns `{tree_size, root_hash, signature, created_at}`. Anchor checkpoints with OpenTimestamps [46] or a Rekor instance [45]. Without a witness, an operator with DB + key can rewrite consistently; document that instead of claiming "tamper-proof".

**Proof chain:** pinned `statement_sha256` → artifact digest → statement bytes → signature under a pinned key → recomputed `content_hash` → each blob hash → inclusion proof to a witnessed root.

### 5.5 Export package

`manifest.json`, `statement.json`, `statement.sha256`, `signatures.json`, frozen `README.md`, `croissant.json`, `prov.json`, `spdx.json`, `index/records.jsonl`, the format data file(s), and one `assets/<sha256>.<ext>` per unique blob. Missing asset → fail with the full list. `--allow-partial` writes `MISSING_ASSETS.json` and marks `complete=false`; it is never the default.

### 5.6 Scale

| Scale | Breaks first | Fix |
|---|---|---|
| **10k** | N+1 loads, full-dataset quality scans | `selectinload`, batching, keyset pagination |
| **1M** | `create_version` materialises everything (GBs); a single manifest reaches 0.5–2 GB at ~0.5–2 KB/record (measured: 1.5 KB for 10 text records); ZIP in RAM; `OFFSET`; sync export | streaming freeze, 50k-record shards, Merkle root, background job, `ZIP_STORED` streaming |
| **100M** | single-writer SQLite; one manifest impossible; asset directory; full scans; backup windows | Postgres partitioning, `COPY`, hierarchical Merkle, 2-level CAS fanout, sampled quality, parallel shard export |

**When SQLite is wrong.** Not at a row count — its theoretical limit is 281 TB [48] — but at concurrency and query shape: "only one writer at any instant in time" [49], so more than one writing API worker forces Postgres. Also move for `JSONB` GIN, `tsvector`, `pg_trgm`, partial indexes, `SKIP LOCKED`, partitioning, logical replication and online DDL. Local-first compromise: SQLite for single-user, Postgres profile for teams, DuckDB over Parquet for analytics.

**Bounded memory is a hard rule.** Freeze reads records in 1,000-row batches (`yield_per` or a server-side cursor) and appends each shard file as it goes; export copies blobs with `shutil.copyfileobj` into `ZipFile.open(name,"w")`; quality rules stream. No path may hold the dataset, the manifest, or the archive in RAM.

**Indexes.** `(dataset_id,id)`, `(dataset_id,split,id)`, `(dataset_id,status,id)` on annotations, `(record_id,position)`, `(annotation_id,revision_number)`, `(content_hash)`, `(version_id,record_id)`; Postgres `INCLUDE` + partial indexes for pending review.

**Pagination.** Keyset, never `OFFSET`:

```sql
SELECT ... FROM dataset_records
WHERE dataset_id=:ds AND (created_at,id) < (:c_created,:c_id)
ORDER BY created_at DESC, id DESC LIMIT :n;
```

Return an opaque base64 cursor with the last `(created_at,id)` and direction. At 1M rows `OFFSET 900000` scans 900k rows per page; keyset is O(log n).

**Jobs.** Outbox row in the same transaction as the business change. Postgres claim:

```sql
UPDATE jobs SET status='running', locked_by=:w, locked_until=now()+interval '5 min', attempts=attempts+1
WHERE id=(SELECT id FROM jobs WHERE status='queued' AND run_after<=now()
          ORDER BY run_after,id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *;
```

The claim pattern is PostgreSQL's `FOR UPDATE SKIP LOCKED` [50]. SQLite uses `BEGIN IMMEDIATE` and one worker. Add heartbeats, exponential backoff with jitter, dead-letter, and a cancellation flag checked at batch boundaries.

### 5.7 Migration plan

| Phase | Work | Exit criterion |
|---|---|---|
| **M0** | Alembic baseline (`render_as_batch=True`), `psycopg[binary]`, hash-locked deps, CI matrix, `session.py` reads `settings.DATABASE_URL` | `alembic upgrade head` on empty + production copy; app starts on Postgres |
| **M1** | `blobs`, verified backfill via hard links, `assets.content_hash`, `fsck`, GC | 100% verified, zero pending, dedup ratio reported |
| **M2** | JCS statement, content Merkle, envelope, deterministic `version_id`, `freeze_key`, signatures; v1 preserved as `legacy` | two freezes of a fixture give identical `statement_sha256` |
| **M3** | Stored bytes, content-addressed members, preflight, `ZIP_STORED`, streaming, `verify` CLI, RFC 9530 headers | golden digest green on 3 OSes; tamper tests fail closed |
| **M4** | Triggers, RESTRICT FKs, event log, DB roles, key management | ORM/raw-SQL mutation attempts raise |
| **M5** | Dialect variants, `pgloader` cutover [51], outbox worker, keyset APIs | both dialects pass one suite; row/hash counts verified |
| **M6** | Sharded statements, WebDataset/Parquet exporters, parallel export | 1M-record freeze/export within a memory budget |

### 5.8 The test that proves byte-identical export

`tests/integration/test_export_byte_identity.py`:

```python
import hashlib, os, subprocess, sys, zipfile
from pathlib import Path
import pytest
from packages.dataset_core.exceptions import IntegrityError

GOLDEN = {"csv": "<sha256 committed with the fixture>"}

def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()

def run_export(db, cas, version, out, env_extra):
    env = {**os.environ, "DATABASE_URL": f"sqlite:///{db}", "CURLSET_CAS_DIR": cas, **env_extra}
    subprocess.run([sys.executable, "-m", "curlset.cli", "export", "--version", version,
                    "--format", "csv", "--out", str(out)], check=True, env=env, cwd=out.parent)
    return out

def test_bytes_identical_across_environments(tmp_path, frozen_fixture):
    a = run_export(frozen_fixture.db, frozen_fixture.cas, frozen_fixture.version, tmp_path/"a.zip",
                   {"TZ": "UTC", "LANG": "C", "PYTHONHASHSEED": "0"})
    b = run_export(frozen_fixture.db, frozen_fixture.cas, frozen_fixture.version, tmp_path/"b.zip",
                   {"TZ": "Pacific/Auckland", "LANG": "tr_TR.UTF-8",
                    "PYTHONHASHSEED": "random", "TMPDIR": str(tmp_path/"other")})
    assert a.read_bytes() == b.read_bytes()
    assert sha(a) == sha(b) == GOLDEN["csv"] == frozen_fixture.stored_artifact_sha256

def test_zip_structure_is_canonical(tmp_path, frozen_fixture):
    p = run_export(frozen_fixture.db, frozen_fixture.cas, frozen_fixture.version,
                   tmp_path/"c.zip", {"TZ": "UTC"})
    with zipfile.ZipFile(p) as zf:
        infos = zf.infolist(); names = [i.filename for i in infos]
        assert names == sorted(names, key=lambda n: n.encode("utf-8"))
        assert len(names) == len(set(names))
        for i in infos:
            assert i.date_time == (1980, 1, 1, 0, 0, 0)
            assert i.create_system == 3 and i.extra == b"" and i.comment == b""
            assert i.compress_type == zipfile.ZIP_STORED

def test_statement_hash_is_reproducible_from_db(frozen_fixture):
    h1 = frozen_fixture.freeze()
    h2 = frozen_fixture.freeze(freeze_key=h1.freeze_key)   # same key => idempotent
    assert h1.statement_sha256 == h2.statement_sha256
    assert h1.version_id == h2.version_id

def test_missing_asset_fails_closed(tmp_path, frozen_fixture):
    (frozen_fixture.cas / frozen_fixture.first_blob_path).unlink()
    with pytest.raises(IntegrityError, match="missing blob"):
        run_export(frozen_fixture.db, frozen_fixture.cas, frozen_fixture.version,
                   tmp_path/"d.zip", {"TZ": "UTC"})
```

The fixture must inject the clock and ID generator (`time.time()` + `secrets` today). Run the file on Ubuntu, macOS and Windows in CI; one OS proves only "deterministic on this machine".

---

## 6. Standards to implement, in order

1. **RFC 8785 JCS + SHA-256 + RFC 6962 Merkle** — the manifest, content root, proofs.
2. **RFC 8032 Ed25519 + RFC 9530** — signatures and HTTP integrity.
3. **Croissant 1.1** — `cr:FileObject.sha256`, `RecordSet`, `Field`, `Split` [23][24].
4. **Datasheets + Data Cards** — the README template [28][29].
5. **W3C PROV-O** — `prov.json` for ingest/annotate/review/freeze/export [30].
6. **SPDX 3.0** — per-asset and dataset licences [31][32].
7. **schema.org Dataset** — embedded JSON-LD [33].
8. **RO-Crate 1.3 / in-toto-SLSA / TUF** — optional archival, attestation, mirror trust [26][43][52].

---

## 7. What remains unverified

- **zlib cross-version byte equality.** Not measured; `ZIP_STORED` is risk elimination backed by the zlib-ng report [9] and the deflate-in-ZIP thread [10], not by a local diff.
- **Croissant 1.1 provenance predicates.** Capability confirmed [23][24]; exact properties must be read from the spec before implementation.
- **Parquet/Arrow/TFRecord determinism.** Reasoned from writer strings [34] and non-canonical protobuf [40]; not measured.
- **Postgres at 100M rows.** Design, not executed evidence.
- **Key custody.** File-based keys suit local-first single-user; multi-user needs OS keychain/HSM.

---

## 8. References

1. RFC 8785 JCS — https://www.rfc-editor.org/rfc/rfc8785.html
2. RFC 8032 EdDSA — https://www.rfc-editor.org/rfc/rfc8032.html
3. RFC 6962 Certificate Transparency — https://www.rfc-editor.org/rfc/rfc6962.html
4. RFC 9530 Digest Fields — https://www.rfc-editor.org/rfc/rfc9530.html
5. Reproducible Builds, timestamps — https://reproducible-builds.org/docs/timestamps/
6. SOURCE_DATE_EPOCH — https://reproducible-builds.org/specs/source-date-epoch/
7. PKWARE APPNOTE 6.3.10 — https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT
8. Python `zipfile` — https://docs.python.org/3/library/zipfile.html
9. zlib-ng determinism (Red Hat 2445516) — https://bugzilla.redhat.com/show_bug.cgi?id=2445516
10. rb-general deflate/ZIP thread — https://lists.reproducible-builds.org/pipermail/rb-general/2024-September/003547.html
11. FastCDC, USENIX ATC 2016 — https://www.usenix.org/system/files/conference/atc16/atc16-paper-xia.pdf
12. fastcdc-py — https://github.com/iscc/fastcdc-py
13. restic chunker — https://github.com/restic/chunker
14. DVC internal files — https://doc.dvc.org/user-guide/project-structure/internal-files
15. DVC `.dvc` files — https://doc.dvc.org/user-guide/project-structure/dvc-files
16. Git LFS spec — https://github.com/git-lfs/git-lfs/blob/main/docs/spec.md
17. lakeFS internals — https://docs.lakefs.io/concepts/internals/
18. Delta transaction log — https://github.com/delta-io/delta/blob/master/PROTOCOL.md
19. Apache Iceberg spec — https://iceberg.apache.org/spec/
20. HF Xet deduplication — https://huggingface.co/docs/hub/xet/deduplication
21. "From Files to Chunks" — https://huggingface.co/blog/from-files-to-chunks
22. Lance table format — https://lance.org/format/table/
23. Croissant 1.1 spec — https://docs.mlcommons.org/croissant/docs/croissant-spec-1.1.html
24. Croissant 1.1 announcement — https://mlcommons.org/2026/02/croissant-1-1-standard/
25. Croissant paper, NeurIPS 2024 — https://proceedings.neurips.cc/paper_files/paper/2024/file/9547b09b722f2948ff3ddb5d86002bc0-Paper-Datasets_and_Benchmarks_Track.pdf
26. RO-Crate 1.3 — https://www.researchobject.org/ro-crate/specification/1.3/
27. RO-Crate index — https://www.researchobject.org/ro-crate/specification
28. Datasheets for Datasets — https://arxiv.org/abs/1803.09010
29. Data Cards — https://arxiv.org/abs/2204.01075
30. W3C PROV-O — https://www.w3.org/TR/prov-o/
31. SPDX specifications — https://spdx.dev/use/specifications/
32. ISO/IEC PRF 5962 — https://www.iso.org/standard/93810.html
33. schema.org Dataset — https://schema.org/Dataset
34. Parquet docs — https://parquet.apache.org/docs/
35. parquet-format — https://github.com/apache/parquet-format
36. Arrow columnar/IPC — https://arrow.apache.org/docs/format/Columnar.html
37. WebDataset — https://github.com/webdataset/webdataset
38. MDS format — https://docs.mosaicml.com/projects/streaming/en/latest/preparing_datasets/dataset_format.html
39. TFRecord — https://www.tensorflow.org/tutorials/load_data/tfrecord
40. Protobuf is not canonical — https://protobuf.dev/programming-guides/serialization-not-canonical/
41. Alembic batch mode — https://alembic.sqlalchemy.org/en/latest/batch.html
42. W3C RDFC-1.0 — https://www.w3.org/TR/rdf-canon/
43. SLSA provenance v1 — https://slsa.dev/provenance/v1
44. in-toto attestation — https://github.com/in-toto/attestation
45. Sigstore Rekor — https://docs.sigstore.dev/logging/overview/
46. OpenTimestamps — https://opentimestamps.org/
47. `rfc8785` (Python) — https://pypi.org/project/rfc8785/
48. SQLite limits — https://www.sqlite.org/limits.html
49. SQLite appropriate uses — https://www.sqlite.org/whentouse.html
50. PostgreSQL `SELECT` / SKIP LOCKED — https://www.postgresql.org/docs/current/sql-select.html
51. pgloader SQLite — https://pgloader.readthedocs.io/en/latest/ref/sqlite.html
52. TUF spec — https://theupdateframework.github.io/specification/latest/
