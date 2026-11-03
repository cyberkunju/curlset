"""Unit tests for evidence-source complementarity and submodular selection."""
from itertools import combinations

import pytest

from packages.dataset_ensemble.rescue import (
    agreement_mask,
    blind_spot_mask,
    greedy_source_selection,
    oracle_accuracy,
    profile_source,
    route_with_specialist,
)

TRUTH = ["a", "a", "a", "b", "b", "b", "c", "c", "c"]
# strong: 7/9 correct, but wrong on the last two of each class it misses
STRONG = ["a", "a", "a", "b", "b", "b", "x", "x", "x"]
# weak: right exactly where STRONG is wrong (rescue), wrong where STRONG is right
WEAK = ["x", "x", "x", "x", "x", "x", "c", "c", "c"]
# redundant: same errors as STRONG, but slightly weaker so greedy ordering is deterministic
REDUNDANT = ["a", "a", "a", "b", "b", "y", "y", "y", "y"]


def test_oracle_accuracy_counts_any_correct_vote() -> None:
    assert oracle_accuracy([STRONG], TRUTH) == 6 / 9
    assert oracle_accuracy([STRONG, WEAK], TRUTH) == 1.0
    assert oracle_accuracy([STRONG, REDUNDANT], TRUTH) == 6 / 9


def test_blind_spot_and_agreement_masks() -> None:
    assert blind_spot_mask([STRONG], TRUTH) == [False] * 6 + [True] * 3
    assert agreement_mask([STRONG], TRUTH) == [True] * 6 + [False] * 3


def test_rescue_rate_is_conditional_on_the_blind_spot() -> None:
    prof = profile_source("weak", WEAK, TRUTH, selected=[STRONG])
    assert prof.blind_spot_count == 3
    assert prof.rescue_rate == 1.0
    # WEAK abstains ("x") everywhere STRONG is right, so its flip rate is maximal:
    # rescue alone does not make a source useful, the cost side must be paid too.
    assert prof.flip_rate == 1.0
    assert prof.marginal_gain == pytest.approx(3 / 9)


def test_flip_rate_is_the_cost_side_of_the_same_arithmetic() -> None:
    noisy = ["x", "x", "x", "x", "x", "x", "c", "c", "x"]
    prof = profile_source("noisy", noisy, TRUTH, selected=[STRONG])
    assert prof.rescue_rate == pytest.approx(2 / 3)
    assert prof.flip_rate == 1.0
    assert prof.marginal_gain == pytest.approx(2 / 9)


def test_greedy_admits_complementary_sources_and_stops_when_redundant() -> None:
    chosen = greedy_source_selection(
        {"strong": STRONG, "weak": WEAK, "redundant": REDUNDANT}, TRUTH
    )
    assert [p.name for p in chosen] == ["strong", "weak"]
    assert chosen[1].marginal_gain == pytest.approx(3 / 9)


def test_greedy_satisfies_the_submodular_bound() -> None:
    """Brute-force the best subset of size k and check greedy >= (1 - 1/e) * optimum."""
    candidates = {"strong": STRONG, "weak": WEAK, "redundant": REDUNDANT}
    for k in (1, 2, 3):
        optimum = max(
            oracle_accuracy([candidates[n] for n in combo], TRUTH)
            for combo in combinations(candidates, k)
        )
        greedy_preds = [candidates[p.name] for p in
                        greedy_source_selection(candidates, TRUTH, max_sources=k)]
        assert oracle_accuracy(greedy_preds, TRUTH) >= (1 - 1 / 2.718281828) * optimum


def test_route_only_overrides_on_confident_disagreement() -> None:
    panel = ["a", "a", "b"]
    spec = ["c", "c", "c"]
    conf = [0.9, 0.4, 0.9]
    assert route_with_specialist(panel, spec, conf, threshold=0.6) == ["c", "a", "c"]


def test_length_mismatches_are_rejected() -> None:
    try:
        profile_source("bad", ["a"], TRUTH)
    except ValueError:
        return
    raise AssertionError("expected ValueError")
