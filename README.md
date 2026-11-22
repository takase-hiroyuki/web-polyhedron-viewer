# web-polyhedron-viewer

Blender用Pythonスクリプト（`.py`）から抽出した3D多面体・幾何学アニメーションを、Webブラウザ（Three.js / WebGL）上で360度閲覧・URL共有できるシステムです。

## 公開ビューア（共有URL一覧）

ブラウザで以下のURLを開くことで、スマートフォンやPCから直接3Dモデルとアニメーションを操作・閲覧できます。

* **トップビューア（モデル選択メニュー付き）**  
  [https://takase-hiroyuki.github.io/web-polyhedron-viewer/](https://takase-hiroyuki.github.io/web-polyhedron-viewer/)
* **正二十面体（4色・組み立て・調布北高）**  
  [https://takase-hiroyuki.github.io/web-polyhedron-viewer/?model=icosahedron_chofukita](https://takase-hiroyuki.github.io/web-polyhedron-viewer/?model=icosahedron_chofukita)
* **正二十面体（4色・組み立てアニメーション）**  
  [https://takase-hiroyuki.github.io/web-polyhedron-viewer/?model=icosahedron_assemble](https://takase-hiroyuki.github.io/web-polyhedron-viewer/?model=icosahedron_assemble)
* **正十二面体（4色・組み立てアニメーション）**  
  [https://takase-hiroyuki.github.io/web-polyhedron-viewer/?model=dodecahedron_assemble](https://takase-hiroyuki.github.io/web-polyhedron-viewer/?model=dodecahedron_assemble)
* **正十二面体（4色塗り分け・回転）**  
  [https://takase-hiroyuki.github.io/web-polyhedron-viewer/?model=dodecahedron_4color](https://takase-hiroyuki.github.io/web-polyhedron-viewer/?model=dodecahedron_4color)
* **正十二面体（ワイヤーフレーム）**  
  [https://takase-hiroyuki.github.io/web-polyhedron-viewer/?model=dodecahedron](https://takase-hiroyuki.github.io/web-polyhedron-viewer/?model=dodecahedron)

## ディレクトリ構成

- `converter/bpy_to_json.py` : ヘッドレスBlenderからJSONへ変換・圧縮するスクリプト
- `converter/batch_convert.sh` : 複数モデルの一括変換および `data/index.json` 自動生成スクリプト
- `data/index.json` : ビューアが読み込むモデルカタログ一覧
- `data/*.json` : 変換済みの各3Dモデルデータ（頂点・面・色・文字・圧縮キーフレーム）
- `docs/index.html` : GitHub Pages 公開用 Webビューア（HTML/CSS）
- `docs/viewer.js` : Three.js 描画・lerp/slerp補間・UI制御スクリプト
- `requirements_spec.json` : システム要件・技術仕様・設計履歴の記録ファイル
- `README.md` : 本ドキュメント

## 新しい図形データの変換・アップロード手順

手元の環境（Fedora等）で作成した新しい Blender 用 Python スクリプトを Web 上に公開する手順は以下の通りです。

### 1. Blender スクリプトを JSON に変換する

    blender --background --python ~/web-polyhedron-viewer/converter/bpy_to_json.py -- \
      ~/blender_models/<入力スクリプト.py> \
      ~/web-polyhedron-viewer/data/<モデルID>.json \
      "<画面に表示するタイトル>"

### 2. モデル一覧カタログ（`data/index.json`）を更新する

    ~/web-polyhedron-viewer/converter/batch_convert.sh

### 3. GitHub へアップロード（プッシュ）する

    cd ~/web-polyhedron-viewer
    git add data/
    git commit -m "feat: add new polyhedron model"
    git push
