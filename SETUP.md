# logi-sim — セットアップ手順

`farm-proto` から派生した物流シミュレーションプロジェクトです。
このファイルは **コピー直後の状態から動作させるまでの作業手順** を記したものです。
作業が完了したらこのファイルは削除して構いません。

---

## 0. 派生元との関係

このプロジェクトは `farm-proto`（コロニーシミュレーション）のソースを丸ごと流用しています。
コピーした時点ではまだ **農業 / 戦闘 / 栄養 / 遺伝 などの "farm" ロジック** が全部入っています。

物流シミュにするためには、

- **そのまま流用できる "エンジン" 層**を活かしつつ、
- **農業ドメイン固有のコード** を物流ドメインに置き換えていく

という方針になります。詳細は § 6 を参照。

---

## 1. 最低限の動作確認（コピー直後）

派生元と同じ構造なので、まずは **農業版のままビルド・起動** できる状態にします。
これが動けば「コピーは成功」と分かります。

```bash
cd "c:/Users/good/Desktop/ツール/scripts/logi-sim"

# 依存パッケージのインストール（node_modules はコピーしていないので必要）
npm install

# テスト実行（85 件パスすれば OK）
npm test

# ビルド
npm run build

# 開発サーバー起動（ブラウザで http://localhost:5173 を開く）
npm run dev
```

ここまでで **farm-proto と同じ画面** がブラウザに表示されれば、エンジンの土台は完全にコピーできています。

---

## 2. プロジェクト名 / 表示の差し替え

farm-proto 用のラベルを物流シミュ用に変更します。

### 2-1. `package.json`

```json
{
  "name": "logi-sim",
  "version": "0.1.0",
  "description": "Logistics simulation prototype"
}
```

### 2-2. `index.html`

`<title>` および `<h1>Farm Proto</h1>`、`data-i18n="app.tagline"` の説明文を物流シミュ用に書き換える。

```html
<title>Logi Sim</title>
...
<h1>Logi Sim <span class="version" data-i18n="app.version">alpha 1</span></h1>
<p class="tagline">
  <span data-i18n="app.tagline">物流ネットワークのプロトタイプ</span>
</p>
```

「プロトタイプを試す」リンク `#prototype-link` は farm-proto 用なので、不要であれば削除。

### 2-3. `src/config.js`

```js
// バージョン文字列はリセット推奨
export const ALPHA_VERSION = 'alpha 1';
```

`ALPHA_VERSION` は活動ログのエクスポートや UI ヘッダで参照されるので、`'alpha 37'` のままだと違和感があります。

### 2-4. `src/i18n.js`

`app.tagline` / `app.version` / `app.prototypeLink` を物流向けに書き換える。
ja / en 両方あるので両方修正。

---

## 3. farm-proto 固有のリソースを削除

物流シミュには不要なファイル群を削除して、新規実装の見通しを良くします。

### 削除候補（farm 固有ドメイン）

```
src/crops.js               作物定義
src/seafood.js             海産物定義
src/recipes.js             レシピ
src/genetics.js            遺伝子
src/combat.js              戦闘ヘルパ
src/world.js               植物配置
src/biomes.js              バイオーム
src/entities/animal.js     野生動物
src/entities/colonist.js   コロニスト（→ 物流版に置き換え）
src/systems/foodSystem.js  食料システム
src/systems/cropSystem.js  作物システム
src/systems/eventSystem.js イベントシステム（出産・トレーダーなど）
src/systems/combatSystem.js 戦闘システム
src/render/combatRender.js 戦闘エフェクト
src/autonomy.js            自律スクリプト（→ 物流版に置き換え）
src/groups.js              コロニーグループ（→ 物流業者に置き換え）
src/tips.js                農業ヒント
src/names/                 コロニスト名前
test/animal.test.js        動物テスト
test/colonist.test.js      コロニストテスト
test/crops.test.js         作物テスト
test/genetics.test.js      遺伝子テスト
test/world.test.js         世界テスト
test/tips.test.js          ヒントテスト
```

### 残すべき（エンジン層 — そのまま物流シミュに流用可能）

```
src/core/rng.js            乱数（決定論的シード）
src/core/pathfinder.js     A* 経路探索    ←★物流の経路計算に直接使える
src/map/                   タイルマップ・地形生成
src/render/renderer.js     描画コア（colonist / animal 関連を除いた）
src/render/camera.js       カメラ
src/season.js              時計 / 季節     ←★スケジュール基盤として
src/icons.js               インラインSVG アイコン集
src/style.css              UI スタイル
src/i18n.js                多言語化
src/main.js                エントリーポイント
test/mapGeneration.test.js マップ生成テスト
test/pathfinder.test.js    A* テスト
test/season.test.js        時計テスト
test/tasks.test.js         タスク基盤テスト
test/i18n.test.js          i18n テスト
```

### 段階的に削除する手順

いきなり全部消すと `import` が壊れて画面が真っ白になります。以下を順番に：

