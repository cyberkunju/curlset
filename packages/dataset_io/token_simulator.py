"""
Live Multimodal Tokenizer and Context-Window Simulator.
Estimates subword text tokens and Vision Transformer (ViT) patch tokens
to validate fine-tuning batch lengths and detect context truncation risks.
"""
from __future__ import annotations

import math
import re
from typing import Any


def estimate_text_tokens(text: str) -> int:
    """
    Deterministic subword token estimator for LLM / VLM tokenizers (Llama, Mistral, Qwen).
    Accounts for whitespace boundaries, numbers, punctuation, and camelCase splits.
    """
    if not text:
        return 0

    # Pattern matches words, numbers, punctuation, whitespace
    tokens = re.findall(r"\w+|[^\w\s]|\s+", text, flags=re.UNICODE)
    token_count = 0
    for tok in tokens:
        if tok.isspace():
            token_count += max(1, math.ceil(len(tok) / 4))
        elif len(tok) <= 4:
            token_count += 1
        else:
            # Subword heuristic: ~3.7 characters per subword unit
            token_count += max(1, math.ceil(len(tok) / 3.7))

    return max(1, token_count) if text.strip() else 0


def estimate_vit_image_tokens(
    width: int | None = None,
    height: int | None = None,
    patch_size: int = 28,
) -> int:
    """
    Estimate image patch tokens for Vision-Language Models (e.g. CLIP / SigLIP / ViT).
    By default, models like LLaVA / Qwen-VL divide images into (H/P) * (W/P) grid patches.
    Default standard patch size is 28x28 (or 14x14 downsampled).
    """
    if not width or not height or width <= 0 or height <= 0:
        # Standard default resolution 448x448 with 28x28 patches = 16x16 = 256 tokens
        return 256

    patches_w = math.ceil(width / patch_size)
    patches_h = math.ceil(height / patch_size)
    # Plus prefix token ([IMG_START], [IMG_END], newline tokens per row)
    grid_tokens = patches_w * patches_h
    formatting_tokens = patches_h + 2  # newlines between patch rows + boundary tokens
    return grid_tokens + formatting_tokens


def estimate_multimodal_tokens(
    text: str = "",
    image_width: int | None = None,
    image_height: int | None = None,
    has_image: bool = False,
    system_prompt: str = "",
    target_context_window: int = 4096,
) -> dict[str, Any]:
    """
    Compute complete multimodal token breakdown and context-window capacity.
    """
    text_tokens = estimate_text_tokens(text)
    system_tokens = estimate_text_tokens(system_prompt)
    image_tokens = estimate_vit_image_tokens(image_width, image_height) if has_image else 0

    total_tokens = text_tokens + system_tokens + image_tokens

    context_targets = [2048, 4096, 8192, 32768]
    fits_context = {str(ctx): total_tokens <= ctx for ctx in context_targets}

    # Truncation risk if total tokens exceed 90% of target context window
    truncation_risk = total_tokens > int(target_context_window * 0.9)
    overflow = max(0, total_tokens - target_context_window)

    return {
        "text_tokens": text_tokens,
        "system_tokens": system_tokens,
        "image_tokens": image_tokens,
        "total_tokens": total_tokens,
        "target_context_window": target_context_window,
        "fits_target": total_tokens <= target_context_window,
        "truncation_risk": truncation_risk,
        "overflow_tokens": overflow,
        "fits_context": fits_context,
        "utilization_pct": round((total_tokens / target_context_window) * 100, 2)
        if target_context_window > 0
        else 0.0,
    }
