#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="$HOME/web-polyhedron-viewer"
SRC_DIR="$HOME/blender_models"
DATA_DIR="$BASE_DIR/data"
CONVERTER="$BASE_DIR/converter/bpy_to_json.py"

# 変換対象リスト: "入力ファイル名|出力ID|表示タイトル"
MODELS=(
  "dodecahedron.py|dodecahedron|正十二面体（ワイヤーフレーム）"
  "dodecahedron_4color.py|dodecahedron_4color|正十二面体（4色塗り分け・回転）"
  "dodecahedron_assemble_old.py|dodecahedron_assemble|正十二面体（4色・組み立てアニメーション）"
  "icosahedron_assemble.py|icosahedron_assemble|正二十面体（4色・組み立てアニメーション）"
  "icosahedron_chofukita_old.py|icosahedron_chofukita|正二十面体（4色・組み立て・調布北高）"
)

for item in "${MODELS[@]}"; do
  IFS="|" read -r src_file model_id title <<< "$item"
  blender --background --python "$CONVERTER" -- "$SRC_DIR/$src_file" "$DATA_DIR/${model_id}.json" "$title"
done

# data/index.json を自動生成
python3 - << 'PYEOF'
import os, json, glob

data_dir = os.path.expanduser("~/web-polyhedron-viewer/data")
catalog = []

for path in sorted(glob.glob(os.path.join(data_dir, "*.json"))):
    if os.path.basename(path) == "index.json":
        continue
    with open(path, "r", encoding="utf-8") as f:
        obj = json.load(f)
    meta = obj.get("meta", {})
    catalog.append({
        "id": meta.get("id", os.path.splitext(os.path.basename(path))[0]),
        "title": meta.get("title", ""),
        "file": os.path.basename(path),
        "frame_end": meta.get("frame_end", 1)
    })

index_path = os.path.join(data_dir, "index.json")
with open(index_path, "w", encoding="utf-8") as f:
    json.dump({"models": catalog}, f, ensure_ascii=False, indent=2)

print(f"[OK] Generated {index_path} with {len(catalog)} models.")
PYEOF