1. `index.html` から farm 固有 UI（作物ピッカー / 戦闘ツール / コロニーパネル等）を削除
2. `src/main.js` から farm 固有モジュールの `import` を削除
3. `src/game.js` を最小構成にリファクタ（タイルマップ + カメラ + 時計 だけ残す）
4. 上記「削除候補」のファイルを実際に削除
5. `npm test` で残ったテストだけが通ることを確認
6. `npm run dev` で画面が真っ白でないことを確認

---

## 4. .github / デプロイ周り

`.github/workflows/deploy.yml` は farm-proto の GitHub Pages 用デプロイ設定です。
新リポジトリで使うなら以下のいずれか：

- **同じく GitHub Pages を使う** → リポジトリ作成後そのまま使える（リポジトリ名次第で `vite.config.js` の `base` を調整）
- **使わない** → `.github/` を削除

### `vite.config.js` の base パス

farm-proto は `https://lifegamer1192.github.io/farm-proto/` で公開されているため `base: '/farm-proto/'` になっている可能性があります（要確認）。
新リポジトリで `https://<user>.github.io/logi-sim/` にするなら `base: '/logi-sim/'` に変更。

---

## 5. Git 初期化と新リポジトリ作成

```bash
cd "c:/Users/good/Desktop/ツール/scripts/logi-sim"
git init
git add -A
git commit -m "initial commit (derived from farm-proto)"

# 新規 GitHub リポジトリを作って push（gh が認証済みの想定）
gh repo create logi-sim --public --source=. --remote=origin --push
```

---

## 6. 物流シミュとして実装すべき項目（実装方針メモ）

### 6-1. ドメインモデルの置き換え案

| farm-proto の概念 | logi-sim での読み替え案 |
|---|---|
| Colonist（コロニスト） | Truck / Driver（トラック・配送員） |
| Group（コロニーグループ） | Logistics Company / Hub（業者・拠点） |
| Hut（住居） | Warehouse / Depot（倉庫・営業所） |
| Hearth（かまど） | Loading Dock（積込口） |
| Workshop（工房） | Cross-dock（クロスドック） |
| Stockpile（貯蔵所） | Storage Rack（保管棚） |
| Crop（作物） | Order / Package（配送オーダー） |
| Hunt（狩猟） | Pickup（集荷） |
| Cook（調理） | Pack / Sort（梱包・仕分け） |
| Hearth task | Delivery（配送タスク） |
| War / Combat（戦闘） | Competitor / Penalty（競合・遅延ペナルティ） |
| Season（季節） | Demand cycle（需要サイクル） |
| Birth（誕生） | Hire（雇用） |

### 6-2. すぐ使える既存資産

- **A\* パスファインダー** (`src/core/pathfinder.js`) → 道路網での経路探索にそのまま使える
- **タイルマップ** (`src/map/`) → 都市マップに転用（道路 / 倉庫タイル / 立入禁止タイル）
- **タスクキュー基盤** (`src/tasks.js`) → 配送オーダー管理に転用
- **自律スクリプト基盤** (`src/autonomy.js` の構造のみ) → 配送員の経路選択ロジック
- **複数グループ + 競合関係** (`src/groups.js`, `src/combat.js` の構造) → 競合する複数の物流業者
- **クロック / 季節** (`src/season.js`) → 朝のラッシュ / 深夜配送のサイクル
- **多言語化** (`src/i18n.js`) → ラベルだけ書き換え

### 6-3. 新規実装が必要な要素

- **道路ネットワーク** — 単純なタイル移動から、道路上のみ走行する制約へ
- **車両容量** — トラックごとの積載重量・体積
- **時間帯別需要** — 注文の発生レート
- **配送KPI** — 配達時間 / 燃料消費 / 顧客満足度
- **路線計画** — 巡回セールスマン的な配送順最適化

---

## 7. チェックリスト

コピー直後にこの順番でこなしていけば、最小限の動く物流シミュ雛形が完成します。

- [ ] `npm install` 成功
- [ ] `npm test` で farm-proto 由来のテスト 85 件パス
- [ ] `npm run dev` で farm-proto の画面が出る
- [ ] `package.json` の name / description 変更
- [ ] `index.html` のタイトル変更
- [ ] `src/config.js` の `ALPHA_VERSION` を `'alpha 1'` にリセット
- [ ] `src/i18n.js` の app 系ラベル変更
- [ ] `.github/workflows/deploy.yml` を新リポ用に調整 or 削除
- [ ] `vite.config.js` の `base` を新リポ名に変更
- [ ] `git init` + `gh repo create logi-sim`
- [ ] farm 固有モジュール削除（段階的に）
- [ ] 道路マップ実装
- [ ] 車両エンティティ実装
- [ ] 配送オーダー実装
- [ ] 最初の動作デモ
- [ ] このファイル（SETUP.md）を削除

---

## 8. 派生元の参考リンク

派生元 `farm-proto` のソースを参照したい場合：

- ローカル: `c:/Users/good/Desktop/ツール/scripts/farm-proto/`
- GitHub: `https://github.com/LifeGamer1192/farm-proto`
- ライブ版: `https://lifegamer1192.github.io/farm-proto/`

戦闘システムやスクリプト分離のリファクタは、α37 周辺のコミット履歴に詳しい解説があります。
