from packages.dataset_io.token_simulator import (
    estimate_multimodal_tokens,
    estimate_text_tokens,
    estimate_vit_image_tokens,
)


def test_estimate_text_tokens():
    assert estimate_text_tokens("") == 0
    assert estimate_text_tokens("   ") == 0

    short_tokens = estimate_text_tokens("Hello world")
    assert 2 <= short_tokens <= 6

    long_text = "The quick brown fox jumps over the lazy dog. " * 20
    long_tokens = estimate_text_tokens(long_text)
    assert 160 <= long_tokens <= 500


def test_estimate_vit_image_tokens():
    # Default 448x448 with 28x28 patches: 256 patches + 18 formatting tokens = 274
    default_tok = estimate_vit_image_tokens()
    assert default_tok == 256

    # 560x560 image with 28x28 patches: 20x20 = 400 patches + 22 formatting = 422
    custom_tok = estimate_vit_image_tokens(width=560, height=560, patch_size=28)
    assert custom_tok == 422


def test_estimate_multimodal_tokens():
    res = estimate_multimodal_tokens(
        text="A detailed caption describing this object in context.",
        image_width=448,
        image_height=448,
        has_image=True,
        target_context_window=2048,
    )
    assert res["fits_target"] is True
    assert res["truncation_risk"] is False
    assert res["image_tokens"] == 274
    assert res["total_tokens"] > 274
    assert res["fits_context"]["2048"] is True

    # Extreme text overflowing 2048 tokens
    huge_text = "Dense domain specific training observation sample token. " * 500
    overflow_res = estimate_multimodal_tokens(
        text=huge_text,
        has_image=False,
        target_context_window=2048,
    )
    assert overflow_res["fits_target"] is False
    assert overflow_res["truncation_risk"] is True
    assert overflow_res["overflow_tokens"] > 0
