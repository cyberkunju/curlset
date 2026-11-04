# Scripts

Operational and experiment scripts. Run from the repository root with the project virtualenv.

| Path | Purpose |
|---|---|
| `seed_demo_dataset.py` | seed a demo project + datasets with no paid calls |
| `backup_restore.py` | verified backup/restore of SQLite + local storage with a SHA-256 manifest |
| `fixtures/generate_text_fixture.py` | regenerate the text classification fixtures |
| `fixtures/generate_hard_fixture.py` | regenerate the hard/templated research fixture |
| `experiments/ensemble_experiment.py` | offline ensemble/math experiment |
| `experiments/live_ensemble_run.py` | live panel run (requires configured provider + paid calls) |
| `experiments/live_weight_sweep.py` | live weight sweep (paid calls) |
| `experiments/analyze_live_agreement.py` | analyse live agreement records |
| `experiments/generation_experiment.py` | synthetic-generation experiment runner |
| `experiments/measure_provider_accuracy.py` | measure provider behaviour on a fixture (paid calls) |

Scripts under `experiments/` may call external providers and are never run by CI. See
[docs/OPERATIONS.md](../docs/OPERATIONS.md) for setup.
