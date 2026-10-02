"""Normalize public metadata without changing any image or retained token set."""
from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
REPLACEMENTS = {
    "/home/defengzhou/semantic/token-pruning/": "",
    "/home/defengzhou/.cache/huggingface/": "local-model-cache/",
    "/home/defengzhou/semantic/.venvs/": "local-environments/",
    "/tmp/map2select-media/": "media-export/",
    "/tmp/map2select-audit/": "audit/",
    "/home/defengzhou/": "local-home/",
}


def sanitize(value):
    if isinstance(value, dict):
        return {key: sanitize(item) for key, item in value.items()}
    if isinstance(value, list):
        return [sanitize(item) for item in value]
    if isinstance(value, str):
        for prefix, replacement in REPLACEMENTS.items():
            value = value.replace(prefix, replacement)
    return value


def token_sets(data):
    return {
        (dataset["id"], sequence["id"], frame["id"], budget, method): tuple(record["indices"])
        for dataset in data["datasets"]
        for sequence in dataset["sequences"]
        for frame in sequence["frames"]
        for budget, selection in frame["selection"].items()
        for method, record in selection.items()
    }


if __name__ == "__main__":
    demo_file = ROOT / "assets/data/demo.json"
    initial_demo = json.loads(demo_file.read_text())
    original_selections = token_sets(initial_demo)
    changed = 0
    for file in (ROOT / "assets").rglob("*.json"):
        original = json.loads(file.read_text())
        data = sanitize(original)
        if file == demo_file:
            for dataset in data["datasets"]:
                dataset["model"] = "DriveMM · Llama-3.1-8B" if dataset["id"] == "drivelm" else "InternVL2.5-8B driving checkpoint"
            if token_sets(data) != original_selections:
                raise ValueError("Release metadata preparation changed retained token sets")
        if data != original:
            file.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n")
            changed += 1
    audit_file = ROOT / "assets/data/media-audit.json"
    audit = json.loads(audit_file.read_text())
    demo = json.loads(demo_file.read_text())
    for dataset in audit["datasets"]:
        actual_dataset = next(d for d in demo["datasets"] if d["id"] == dataset["id"])
        for clip in dataset["clips"]:
            actual_sequence = next(s for s in actual_dataset["sequences"] if s["id"] == clip["id"])
            for kind in ("gif", "animatedWebp", "poster", "download"):
                file = ROOT / actual_sequence["clips"][kind]
                content = file.read_bytes()
                clip[kind]["bytes"] = len(content)
                clip[kind]["sha256"] = hashlib.sha256(content).hexdigest()
    audit_file.write_text(json.dumps(audit, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(json.dumps({"metadata_files_updated": changed, "retained_sets_unchanged": len(original_selections), "clip_checksums_refreshed": True}))
