"""Re-render animations from the delivered real frames and saved token sets."""
from pathlib import Path
import argparse
import json
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
COLORS = {"baseline": (233, 174, 103), "ours": (105, 217, 178)}


def font(size):
    try:
        return ImageFont.truetype("DejaVuSans.ttf", size)
    except OSError:
        return ImageFont.load_default()


def annotate(frame, method, budget):
    source = Image.open(ROOT / frame["image"]).convert("RGB")
    retained = set(frame["selection"][budget][method]["indices"])
    result = source.copy()
    draw = ImageDraw.Draw(result, "RGBA")
    for camera in frame["cameras"]:
        x, y, w, h = (camera[key] for key in ("x", "y", "width", "height"))
        draw.rectangle((x, y, x + w - 1, y + h - 1), fill=(8, 22, 17, 140))
        cell_w, cell_h = w / camera["cols"], h / camera["rows"]
        for row in range(camera["rows"]):
            for col in range(camera["cols"]):
                index = camera["indexOffset"] + row * camera["cols"] + col
                if index not in retained:
                    continue
                left, top = round(x + col * cell_w), round(y + row * cell_h)
                right, bottom = round(x + (col + 1) * cell_w), round(y + (row + 1) * cell_h)
                result.paste(source.crop((left, top, right, bottom)), (left, top))
                draw.rectangle((left, top, right - 1, bottom - 1), fill=(*COLORS[method], 48), outline=(*COLORS[method], 230), width=1)
    return result


def render(dataset, sequence, output, budget):
    output.mkdir(parents=True, exist_ok=True)
    sheets = []
    for index, frame in enumerate(sequence["frames"]):
        panel_w = 640
        panel_h = round(panel_w * frame["height"] / frame["width"])
        sheet = Image.new("RGB", (1280, panel_h + 88), "#f5f4ef")
        draw = ImageDraw.Draw(sheet)
        draw.text((18, 12), f"{dataset['label']}  /  {sequence['title']}  /  {index + 1:02d} of {len(sequence['frames'])}", fill="#1b332a", font=font(15))
        for position, method in enumerate(("baseline", "ours")):
            label = frame["selection"][budget][method]["label"]
            count = len(frame["selection"][budget][method]["indices"])
            draw.text((position * panel_w + 18, 42), f"{label}  ·  {count} retained tokens", fill=COLORS[method], font=font(16))
            panel = annotate(frame, method, budget).resize((panel_w, panel_h), Image.Resampling.LANCZOS)
            sheet.paste(panel, (position * panel_w, 75))
        sheets.append(sheet)
    sheets[0].save(output / "poster.webp", quality=90)
    sheets[0].save(output / "comparison.webp", save_all=True, append_images=sheets[1:], duration=450, loop=0, quality=72, method=4)
    gif_frames = [sheet.quantize(colors=128) for sheet in sheets]
    gif_frames[0].save(output / "comparison.gif", save_all=True, append_images=gif_frames[1:], duration=450, loop=0, disposal=2, optimize=True)
    with Image.open(output / "comparison.gif") as gif:
        if gif.n_frames != len(sheets):
            raise ValueError("Animation lost source frames")
    print(json.dumps({"dataset": dataset["id"], "collection": sequence["id"], "frames": len(sheets), "output": str(output)}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", choices=("drivelm", "drivelmm"))
    parser.add_argument("--sequence", choices=("collection-1", "collection-2"))
    parser.add_argument("--budget", default="10")
    parser.add_argument("--output", type=Path, required=True, help="A new export directory; existing bundled assets stay unchanged")
    args = parser.parse_args()
    data = json.loads((ROOT / "assets/data/demo.json").read_text())
    for dataset in data["datasets"]:
        if args.dataset and dataset["id"] != args.dataset:
            continue
        for sequence in dataset["sequences"]:
            if args.sequence and sequence["id"] != args.sequence:
                continue
            render(dataset, sequence, args.output / dataset["id"] / sequence["id"], args.budget)
