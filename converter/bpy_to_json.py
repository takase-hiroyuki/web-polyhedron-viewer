import sys
import os
import json
import math
import bpy
from mathutils import Vector, Quaternion

def parse_args():
    if "--" not in sys.argv:
        raise ValueError("Usage: blender --background --python bpy_to_json.py -- <input.py> <output.json> [title]")
    args = sys.argv[sys.argv.index("--") + 1:]
    if len(args) < 2:
        raise ValueError("Input .py path and output .json path are required.")
    input_py = os.path.abspath(args[0])
    output_json = os.path.abspath(args[1])
    title = args[2] if len(args) >= 3 else os.path.splitext(os.path.basename(input_py))[0]
    return input_py, output_json, title

def round_list(vals, digits=6):
    return [round(float(v), digits) for v in vals]

def is_same_transform(loc1, rot1, loc2, rot2, eps=1e-5):
    for a, b in zip(loc1, loc2):
        if abs(a - b) > eps:
            return False
    # クォータニオンは q と -q が同じ回転を表すため内積で判定
    dot = abs(sum(a * b for a, b in zip(rot1, rot2)))
    return (1.0 - dot) < eps

def compress_keyframes(raw_frames):
    if len(raw_frames) <= 2:
        return raw_frames
    compressed = [raw_frames[0]]
    for i in range(1, len(raw_frames) - 1):
        prev_f = compressed[-1]
        curr_f = raw_frames[i]
        next_f = raw_frames[i + 1]
        # 前後と全く同じ姿勢（静止区間）なら間引く
        if (is_same_transform(prev_f["loc"], prev_f["rot"], curr_f["loc"], curr_f["rot"]) and
            is_same_transform(curr_f["loc"], curr_f["rot"], next_f["loc"], next_f["rot"])):
            continue
        compressed.append(curr_f)
    compressed.append(raw_frames[-1])
    return compressed

def get_material_rgba(mat):
    if mat is None:
        return [0.8, 0.8, 0.8, 1.0]
    if mat.use_nodes and mat.node_tree:
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        if bsdf and "Base Color" in bsdf.inputs:
            return round_list(bsdf.inputs["Base Color"].default_value, 4)
    return round_list(mat.diffuse_color, 4)

def get_obj_quat(obj):
    if obj.rotation_mode == 'QUATERNION':
        q = obj.rotation_quaternion
    else:
        q = obj.rotation_euler.to_quaternion()
    # [w, x, y, z] -> WebGL(Three.js)で扱いやすい [x, y, z, w] 順で保存
    return round_list([q.x, q.y, q.z, q.w], 6)

def main():
    input_py, output_json, title = parse_args()
    model_id = os.path.splitext(os.path.basename(output_json))[0]

    # バックグラウンド実行時に GUI 再生タイマーが誤動作しないよう無効化
    bpy.app.timers.register = lambda *args, **kwargs: None

    # 入力スクリプトを実行
    with open(input_py, "r", encoding="utf-8") as f:
        code = f.read()
    exec_globals = {"__name__": "__main__", "__file__": input_py}
    exec(compile(code, input_py, "exec"), exec_globals)

    scene = bpy.context.scene
    f_start = scene.frame_start
    f_end = scene.frame_end
    fps = scene.render.fps

    # マテリアル一覧を抽出
    mat_list = []
    mat_index_map = {}
    for idx, mat in enumerate(bpy.data.materials):
        mat_index_map[mat.name] = idx
        mat_list.append({
            "name": mat.name,
            "rgba": get_material_rgba(mat)
        })

    # オブジェクトの静的データを抽出
    target_objects = [obj for obj in bpy.data.objects if obj.type in ('MESH', 'FONT', 'EMPTY')]
    raw_tracks = {obj.name: [] for obj in target_objects}

    # 全フレームを走査して姿勢をサンプリング
    for f in range(f_start, f_end + 1):
        scene.frame_set(f)
        for obj in target_objects:
            raw_tracks[obj.name].append({
                "frame": f,
                "loc": round_list(obj.location, 6),
                "rot": get_obj_quat(obj)
            })

    objects_data = []
    for obj in target_objects:
        mat_idx = None
        if obj.data and hasattr(obj.data, "materials") and len(obj.data.materials) > 0 and obj.data.materials[0]:
            mat_idx = mat_index_map.get(obj.data.materials[0].name)

        entry = {
            "name": obj.name,
            "type": obj.type,
            "parent": obj.parent.name if obj.parent else None,
            "material_index": mat_idx,
            "keyframes": compress_keyframes(raw_tracks[obj.name])
        }

        if obj.type == 'MESH' and obj.data:
            mesh = obj.data
            entry["vertices"] = [round_list(v.co, 6) for v in mesh.vertices]
            entry["edges"] = [[int(e.vertices[0]), int(e.vertices[1])] for e in mesh.edges]
            entry["faces"] = [[int(v) for v in p.vertices] for p in mesh.polygons]

        elif obj.type == 'FONT' and obj.data:
            curve = obj.data
            entry["text"] = curve.body
            entry["size"] = round(float(curve.size), 4)
            entry["extrude"] = round(float(curve.extrude), 4)
            entry["rgba"] = mat_list[mat_idx]["rgba"] if mat_idx is not None else [0.02, 0.02, 0.02, 1.0]

        objects_data.append(entry)

    result = {
        "meta": {
            "id": model_id,
            "title": title,
            "source_file": os.path.basename(input_py),
            "frame_start": f_start,
            "frame_end": f_end,
            "fps": fps
        },
        "materials": mat_list,
        "objects": objects_data
    }

    os.makedirs(os.path.dirname(output_json), exist_ok=True)
    with open(output_json, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, separators=(",", ":"))

    size_kb = os.path.getsize(output_json) / 1024.0
    print(f"[OK] Converted '{os.path.basename(input_py)}' -> '{output_json}' ({size_kb:.1f} KB)")

if __name__ == "__main__":
    main()
