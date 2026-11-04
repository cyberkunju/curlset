"""Tests for the dataset-local specialist: grouping, cross-fitting, curves and rescue accounting."""
import json

import pytest

np = pytest.importorskip("numpy", reason="specialist extra not installed")
pytest.importorskip("sklearn", reason="specialist extra not installed")

from packages.dataset_ensemble.specialist import (
    SpecialistDataError,
    cluster_bootstrap_ci,
    cross_fit,
    evaluate_specialist,
    grouped_folds,
    risk_coverage_curve,
)


def one_hot_group_data(n_groups: int, per_group: int = 3):
    """Vectors identical inside a group, orthogonal between groups; label constant per group."""
    vectors, labels, groups = [], [], []
    for g in range(n_groups):
        vec = [0.0] * n_groups
        vec[g] = 1.0
        for _ in range(per_group):
            vectors.append(list(vec))
            labels.append("a" if g % 2 == 0 else "b")
            groups.append(f"g{g}")
    return vectors, labels, groups


def test_groups_never_straddle_folds() -> None:
    _vectors, labels, groups = one_hot_group_data(8)
    folds = grouped_folds(groups, n_folds=4)
    seen: set[str] = set()
    for train, test in folds:
        test_groups = {groups[i] for i in test}
        train_groups = {groups[i] for i in train}
        assert test_groups.isdisjoint(train_groups), "group leaked between folds"
        assert not (test_groups & seen), "group appeared in two test folds"
        seen |= test_groups
    assert all(sorted(train + test) == list(range(len(labels))) for train, test in folds)


def test_every_row_gets_exactly_one_out_of_fold_prediction() -> None:
    vectors, labels, groups = one_hot_group_data(8)
    pred, proba = cross_fit(vectors, labels, groups, n_folds=4)
    assert len(pred) == len(labels)
    assert all(p in {"a", "b"} for p in pred)
    for i, p in enumerate(proba):
        assert set(p) <= {"a", "b"}
        assert sum(p.values()) == pytest.approx(1.0, abs=1e-6)


def test_grouped_cross_fitting_refuses_to_score_leaked_duplicates() -> None:
    """Same data, two split styles: row-level CV looks perfect, grouped CV does not."""
    vectors, labels, groups = one_hot_group_data(8, per_group=4)
    X = np.asarray(vectors)
    y = np.asarray(labels)

    grouped_pred, _ = cross_fit(vectors, labels, groups, n_folds=4)
    grouped_acc = float(np.mean(np.array(grouped_pred) == y))

    from sklearn.linear_model import LogisticRegression

    rng = np.random.default_rng(0)
    order = rng.permutation(len(y))
    cut = len(y) // 2
    tr, te = order[:cut], order[cut:]
    leaky = LogisticRegression(max_iter=4000).fit(X[tr], y[tr]).predict(X[te])
    leaky_acc = float(np.mean(leaky == y[te]))

    assert leaky_acc > 0.95, "row-level split should look near-perfect on duplicated vectors"
    assert grouped_acc < leaky_acc - 0.3, "grouped CV must not inherit the leak"


def test_fold_count_larger_than_group_count_is_rejected() -> None:
    with pytest.raises(SpecialistDataError):
        grouped_folds(["a", "a", "b", "b"], n_folds=5)


def test_risk_coverage_curve_uses_the_fitted_confidence() -> None:
    labels = ["a", "a", "a", "b", "b", "b"]
    preds = ["a", "a", "x", "b", "b", "x"]
    proba = [
        {"a": 0.99}, {"a": 0.95}, {"a": 0.60},
        {"b": 0.90}, {"b": 0.70}, {"b": 0.55},
    ]
    curve = risk_coverage_curve(labels, preds, proba, steps=6)
    assert curve, "curve should not be empty"
    coverages = [p.coverage for p in curve]
    thresholds = [p.threshold for p in curve]
    assert thresholds == sorted(thresholds, reverse=True), "thresholds are swept high to low"
    assert coverages == sorted(coverages), "coverage must rise as the threshold falls"
    strictest = curve[0]
    assert strictest.accepted == 3 and strictest.errors == 0
    loosest = curve[-1]
    assert loosest.accepted == 6 and loosest.errors == 2


def test_cluster_bootstrap_interval_brackets_the_estimate() -> None:
    labels, preds = [], []
    groups = []
    for g in range(10):
        for _ in range(3):
            labels.append("a")
            preds.append("a" if g % 2 == 0 else "b")
            groups.append(f"g{g}")
    acc = float(np.mean(np.array(preds) == np.array(labels)))
    low, high = cluster_bootstrap_ci(labels, preds, groups, reps=400)
    assert low <= acc <= high
    # rows within a cluster agree perfectly, so the interval must be wider than a row-level binomial
    assert high - low > 0.05


def separable_data():
    """Label direction is shared across groups; group identity is an extra nuisance block.

    6 groups x 5 rows = 30 rows. Groups 0/2/4 are class a, 1/3/5 are class b. A grouped-CV probe can
    still generalise because the label-bearing dimensions transfer between groups.
    """
    vectors, labels, groups = [], [], []
    for g in range(6):
        base = [1.0, 1.0, 0.0, 0.0] if g % 2 == 0 else [0.0, 0.0, 1.0, 1.0]
        for k in range(5):
            onehot = [1.0 if j == g else 0.0 for j in range(6)]
            vectors.append([*base, *onehot, 0.05 * k])
            labels.append("a" if g % 2 == 0 else "b")
            groups.append(f"g{g}")
    return vectors, labels, groups


def test_evaluate_specialist_reports_rescue_against_a_blind_panel() -> None:
    vectors, labels, groups = separable_data()
    # The panel is right everywhere except two whole groups, which is the synthetic "blind spot".
    panel = [
        "wrong" if groups[i] in {"g1", "g4"} else labels[i] for i in range(len(labels))
    ]
    report = evaluate_specialist(vectors, labels, groups, panel_predictions=panel, n_folds=3)

    assert report.panel_accuracy == pytest.approx(4 / 6)
    assert report.blind_spot_count == 10
    assert report.accuracy >= 0.7, "grouped probe should generalise on shared dimensions"
    assert report.rescue_rate >= 0.6, "probe is expected to rescue most of the panel blind spot"
    assert report.oracle_with_panel >= max(report.accuracy, report.panel_accuracy)
    assert json.dumps(report.as_dict())  # must be API-serialisable
    assert report.marginal_gain >= 0.0


def test_too_few_rows_raises_rather_than_reporting_noise() -> None:
    vectors = [[float(i), 0.0] for i in range(10)]
    labels = ["a", "b"] * 5
    groups = [f"g{i}" for i in range(10)]
    with pytest.raises(SpecialistDataError):
        evaluate_specialist(vectors, labels, groups)


def test_panel_length_mismatch_is_caught() -> None:
    vectors, labels, groups = separable_data()
    with pytest.raises(ValueError):
        evaluate_specialist(vectors, labels, groups, panel_predictions=["a"])
