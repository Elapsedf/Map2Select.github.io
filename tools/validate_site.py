"""Validate real adjacent driving sequences, selections and publication boundaries."""
from pathlib import Path
import hashlib
import json
import re
import sys
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


def require(condition, message):
    if not condition:
        raise ValueError(message)


def asset(path):
    require(isinstance(path, str) and path.startswith("assets/"), f"Invalid asset path: {path!r}")
    target = (ROOT / path).resolve()
    require(target.is_relative_to(ROOT), f"Asset escapes the website: {path}")
    require(target.is_file(), f"Missing asset: {path}")
    return target


def validate():
    demo = json.loads((ROOT / "assets/data/demo.json").read_text())
    results = json.loads((ROOT / "assets/data/results.json").read_text())
    require(demo["version"] == 1, "Unsupported demo data version")
    require({d["id"] for d in demo["datasets"]} == {"drivelm", "drivelmm"}, "Both requested datasets must be present")
    require("Map2Select" in results["paper"]["title"], "Wrong manuscript brand")
    require("Map2Drive" not in results["paper"]["title"], "Later manuscript must not replace the frozen version")
    supported_scores = {
        "drivelm": {(False, "100%"): 59.166492, (False, "10%"): 57.087828, (True, "10%"): 58.272446, (False, "25%"): 58.158928, (True, "25%"): 58.833138},
        "drivelmm": {(False, "100%"): 74.369530, (False, "10%"): 72.587527, (True, "10%"): 73.018407, (False, "25%"): 73.155114, (True, "25%"): 73.303841},
    }
    for dataset in results["datasets"]:
        expected = supported_scores[dataset["id"]]
        found = {(bool(row.get("ours")), row["budget"]): row["value"] for row in dataset["rows"]}
        require(found == expected, f"Unsupported result table for {dataset['id']}")

    report = {"datasets": [], "total_frames": 0, "total_gifs": 0, "all_assets_exist": True}
    for dataset in demo["datasets"]:
        dataset_id = dataset["id"]
        require(len(dataset["sequences"]) == 2, f"{dataset_id}: exactly two collections are required")
        budgets = {b["id"]: b for b in dataset["budgets"]}
        require(budgets, f"{dataset_id}: missing budget descriptions")
        expected_grid = 4374 if dataset_id == "drivelm" else 256
        expected_retained = 426 if dataset_id == "drivelm" else 25
        dataset_report = {"id": dataset_id, "collections": []}
        dataset_images = set()
        for sequence in dataset["sequences"]:
            frames = sequence["frames"]
            require(len(frames) >= 30, f"{dataset_id}/{sequence['id']}: expected dozens of distinct frames")
            require(sequence.get("source") and sequence.get("caption"), "Collections need readable scope and source")
            temporal = sequence.get("temporal", {})
            require(temporal.get("strictConsecutive") is True, "Each animation must be a truly adjacent single-scene sequence")
            require(temporal.get("sceneToken") and temporal.get("sceneName"), "Sequences need a documented scene identity")
            require(temporal.get("sourceHz") == 2, "Sequences must use native 2 Hz nuScenes keyframes")
            timestamps = []
            samples = set()
            for index, frame in enumerate(frames):
                stamp = frame.get("temporal", {})
                require(stamp.get("sceneToken") == temporal["sceneToken"], "Animation changes scene")
                require(stamp.get("sampleToken") and stamp["sampleToken"] not in samples, "Animation repeats an input sample")
                samples.add(stamp["sampleToken"])
                require(isinstance(stamp.get("timestampUs"), int), "Frame timestamp must come from source microseconds")
                timestamps.append(stamp["timestampUs"])
                elapsed = (stamp["timestampUs"] - frames[0]["temporal"]["timestampUs"]) / 1000
                require(abs(stamp.get("elapsedMs", -1) - elapsed) < .01, "Displayed time differs from source timestamp")
                if index:
                    previous = frames[index - 1]["temporal"]
                    require(previous.get("nextSampleToken") == stamp["sampleToken"], "Skipped or unrelated keyframe in animation")
                    require(stamp.get("prevSampleToken") == previous["sampleToken"], "Source previous-frame link disagrees")
                    require(390000 < timestamps[-1] - timestamps[-2] < 650000, "Unexpected native keyframe gap")
            duration = (timestamps[-1] - timestamps[0]) / 1000
            require(abs(temporal.get("durationMs", -1) - duration) < .01, "Scene duration differs from original timestamps")
            differences = []
            for frame in frames:
                img_path = asset(frame["image"])
                require(frame["image"] not in dataset_images, f"Duplicate input image in {dataset_id}: {frame['image']}")
                dataset_images.add(frame["image"])
                with Image.open(img_path) as img:
                    require(img.size == (frame["width"], frame["height"]), f"Image dimensions do not match {frame['id']}")
                    img.verify()
                token_space = set()
                for camera in frame["cameras"]:
                    x, y, w, h = (camera[key] for key in ("x", "y", "width", "height"))
                    require(x >= 0 and y >= 0 and w > 0 and h > 0, "Invalid camera rectangle")
                    require(x + w <= frame["width"] and y + h <= frame["height"], f"Camera outside image in {frame['id']}")
                    size = camera["rows"] * camera["cols"]
                    local_space = set(range(camera["indexOffset"], camera["indexOffset"] + size))
                    require(not token_space.intersection(local_space), f"Overlapping token offsets in {frame['id']}")
                    token_space.update(local_space)
                require(token_space == set(range(expected_grid)), f"Wrong token grid in {frame['id']}")
                require(set(frame["selection"]) == set(budgets), f"Frame is missing a budget: {frame['id']}")
                for budget_id, selection in frame["selection"].items():
                    retained = {}
                    for method in ("baseline", "ours"):
                        record = selection[method]
                        indices = record["indices"]
                        require(record.get("method") and record.get("label"), "Methods need explicit identity")
                        require(all(isinstance(i, int) and not isinstance(i, bool) for i in indices), "Token IDs must be integers")
                        require(len(indices) == len(set(indices)), f"Duplicate token IDs in {frame['id']}")
                        require(set(indices) <= token_space, f"Token ID outside real visual input in {frame['id']}")
                        require(len(indices) == expected_retained, f"Wrong nominal-10% token count in {frame['id']}: {method}")
                        retained[method] = set(indices)
                    require(len(retained["ours"]) == len(retained["baseline"]), "Baseline and method must have the same total budget")
                    require(abs(budgets[budget_id]["ratio"] - expected_retained / expected_grid) < 1e-8, "Budget ratio is mislabeled")
                    differences.append(len(retained["ours"] - retained["baseline"]))
                provenance = frame.get("provenance")
                require(provenance, f"Missing source provenance for {frame['id']}")
            clips = sequence["clips"]
            require(clips.get("gif") and clips.get("poster"), f"Missing animation/poster for {sequence['id']}")
            gif_path = asset(clips["gif"])
            asset(clips["poster"])
            if clips.get("download"):
                download = json.loads(asset(clips["download"]).read_text())
                require(download.get("dataset") == dataset_id and download.get("sequence") == sequence["id"], "Selection download identifies the wrong sequence")
                require(download.get("frames") == frames, "Selection download differs from the displayed frames or retained IDs")
            with Image.open(gif_path) as gif:
                require(gif.format == "GIF" and gif.is_animated, "Gallery preview must be an actual animated GIF")
                require(gif.n_frames == len(frames), f"GIF does not cover all collection frames: {sequence['id']}")
                require(gif.info.get("loop") == 0, "GIF must support a repeated preview")
                duration_ms = sum(gif.seek(i) or gif.info.get("duration", 0) for i in range(gif.n_frames))
            collection_report = {
                "id": sequence["id"], "frames": len(frames), "gif_frames": len(frames),
                "scene": temporal["sceneName"], "source_duration_ms": duration,
                "all_source_next_prev_links_verified": True,
                "gif_duration_ms": duration_ms, "retained_per_method": expected_retained,
                "visual_input_tokens": expected_grid,
                "ours_only_min": min(differences), "ours_only_max": max(differences),
                "ours_only_mean": round(sum(differences) / len(differences), 2),
            }
            require(max(differences) > 0, "The collection does not show differing selections")
            dataset_report["collections"].append(collection_report)
            report["total_frames"] += len(frames)
            report["total_gifs"] += 1
        report["datasets"].append(dataset_report)
    forbidden_names = {"map2select_code_data.zip", "SOURCE_PROVENANCE.json"}
    for path in (ROOT / "assets").rglob("*"):
        require(path.name not in forbidden_names, f"Confidential review asset copied into public site: {path}")
    require((ROOT / "index.html").is_file(), "Missing website entry point")
    audit = json.loads((ROOT / "assets/data/media-audit.json").read_text())
    require(audit["status"] == "pass" and audit["all_original_indices_equal"], "Missing verified source-index audit")
    for dataset in audit["datasets"]:
        actual_dataset = next(d for d in demo["datasets"] if d["id"] == dataset["id"])
        for clip in dataset["clips"]:
            actual_sequence = next(s for s in actual_dataset["sequences"] if s["id"] == clip["id"])
            for kind in ("gif", "animatedWebp", "poster", "download"):
                content = asset(actual_sequence["clips"][kind]).read_bytes()
                require(len(content) == clip[kind]["bytes"], f"Published {kind} size differs from audit")
                require(hashlib.sha256(content).hexdigest() == clip[kind]["sha256"], f"Published {kind} checksum differs from audit")
    report["published_clip_checksums_verified"] = 16
    for required in ("assets/css/main.css", "assets/js/main.js", "assets/icons/mark.svg"):
        asset(required)
    return report


if __name__ == "__main__":
    try:
        report = validate()
    except (ValueError, KeyError, OSError, json.JSONDecodeError) as exc:
        print(f"Validation failed: {exc}", file=sys.stderr)
        sys.exit(1)
    print(json.dumps(report, indent=2))
