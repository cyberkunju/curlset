"""
WebVTT subtitle and temporal transcript exporter.
Formats audio transcription annotations and speech segments into canonical WebVTT files.

Fixes the millisecond-rounding overflow that produced invalid 4-digit timestamps
(e.g. ``00:00:59.1000``) and never emits fabricated cue text for records that have no
transcription payload.
"""
from typing import Any


def format_timestamp_vtt(seconds: float) -> str:
    """Convert float seconds to WebVTT timestamp format: HH:MM:SS.mmm (no ms overflow)."""
    if seconds < 0:
        seconds = 0.0
    total_ms = round(float(seconds) * 1000)
    hours, remainder = divmod(total_ms, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    secs, millis = divmod(remainder, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}.{millis:03d}"


def export_to_webvtt_files(manifest_data: dict[str, Any]) -> dict[str, bytes]:
    """
    Export all audio transcription records in manifest to individual WebVTT subtitle files.
    Returns mapping from relative file path (e.g. 'subtitles/rec_123.vtt') to utf-8 encoded bytes.
    """
    records = manifest_data.get("records", [])
    output_files: dict[str, bytes] = {}

    combined_lines: list[str] = [
        "WEBVTT - AI Dataset Engineering Platform Audio Transcription Export",
        f"NOTE Dataset: {manifest_data.get('dataset_name')} (Version {manifest_data.get('version_tag')})",
        "",
    ]

    for rec in records:
        record_id = rec.get("record_id", "unknown")
        ann = rec.get("annotation")
        payload = ann.get("payload") if isinstance(ann, dict) else None
        if not isinstance(payload, dict):
            payload = {}
        full_text = payload.get("text")
        full_text = full_text.strip() if isinstance(full_text, str) else ""
        segments = payload.get("segments")

        rec_lines: list[str] = [
            "WEBVTT",
            f"NOTE Record: {record_id} | Split: {rec.get('split', 'train')}",
            "",
        ]

        if isinstance(segments, list) and segments:
            for idx, seg in enumerate(segments, 1):
                if not isinstance(seg, dict):
                    continue
                start = float(seg.get("start_time", 0.0))
                end = float(seg.get("end_time", start + 1.0))
                seg_text = seg.get("text", "")
                seg_text = seg_text.strip() if isinstance(seg_text, str) else ""
                speaker = seg.get("speaker")
                speaker_tag = f"<v {speaker}>" if speaker else ""

                cue_header = f"{format_timestamp_vtt(start)} --> {format_timestamp_vtt(end)}"
                cue_body = f"{speaker_tag}{seg_text}"

                rec_lines.extend([str(idx), cue_header, cue_body, ""])
                combined_lines.extend([f"{record_id}-{idx}", cue_header, cue_body, ""])
        elif full_text:
            # Single cue covering the full transcription when explicit segments are absent.
            cue_header = "00:00:00.000 --> 00:00:10.000"
            rec_lines.extend(["1", cue_header, full_text, ""])
            combined_lines.extend([record_id, cue_header, full_text, ""])
        # No transcription payload -> header/NOTE only; never fabricate cue text.

        output_files[f"subtitles/{record_id}.vtt"] = "\n".join(rec_lines).encode("utf-8")

    # Also add master combined.vtt
    output_files["subtitles/master_combined.vtt"] = "\n".join(combined_lines).encode("utf-8")
    return output_files
