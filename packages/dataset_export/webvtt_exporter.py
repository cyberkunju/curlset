"""
WebVTT subtitle and temporal transcript exporter.
Formats audio transcription annotations and speech segments into canonical WebVTT files.
"""
from typing import Any


def format_timestamp_vtt(seconds: float) -> str:
    """Convert float seconds to WebVTT timestamp format: HH:MM:SS.mmm."""
    if seconds < 0:
        seconds = 0.0
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = round((seconds - int(seconds)) * 1000)
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
        ann = rec.get("annotation") or {}
        payload = ann.get("payload") or {}
        full_text = payload.get("text", "").strip()
        segments = payload.get("segments", [])

        rec_lines: list[str] = [
            "WEBVTT",
            f"NOTE Record: {record_id} | Split: {rec.get('split', 'train')}",
            "",
        ]

        if segments and isinstance(segments, list):
            for idx, seg in enumerate(segments, 1):
                start = float(seg.get("start_time", 0.0))
                end = float(seg.get("end_time", start + 1.0))
                seg_text = seg.get("text", "").strip()
                speaker = seg.get("speaker")
                speaker_tag = f"<v {speaker}>" if speaker else ""

                cue_header = f"{format_timestamp_vtt(start)} --> {format_timestamp_vtt(end)}"
                cue_body = f"{speaker_tag}{seg_text}"

                rec_lines.extend([str(idx), cue_header, cue_body, ""])
                combined_lines.extend([f"{record_id}-{idx}", cue_header, cue_body, ""])
        else:
            # Single cue covering full text if segments are absent
            rec_lines.extend([
                "1",
                "00:00:00.000 --> 00:00:10.000",
                full_text or "[Empty Transcription]",
                "",
            ])
            combined_lines.extend([
                record_id,
                "00:00:00.000 --> 00:00:10.000",
                full_text or "[Empty Transcription]",
                "",
            ])

        output_files[f"subtitles/{record_id}.vtt"] = "\n".join(rec_lines).encode("utf-8")

    # Also add master combined.vtt
    output_files["subtitles/master_combined.vtt"] = "\n".join(combined_lines).encode("utf-8")
    return output_files
