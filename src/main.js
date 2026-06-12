import './style.css';
import { GRID_COLS, GRID_ROWS, SCROLL_STEP, DRAG_THRESHOLD } from './config.js';
import { hashSeed, randomSeed } from './core/rng.js';
import { t, setLang, getLang } from './i18n.js';
import { Game } from './game.js';
import { screenToWorld, elevationLift, ISO_ELEV_RATIO } from './render/camera.js';
import { TileType } from './map/tile.js';
import { teamLetter, SCRIPT_IDS } from './teams.js';
import { sellPrice, buyPrice } from './trade.js';
import { TRADE_GOODS } from './config.js';
import { ALL_GOODS_IDS, BUILDING_KINDS } from './buildings.js';

// Panel tooltip content (goods & buildings). Each entry: { en, ja }
const PANEL_TIPS = {
  good: {
    wood:        { en: 'Wood\nHarvest: Logging camp (forest)\nUse: Planks, charcoal, buildings',          ja: '木材\n採取: 伐採場（近くの森林から）\n用途: 板材・木炭の原料、建物建設' },
    stone:       { en: 'Stone\nHarvest: Stone cutter (stone hill)\nUse: Bricks, glass, buildings',         ja: '石\n採取: 石切り場（近くの石山から）\n用途: レンガ・ガラスの原料、建物建設' },
    plank:       { en: 'Plank\nMake: Sawmill  wood×2 → 1\nUse: Tools, buildings',                          ja: '板材\n製造: 製材所  wood×2 → 1\n用途: 道具・建物' },
    brick:       { en: 'Brick\nMake: Kiln  clay×2 → 1\nUse: Buildings',                                    ja: 'レンガ\n製造: 窯  clay×2 → 1\n用途: 建物建設' },
    clay:        { en: 'Clay\nSource: Clay mine (clay pit)\nUse: Bricks',                                   ja: '粘土\n採掘: 粘土鉱山（粘土層から）\n用途: レンガの原料' },
    sand:        { en: 'Sand\nSource: Sand mine (sand bar)\nUse: Glass',                                    ja: '砂\n採掘: 砂鉱山（砂地から）\n用途: ガラスの原料' },
    coal:        { en: 'Coal\nSource: Coal mine (coal vein)\nUse: Smelter fuel',                            ja: '石炭\n採掘: 石炭鉱山（石炭層から）\n用途: 精錬所の燃料' },
    charcoal:    { en: 'Charcoal\nMake: Charcoal kiln  wood×3 → 1\nUse: Smelter fuel',                     ja: '木炭\n製造: 炭焼き窯  wood×3 → 1\n用途: 精錬所の燃料' },
    iron:        { en: 'Iron\nMake: Smelter  ironOre+charcoal → 1\nUse: Tools',                             ja: '鉄\n製造: 精錬所  ironOre+charcoal → 1\n用途: 道具の原料' },
    copper:      { en: 'Copper\nMake: Smelter  copperOre+charcoal → 1\nUse: Bronze',                        ja: '銅\n製造: 精錬所  copperOre+charcoal → 1\n用途: 青銅の原料' },
    tin:         { en: 'Tin\nMake: Smelter  tinOre+charcoal → 1\nUse: Bronze',                              ja: '錫\n製造: 精錬所  tinOre+charcoal → 1\n用途: 青銅の原料' },
    bronze:      { en: 'Bronze\nMake: Alloy forge  copper×1+tin×1 → 1\nUse: Gears',                        ja: '青銅\n製造: 合金炉  copper×1+tin×1 → 1\n用途: 歯車の原料' },
    ironOre:     { en: 'Iron Ore\nSource: Iron mine\nUse: → Iron (Smelter)',                                ja: '鉄鉱石\n採掘: 鉄鉱山\n用途: 鉄の原料（精錬所）' },
    copperOre:   { en: 'Copper Ore\nSource: Copper mine\nUse: → Copper (Smelter)',                          ja: '銅鉱石\n採掘: 銅鉱山\n用途: 銅の原料（精錬所）' },
    tinOre:      { en: 'Tin Ore\nSource: Tin mine\nUse: → Tin (Smelter)',                                   ja: '錫鉱石\n採掘: 錫鉱山\n用途: 錫の原料（精錬所）' },
    rope:        { en: 'Rope\nMake: Rope maker  grain×2 → 1\nUse: Construction, trade',                     ja: 'ロープ\n製造: ロープ工場  grain×2 → 1\n用途: 建設・交易' },
    cloth:       { en: 'Cloth\nMake: Weavery  grain×3 → 1\nUse: Trade',                                    ja: '布\n製造: 機織り場  grain×3 → 1\n用途: 交易' },
    cottonCloth: { en: 'Cotton Cloth\nMake: Weavery  thread×2 → 1\nUse: Canvas',                            ja: '綿布\n製造: 機織り場  thread×2 → 1\n用途: キャンバスの原料' },
    canvas:      { en: 'Canvas\nMake: Weavery  cottonCloth×2 → 1\nUse: High-value trade',                  ja: 'キャンバス\n製造: 機織り場  cottonCloth×2 → 1\n用途: 高価値交易品' },
    thread:      { en: 'Thread\nMake: Spinning mill  cotton×1 → 1\nUse: Cotton cloth',                     ja: '糸\n製造: 紡績工場  cotton×1 → 1\n用途: 綿布の原料' },
    cotton:      { en: 'Cotton\nSource: Ranch (pasture)\nUse: → Thread (Spinning mill)',                   ja: '綿花\n採取: 牧場（牧草地から）\n用途: 糸の原料（紡績工場）' },
    grain:       { en: 'Grain\nSource: Farm (crop field)\nUse: Rope, flour, cloth',                         ja: '穀物\n栽培: 農場（農地から）\n用途: ロープ・小麦粉・布の原料' },
    wheat:       { en: 'Wheat\nSource: Farm\nUse: → Flour (Windmill)',                                      ja: '小麦\n栽培: 農場\n用途: 小麦粉の原料（風車）' },
    flour:       { en: 'Flour\nMake: Windmill  grain×2 → 1\nUse: Food, trade',                             ja: '小麦粉\n製造: 風車  grain×2 → 1\n用途: 食料・交易' },
    potato:      { en: 'Potato\nSource: Farm\nUse: Food, trade',                                            ja: 'ジャガイモ\n栽培: 農場\n用途: 食料・交易' },
    turnip:      { en: 'Turnip\nSource: Farm\nUse: Food, trade',                                            ja: 'カブ\n栽培: 農場\n用途: 食料・交易' },
    rice:        { en: 'Rice\nSource: Farm (paddy field)\nUse: Food, trade',                                ja: '米\n栽培: 農場（水田）\n用途: 食料・交易' },
    leather:     { en: 'Leather\nSource: Ranch (pasture)\nUse: Trade',                                      ja: '皮革\n採取: 牧場（牧草地から）\n用途: 交易' },
    glass:       { en: 'Glass\nMake: Kiln  sand×3 → 1\nUse: Trade',                                        ja: 'ガラス\n製造: 窯  sand×3 → 1\n用途: 交易' },
    tool:        { en: 'Tool\nMake: Smithy  iron×2+plank×1 → 1\nUse: Gears, trade',                        ja: '道具\n製造: 鍛冶屋  iron×2+plank×1 → 1\n用途: 歯車の原料・交易' },
    gear:        { en: 'Gear\nMake: Precision workshop  bronze×2+tool×1 → 1\nUse: High-value trade',        ja: '歯車\n製造: 精密工房  bronze×2+tool×1 → 1\n用途: 高価値交易品' },
    currency:    { en: 'Currency (¥)\nEarned from selling goods at trade posts\nSpent on buying goods',     ja: '通貨（¥）\n交易所での売却で獲得\n物品購入に使用' },
    wheelbarrow: { en: 'Wheelbarrow\nAuto-attached to cart workers\nNo manual action',                      ja: '手押し車\n荷台ワーカーに自動付与\n手動操作不要' },
  },
  build: {
    warehouse:          { en: 'Warehouse\nStores all goods (capacity limited)\nDelivery hub — haul workers bring goods here',                     ja: '倉庫\n全アイテムを保管（容量制限あり）\n配送の起点・終点として機能' },
    loggingCamp:        { en: 'Logging Camp\nHarvests wood from nearby forests\nOutput: wood',                                                      ja: '伐採場\n近くの森林から木材を採取\n産出: wood' },
    stoneCutter:        { en: 'Stone Cutter\nQuarries stone from stone hills\nOutput: stone',                                                       ja: '石切り場\n近くの石山から石を採取\n産出: stone' },
    clayMine:           { en: 'Clay Mine\nExtracts clay from clay pits\nOutput: clay',                                                              ja: '粘土鉱山\n粘土層から粘土を採掘\n産出: clay' },
    sandMine:           { en: 'Sand Mine\nDigs sand from sand bars\nOutput: sand',                                                                  ja: '砂鉱山\n砂地から砂を採掘\n産出: sand' },
    coalMine:           { en: 'Coal Mine\nMines coal from coal veins\nOutput: coal',                                                                ja: '石炭鉱山\n石炭層から石炭を採掘\n産出: coal' },
    farm:               { en: 'Farm\nCultivates crops from adjacent fields\nOutput: grain / wheat / potato / turnip / rice',                        ja: '農場\n農地から作物を栽培・収穫\n産出: grain / wheat / potato / turnip / rice' },
    ironMine:           { en: 'Iron Mine\nMines iron ore\nOutput: ironOre',                                                                         ja: '鉄鉱山\n鉄鉱脈から鉄鉱石を採掘\n産出: ironOre' },
    copperMine:         { en: 'Copper Mine\nMines copper ore\nOutput: copperOre',                                                                   ja: '銅鉱山\n銅鉱脈から銅鉱石を採掘\n産出: copperOre' },
    tinMine:            { en: 'Tin Mine\nMines tin ore\nOutput: tinOre',                                                                            ja: '錫鉱山\n錫鉱脈から錫鉱石を採掘\n産出: tinOre' },
    ranch:              { en: 'Ranch\nRaises livestock on pastures\nOutput: leather, cotton',                                                       ja: '牧場\n牧草地で家畜を育てる\n産出: leather, cotton' },
    sawmill:            { en: 'Sawmill\nwood×2 → plank×1\nProcesses timber into planks',                                                           ja: '製材所\nwood×2 → plank×1\n材木を板材に加工' },
    charcoalKiln:       { en: 'Charcoal Kiln\nwood×3 → charcoal×1\nProduces smelter fuel',                                                         ja: '炭焼き窯\nwood×3 → charcoal×1\n精錬所の燃料を生産' },
    kiln:               { en: 'Kiln\nclay×2 → brick×1\nsand×3 → glass×1',                                                                          ja: '窯\nclay×2 → brick×1\nsand×3 → glass×1' },
    smelter:            { en: 'Smelter\nironOre+charcoal → iron\ncopperOre+charcoal → copper\ntinOre+charcoal → tin',                               ja: '精錬所\nironOre+charcoal → iron\ncopperOre+charcoal → copper\ntinOre+charcoal → tin' },
    alloyForge:         { en: 'Alloy Forge\ncopper×1 + tin×1 → bronze×1\nRequires both metals',                                                    ja: '合金炉\ncopper×1 + tin×1 → bronze×1\n両金属が必要' },
    ropeMaker:          { en: 'Rope Maker\ngrain×2 → rope×1',                                                                                       ja: 'ロープ工場\ngrain×2 → rope×1' },
    windmill:           { en: 'Windmill\ngrain×2 → flour×1',                                                                                        ja: '風車\ngrain×2 → flour×1' },
    weavery:            { en: 'Weavery\ngrain×3 → cloth×1\nthread×2 → cottonCloth×1\ncottonCloth×2 → canvas×1',                                    ja: '機織り場\ngrain×3 → cloth×1\nthread×2 → cottonCloth×1\ncottonCloth×2 → canvas×1' },
    smithy:             { en: 'Smithy\niron×2 + plank×1 → tool×1',                                                                                 ja: '鍛冶屋\niron×2 + plank×1 → tool×1' },
    precisionWorkshop:  { en: 'Precision Workshop\nbronze×2 + tool×1 → gear×1',                                                                     ja: '精密工房\nbronze×2 + tool×1 → gear×1' },
    spinningMill:       { en: 'Spinning Mill\ncotton×1 → thread×1',                                                                                 ja: '紡績工場\ncotton×1 → thread×1' },
  },
};

const canvas = document.getElementById('map');
const game = new Game(canvas);
window.game = game; // debugging / headless checks

const $ = (id) => document.getElementById(id);
const tooltip = $('tooltip');
const mapStatsEl = $('map-stats');
const envStatsEl = $('env-stats');
const teamSummaryEl = $('team-summary');
const legendEl = $('legend');
const viewModesEl = $('view-modes');
const speedsEl = $('speeds');
const zoomsEl = $('zooms');
const langsEl = $('langs');
const pauseBtn = $('pause-btn');
const pausedBadge = $('paused-badge');
const buildToolsEl = $('build-tools');
const teamSelectEl = $('team-select');
const buildHintEl = $('build-hint');
const teamsPanelEl = $('teams-panel');
const tradePanelEl = $('trade-panel');
const tradeTeamLabel = $('trade-team-label');
const globalPanelEl = $('global-panel');
const graphModal = $('graph-modal');
const graphCanvas = $('graph-canvas');
const graphTitleEl = $('graph-modal-title');

let started = false;   // becomes true after the first Generate
let buildTool = null;  // null = inspect; else 'warehouse'|'loggingCamp'|'stoneCutter'
let activeTeam = 0;    // team the build tool places for

const expandedTeams = new Set(); // team IDs with details expanded

// --- panels ---------------------------------------------------------------

const LEGENDS = {
  terrain: [
    ['#5c98c8', 'legend.water'],
    ['#c4b884', 'legend.poorSoil'],
    ['#468237', 'legend.richSoil'],
  ],
  fertility: [
    ['#3c3228', 'legend.low'],
    ['#78e66e', 'legend.high'],
    ['#2d343f', 'legend.waterNA'],
  ],
  moisture: [
    ['#c8aa78', 'legend.dry'],
    ['#286ec8', 'legend.wet'],
  ],
  sunlight: [
    ['#191e2d', 'legend.shade'],
    ['#ffe178', 'legend.bright'],
  ],
};

function renderRows(el, rows) {
  if (!el) return;
  el.innerHTML = rows
    .map(([dt, dd]) => `<div><dt>${dt}</dt><dd>${dd}</dd></div>`)
    .join('');
}

function updateLegend() {
  if (!legendEl) return;
  legendEl.innerHTML = (LEGENDS[game.viewMode] || [])
    .map(([color, key]) => `<span class="swatch"><i style="background:${color}"></i>${t(key)}</span>`)
    .join('');
}

function updateMapStats() {
  if (!mapStatsEl || !game.stats) return;
  const s = game.stats;
  const pct = (v) => `${(v * 100).toFixed(1)}%`;
  const num = (v) => v.toFixed(3);
  renderRows(mapStatsEl, [
    [t('stat.seed'), game.seed],
    [t('stat.size'), `${GRID_COLS}×${GRID_ROWS}`],
    [t('stat.water'), `${s.water} (${pct(s.waterFraction)})`],
    [t('stat.land'), s.land],
    [t('stat.avgFertility'), num(s.avgFertility)],
    [t('stat.camera'), `(${Math.round(game.camera.x)}, ${Math.round(game.camera.y)})`],
  ]);
}

function updateEnvPanel() {
  if (!envStatsEl || !game.environment) return;
  const e = game.environment;
  const fpsTxt = game.fps == null ? '—' : Math.round(game.fps);
  renderRows(envStatsEl, [
    [t('stat.year'), e.year],
    [t('stat.season'), `${t('season.' + e.season)} · ${t('val.day', { n: e.day })}`],
    [t('stat.temperature'), `${Math.round(e.temperature)}°C`],
    [t('stat.fps'), fpsTxt],
  ]);
}

function updateTeamSummary() {
  if (!teamSummaryEl || !game.teams) return;
  if (!game.teams.length) { teamSummaryEl.textContent = ''; return; }
  const parts = game.teams.map(
    (tm) => `<b style="color:${tm.color.fill}">${teamLetter(tm.id)}</b>:${tm.workers.length}`,
  );
  teamSummaryEl.innerHTML = `Teams ${parts.join(' / ')}`;
}

function updatePausedBadge() {
  if (pausedBadge) pausedBadge.hidden = !game.paused;
  if (pauseBtn) pauseBtn.classList.toggle('active', game.paused);
}

function refreshPanels() {
  updateMapStats();
  updateEnvPanel();
  updateTeamSummary();
  renderTeamsPanel();
  renderGlobalPanel();
  renderTradePanel();
  updateLegend();
  updatePausedBadge();
}

// --- tool button strips ---------------------------------------------------

function setActive(container, attr, value) {
  if (!container) return;
  for (const btn of container.querySelectorAll(`button[${attr}]`)) {
    btn.classList.toggle('active', btn.getAttribute(attr) === String(value));
  }
}

if (viewModesEl) {
  viewModesEl.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-mode]');
    if (!btn) return;
    game.viewMode = btn.dataset.mode;
    setActive(viewModesEl, 'data-mode', btn.dataset.mode);
    updateLegend();
  });
}
if (speedsEl) {
  speedsEl.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-speed]');
    if (!btn) return;
    game.setSpeed(Number(btn.dataset.speed));
    setActive(speedsEl, 'data-speed', btn.dataset.speed);
  });
}
if (zoomsEl) {
  zoomsEl.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-zoom]');
    if (!btn) return;
    game.setZoom(Number(btn.dataset.zoom));
    setActive(zoomsEl, 'data-zoom', btn.dataset.zoom);
  });
}
if (pauseBtn) {
  pauseBtn.addEventListener('click', () => { game.paused = !game.paused; updatePausedBadge(); });
}

// --- language -------------------------------------------------------------

function applyLang(lang) {
  setLang(lang);
  document.documentElement.lang = lang;
  for (const el of document.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n);
  }
  for (const el of document.querySelectorAll('[data-i18n-title]')) {
    el.title = t(el.dataset.i18nTitle);
  }
  setActive(langsEl, 'data-lang', lang);
  setActive($('start-langs'), 'data-lang', lang);
  // The dynamic panels embed translated text — force them to rebuild.
  teamsSig = tradeSig = globalSig = null;
  if (buildHintEl && !buildHintEl.classList.contains('warn')) buildHintEl.textContent = buildHintIdle();
  refreshPanels();
}
function bindLangStrip(el) {
  if (!el) return;
  el.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-lang]');
    if (btn) applyLang(btn.dataset.lang);
  });
}
bindLangStrip(langsEl);
bindLangStrip($('start-langs'));

// --- start screen ---------------------------------------------------------

const startScreen = $('start-screen');
const startSeed = $('start-seed');
const teamCountInput = $('start-team-count');
const teamCountLabel = $('start-team-count-label');
const workersInput = $('start-workers');
const workersLabel = $('start-workers-label');

function bindSlider(input, label) {
  if (!input || !label) return;
  const sync = () => { label.textContent = input.value; };
  input.addEventListener('input', sync);
  sync();
}
bindSlider(teamCountInput, teamCountLabel);
bindSlider(workersInput, workersLabel);

$('start-seed-random')?.addEventListener('click', () => {
  if (startSeed) startSeed.value = String(randomSeed());
});

function readSeed(raw) {
  const v = (raw || '').trim();
  if (!v) return randomSeed();
  return /^\d+$/.test(v) ? (Number(v) >>> 0) : hashSeed(v);
}

function generate() {
  const seed = readSeed(startSeed?.value);
  const teamCount = Number(teamCountInput?.value) || 2;
  const workersPerTeam = Number(workersInput?.value) || 4;
  game.newMap(seed, { teamCount, workersPerTeam });
  if (startScreen) startScreen.hidden = true;
  activeTeam = Math.min(activeTeam, teamCount - 1);
  teamsSig = tradeSig = globalSig = null;
  expandedTeams.clear();
  renderTeamSelect();
  if (tradeTeamLabel) tradeTeamLabel.textContent = teamLetter(activeTeam);
  if (buildHintEl) buildHintEl.textContent = buildHintIdle();
  refreshPanels();
  if (!started) { started = true; game.start(); }
}
$('start-generate')?.addEventListener('click', generate);

$('regenerate')?.addEventListener('click', () => {
  // Re-open the setup screen so teams / workers can be reconfigured.
  if (startScreen) startScreen.hidden = false;
});

// --- build panel ----------------------------------------------------------

if (buildToolsEl) {
  buildToolsEl.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-build]');
    if (!btn) return;
    buildTool = btn.dataset.build === 'none' ? null : btn.dataset.build;
    setActive(buildToolsEl, 'data-build', btn.dataset.build);
    if (buildHintEl) buildHintEl.textContent = buildHintIdle();
  });
}

// Team selector — rebuilt after each Generate to match the team count.
function renderTeamSelect() {
  if (!teamSelectEl) return;
  teamSelectEl.innerHTML = game.teams
    .map((tm, i) =>
      `<button type="button" data-team="${i}" class="${i === activeTeam ? 'active' : ''}" ` +
      `style="border-color:${tm.color.fill}">${String.fromCharCode(65 + i)}</button>`)
    .join('');
}
if (teamSelectEl) {
  teamSelectEl.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-team]');
    if (!btn) return;
    setActiveTeam(Number(btn.dataset.team));
  });
}

function setActiveTeam(i) {
  activeTeam = i;
  setActive(teamSelectEl, 'data-team', activeTeam);
  if (tradeTeamLabel) tradeTeamLabel.textContent = teamLetter(activeTeam);
  if (buildHintEl) buildHintEl.textContent = buildHintIdle();
  teamsSig = tradeSig = globalSig = null; // force panel refresh
}

// --- Teams panel (treasury + auto-script control) -------------------------

function teamHauling(tm) {
  const trader = tm.workers[0];
  return (trader && trader.job === 'trade') || tm.tradeQueue.length > 0;
}

let teamsSig = null;
function renderTeamsPanel() {
  if (!teamsPanelEl || !game.teams.length) return;

  // Include expanded teams' stock values in sig so panel refreshes as goods change.
  const expandedStockSig = Array.from(expandedTeams).map(id => {
    const tm = game.teams[id];
    if (!tm) return '';
    return id + ':' + ALL_GOODS_IDS.map(g => tm.stock[g] || 0).join(',') +
      ':b' + tm.buildings.length;
  }).join('|');

  const sig = game.teams.map((tm) =>
    `${tm.id}:${tm.scriptId}:${tm.scriptRunning}:${tm.stock.currency}:${tm.stock.wood}:${tm.stock.stone}:${teamHauling(tm) ? 'H' + tm.tradeQueue.length : '0'}:${activeTeam}`
  ).join('|') + '|exp:' + Array.from(expandedTeams).sort().join(',') + ':' + expandedStockSig;

  if (sig === teamsSig) return;
  teamsSig = sig;

  teamsPanelEl.innerHTML = game.teams.map((tm) => {
    const scripts = SCRIPT_IDS.map((sid) =>
      `<button type="button" data-team="${tm.id}" data-script="${sid}" class="mini${tm.scriptId === sid ? ' active' : ''}">${t('script.' + sid)}</button>`).join('');
    const run = `<button type="button" data-team="${tm.id}" data-run="1" class="mini${tm.scriptRunning ? ' active' : ''}">${tm.scriptRunning ? t('state.running') : t('state.stopped')}</button>`;
    const sel = tm.id === activeTeam ? ' team-row-active' : '';
    const haul = teamHauling(tm) ? ` <span class="haul">🚚${tm.tradeQueue.length ? '+' + tm.tradeQueue.length : ''}</span>` : '';
    const isExpanded = expandedTeams.has(tm.id);
    const expandBtn = `<button type="button" class="mini team-expand" data-expand="${tm.id}">${isExpanded ? '▼' : '▶'}</button>`;

    let detailsHtml = '';
    if (isExpanded) {
      const currCell = `<span class="stat-cell stat-cell-currency" data-tip-kind="good" data-tip-key="currency"><button type="button" class="graph-btn" data-team="${tm.id}" data-type="goods" data-key="currency">¥</button><b>${tm.stock.currency || 0}</b></span>`;
      const goodCells = ALL_GOODS_IDS
        .filter(g => (tm.stock[g] || 0) > 0)
        .map(g => `<span class="stat-cell" data-tip-kind="good" data-tip-key="${g}"><button type="button" class="graph-btn" data-team="${tm.id}" data-type="goods" data-key="${g}">${t('good.' + g)}</button><b>${tm.stock[g]}</b></span>`)
        .join('');
      const buildCounts = tm.buildings.reduce((acc, b) => { acc[b.kind] = (acc[b.kind] || 0) + 1; return acc; }, {});
      const buildCells = BUILDING_KINDS
        .filter(k => buildCounts[k])
        .map(k => `<span class="stat-cell" data-tip-kind="build" data-tip-key="${k}"><button type="button" class="graph-btn" data-team="${tm.id}" data-type="builds" data-key="${k}">${t('build.' + k)}</button><b>${buildCounts[k]}</b></span>`)
        .join('');
      detailsHtml =
        `<div class="team-details">` +
        `<div class="stat-section-label">${t('ui.goods')}</div>` +
        `<div class="stat-grid">${currCell}${goodCells || '<span class="stat-empty">—</span>'}</div>` +
        `<div class="stat-section-label">${t('ui.buildings')}</div>` +
        `<div class="stat-grid">${buildCells || '<span class="stat-empty">—</span>'}</div>` +
        `</div>`;
    }

    return (
      `<div class="team-row${sel}" data-team="${tm.id}">` +
      `<button type="button" class="team-pick" data-pick="${tm.id}" style="background:${tm.color.fill}">${teamLetter(tm.id)}</button>` +
      `<span class="team-stock">¥${tm.stock.currency} ${t('good.wood')}${tm.stock.wood} ${t('good.stone')}${tm.stock.stone}${haul}</span>` +
      `<span class="team-ctrls">${scripts}${run}${expandBtn}</span>` +
      `</div>` +
      detailsHtml
    );
  }).join('');
}
if (teamsPanelEl) {
  teamsPanelEl.addEventListener('click', (ev) => {
    const pick = ev.target.closest('button[data-pick]');
    if (pick) { setActiveTeam(Number(pick.dataset.pick)); return; }
    const sBtn = ev.target.closest('button[data-script]');
    if (sBtn) { game.setTeamScript(Number(sBtn.dataset.team), sBtn.dataset.script); teamsSig = null; renderTeamsPanel(); return; }
    const rBtn = ev.target.closest('button[data-run]');
    if (rBtn) {
      const id = Number(rBtn.dataset.team);
      game.setScriptRunning(id, !game.teams[id].scriptRunning);
      teamsSig = null; renderTeamsPanel();
      return;
    }
    const expBtn = ev.target.closest('button[data-expand]');
    if (expBtn) {
      const id = Number(expBtn.dataset.expand);
      if (expandedTeams.has(id)) expandedTeams.delete(id); else expandedTeams.add(id);
      teamsSig = null; renderTeamsPanel();
      return;
    }
    const gBtn = ev.target.closest('button.graph-btn[data-type]');
    if (gBtn) {
      showGraph(
        `${teamLetter(Number(gBtn.dataset.team))} · ${gBtn.dataset.type === 'goods' ? t('good.' + gBtn.dataset.key) : t('build.' + gBtn.dataset.key)}`,
        Number(gBtn.dataset.team), gBtn.dataset.type, gBtn.dataset.key,
      );
    }
  });
}

// --- Global summary panel -------------------------------------------------

let globalSig = null;
function renderGlobalPanel() {
  if (!globalPanelEl || !game.teams || !game.teams.length) return;

  const totalGoods = {};
  const totalBuilds = {};
  for (const tm of game.teams) {
    totalGoods['currency'] = (totalGoods['currency'] || 0) + (tm.stock.currency || 0);
    for (const g of ALL_GOODS_IDS) {
      totalGoods[g] = (totalGoods[g] || 0) + (tm.stock[g] || 0);
    }
    for (const b of tm.buildings) {
      totalBuilds[b.kind] = (totalBuilds[b.kind] || 0) + 1;
    }
  }

  const sig = ALL_GOODS_IDS.map(g => totalGoods[g] || 0).join(',') + '|' +
    BUILDING_KINDS.map(k => totalBuilds[k] || 0).join(',') + '|' + (totalGoods['currency'] || 0);
  if (sig === globalSig) return;
  globalSig = sig;

  const currCell = `<span class="stat-cell stat-cell-currency" data-tip-kind="good" data-tip-key="currency"><button type="button" class="graph-btn" data-team="-1" data-type="goods" data-key="currency">¥</button><b>${totalGoods['currency'] || 0}</b></span>`;
  const goodCells = ALL_GOODS_IDS
    .filter(g => totalGoods[g] > 0)
    .map(g => `<span class="stat-cell" data-tip-kind="good" data-tip-key="${g}"><button type="button" class="graph-btn" data-team="-1" data-type="goods" data-key="${g}">${t('good.' + g)}</button><b>${totalGoods[g]}</b></span>`)
    .join('');
  const buildCells = BUILDING_KINDS
    .filter(k => totalBuilds[k])
    .map(k => `<span class="stat-cell" data-tip-kind="build" data-tip-key="${k}"><button type="button" class="graph-btn" data-team="-1" data-type="builds" data-key="${k}">${t('build.' + k)}</button><b>${totalBuilds[k]}</b></span>`)
    .join('');

  globalPanelEl.innerHTML =
    `<div class="stat-section-label">${t('ui.goods')}</div>` +
    `<div class="stat-grid">${currCell}${goodCells || '<span class="stat-empty">—</span>'}</div>` +
    `<div class="stat-section-label">${t('ui.buildings')}</div>` +
    `<div class="stat-grid">${buildCells || '<span class="stat-empty">—</span>'}</div>`;
}
if (globalPanelEl) {
  globalPanelEl.addEventListener('click', (ev) => {
    const gBtn = ev.target.closest('button.graph-btn[data-type]');
    if (!gBtn) return;
    showGraph(
      `${t('panel.globalStats')} · ${gBtn.dataset.type === 'goods' ? t('good.' + gBtn.dataset.key) : t('build.' + gBtn.dataset.key)}`,
      -1, gBtn.dataset.type, gBtn.dataset.key,
    );
  });
}

// --- Time-series graph modal ----------------------------------------------

function drawGraph(points, label) {
  if (!graphCanvas) return;
  const ctx = graphCanvas.getContext('2d');
  const W = graphCanvas.width, H = graphCanvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#1a2030';
  ctx.fillRect(0, 0, W, H);

  const pad = { l: 36, r: 10, t: 20, b: 22 };

  if (points.length < 2) {
    ctx.fillStyle = '#93a0b4';
    ctx.font = '11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('No data yet (30 s intervals)', W / 2, H / 2 + 4);
    return;
  }

  const maxV = Math.max(1, ...points.map(p => p.v));
  const minV = 0;
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;
  const px = (i) => pad.l + (i / (points.length - 1)) * plotW;
  const py = (v) => pad.t + (1 - (v - minV) / (maxV - minV)) * plotH;

  // Horizontal grid lines at 0%, 25%, 50%, 75%, 100%
  ctx.lineWidth = 1;
  [0, 0.25, 0.5, 0.75, 1].forEach(frac => {
    const gy = pad.t + (1 - frac) * plotH;
    ctx.strokeStyle = frac === 0 || frac === 1 ? 'rgba(80,100,130,0.5)' : 'rgba(60,75,100,0.35)';
    ctx.beginPath(); ctx.moveTo(pad.l, gy); ctx.lineTo(W - pad.r, gy); ctx.stroke();
    if (frac > 0 && frac < 1) {
      ctx.fillStyle = '#5d6e82';
      ctx.font = '9px system-ui';
      ctx.textAlign = 'right';
      ctx.fillText(Math.round(maxV * frac), pad.l - 3, gy + 3);
    }
  });

  // Filled area under the curve
  ctx.beginPath();
  points.forEach((p, i) => {
    if (i === 0) ctx.moveTo(px(i), py(p.v)); else ctx.lineTo(px(i), py(p.v));
  });
  ctx.lineTo(px(points.length - 1), pad.t + plotH);
  ctx.lineTo(px(0), pad.t + plotH);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + plotH);
  grad.addColorStop(0, 'rgba(95,174,107,0.38)');
  grad.addColorStop(1, 'rgba(95,174,107,0.04)');
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.strokeStyle = '#5fae6b';
  ctx.lineWidth = 1.8;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  points.forEach((p, i) => {
    if (i === 0) ctx.moveTo(px(i), py(p.v)); else ctx.lineTo(px(i), py(p.v));
  });
  ctx.stroke();

  // End-point dot
  const last = points[points.length - 1];
  ctx.fillStyle = '#5fae6b';
  ctx.strokeStyle = '#1a2030';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(px(points.length - 1), py(last.v), 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Axis labels
  ctx.fillStyle = '#7a8fa8';
  ctx.font = '9px system-ui';
  ctx.textAlign = 'right';
  ctx.fillText(maxV, pad.l - 3, pad.t + 3);
  ctx.fillText('0', pad.l - 3, pad.t + plotH + 3);
  ctx.textAlign = 'left';
  ctx.fillText(`t=${points[0].t}s`, pad.l, H - 3);
  ctx.textAlign = 'right';
  ctx.fillText(`t=${points[points.length - 1].t}s`, W - pad.r, H - 3);

  // Current value
  ctx.fillStyle = '#c8e0b8';
  ctx.font = 'bold 10px system-ui';
  ctx.textAlign = 'right';
  ctx.fillText(last.v, W - pad.r, pad.t - 4);

  // Title
  ctx.textAlign = 'left';
  ctx.fillStyle = '#e6e9ef';
  ctx.font = '11px system-ui';
  ctx.fillText(label, pad.l, 13);
}

function showGraph(label, teamId, type, key) {
  if (!game._history) return;
  const points = game._history.map(snap => {
    let v;
    if (teamId < 0) {
      v = snap.teams.reduce((s, tm) => s + (type === 'goods' ? (tm.goods[key] || 0) : (tm.builds[key] || 0)), 0);
    } else {
      const tm = snap.teams[teamId];
      v = tm ? (type === 'goods' ? (tm.goods[key] || 0) : (tm.builds[key] || 0)) : 0;
    }
    return { t: snap.t, v };
  });
  if (graphTitleEl) graphTitleEl.textContent = label;
  drawGraph(points, label);
  if (graphModal) graphModal.hidden = false;
}

if ($('graph-modal-close')) {
  $('graph-modal-close').addEventListener('click', () => {
    if (graphModal) graphModal.hidden = true;
  });
}

// --- Trade panel (manual buy/sell, always allowed) ------------------------

let tradeSig = null;
function renderTradePanel() {
  if (!tradePanelEl || !game.tradePosts) return;
  // Signature on rounded prices so we only rebuild when a displayed number
  // actually changes (keeps buttons clickable between rebuilds).
  const sig = game.tradePosts.map((p, i) =>
    `${i}:${p.edge}:` + TRADE_GOODS.map((g) => `${sellPrice(p, g)}/${buyPrice(p, g)}`).join(',')).join('|') + `#${activeTeam}`;
  if (sig === tradeSig) return;
  tradeSig = sig;
  tradePanelEl.innerHTML = game.tradePosts.map((p, i) => {
    const goods = TRADE_GOODS.map((g) =>
      `<div class="tp-good"><span class="tp-name">${t('good.' + g)}</span>` +
      `<span class="tp-price">${t('trade.sell')} ${sellPrice(p, g)}</span>` +
      `<button type="button" class="mini" data-post="${i}" data-good="${g}" data-act="sell" data-qty="1">${t('trade.sellN', { n: 1 })}</button>` +
      `<button type="button" class="mini" data-post="${i}" data-good="${g}" data-act="sell" data-qty="10">${t('trade.sellN', { n: 10 })}</button>` +
      `<span class="tp-price">${t('trade.buy')} ${buyPrice(p, g)}</span>` +
      `<button type="button" class="mini" data-post="${i}" data-good="${g}" data-act="buy" data-qty="1">${t('trade.buyN', { n: 1 })}</button>` +
      `<button type="button" class="mini" data-post="${i}" data-good="${g}" data-act="buy" data-qty="10">${t('trade.buyN', { n: 10 })}</button>` +
      `</div>`).join('');
    return `<div class="trade-post"><div class="tp-head">${t('edge.' + p.edge)} ${t('trade.post')}</div>${goods}</div>`;
  }).join('');
}
if (tradePanelEl) {
  tradePanelEl.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-act]');
    if (!btn) return;
    const post = Number(btn.dataset.post);
    const good = btn.dataset.good;
    const qty = Number(btn.dataset.qty);
    // Manual command — always executes, regardless of script run/stop state.
    if (btn.dataset.act === 'sell') game.sellAt(activeTeam, post, good, qty);
    else game.buyAt(activeTeam, post, good, qty);
    teamsSig = tradeSig = null; // reflect new treasury / prices at once
    renderTeamsPanel(); renderTradePanel();
  });
}

// --- camera panning -------------------------------------------------------

for (const btn of document.querySelectorAll('.scroll-btn[data-dir]')) {
  const dir = btn.dataset.dir;
  const set = (on) => {
    const k = 1 / Math.sqrt(2);
    const v = on ? SCROLL_STEP : 0;
    if (dir === 'up')         game.panDir = { x: -k * v, y: -k * v };
    else if (dir === 'down')  game.panDir = { x: k * v, y: k * v };
    else if (dir === 'left')  game.panDir = { x: -k * v, y: k * v };
    else if (dir === 'right') game.panDir = { x: k * v, y: -k * v };
    if (!on) game.panDir = { x: 0, y: 0 };
  };
  btn.addEventListener('pointerdown', () => set(true));
  btn.addEventListener('pointerup', () => set(false));
  btn.addEventListener('pointerleave', () => set(false));
}

// Keyboard shortcuts: 1–5 speed, 6–9/0 zoom, space pause, WASD/arrows pan.
const KEY_TO_WASD = {
  ArrowUp: 'w', ArrowDown: 's', ArrowLeft: 'a', ArrowRight: 'd',
  w: 'w', a: 'a', s: 's', d: 'd',
};
window.addEventListener('keydown', (ev) => {
  const el = document.activeElement;
  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
  const k = ev.key.toLowerCase();
  if (k === ' ') { game.paused = !game.paused; updatePausedBadge(); ev.preventDefault(); return; }
  if (k >= '1' && k <= '5') {
    const idx = Number(k) - 1;
    game.setSpeed(idx);
    setActive(speedsEl, 'data-speed', idx);
    ev.preventDefault();
    return;
  }
  if ((k >= '6' && k <= '9') || k === '0') {
    const idx = k === '0' ? 4 : Number(k) - 6;
    game.setZoom(idx);
    setActive(zoomsEl, 'data-zoom', idx);
    ev.preventDefault();
    return;
  }
  const wasd = KEY_TO_WASD[ev.key] || (('wasd'.includes(k)) ? k : null);
  if (wasd) { game.keys.add(wasd); ev.preventDefault(); }
});
window.addEventListener('keyup', (ev) => {
  const k = ev.key.toLowerCase();
  const wasd = KEY_TO_WASD[ev.key] || (('wasd'.includes(k)) ? k : null);
  if (wasd) game.keys.delete(wasd);
});
window.addEventListener('blur', () => { game.keys.clear(); game.panDir = { x: 0, y: 0 }; });

// Drag to pan; a press that barely moves counts as a click (spawn a package).
let dragging = false;
let lastDrag = null;
let pressStart = null;
canvas.addEventListener('pointerdown', (ev) => {
  if (!game.map) return;
  dragging = true;
  lastDrag = { x: ev.clientX, y: ev.clientY };
  pressStart = { x: ev.clientX, y: ev.clientY };
  canvas.setPointerCapture(ev.pointerId);
});
canvas.addEventListener('pointermove', (ev) => {
  updateTooltip(ev);
  if (!dragging || !game.camera) return;
  const rect = canvas.getBoundingClientRect();
  const scale = canvas.width / rect.width;
  const dxPx = (ev.clientX - lastDrag.x) * scale;
  const dyPx = (ev.clientY - lastDrag.y) * scale;
  lastDrag = { x: ev.clientX, y: ev.clientY };
  const tw = game.tileSize * 0.5;
  const th = game.tileSize * 0.25;
  const ax = -dxPx / tw;
  const ay = -dyPx / th;
  game.camera.pan((ay + ax) / 2, (ay - ax) / 2);
});
canvas.addEventListener('pointerup', (ev) => {
  if (pressStart && game.map) {
    const moved = Math.hypot(ev.clientX - pressStart.x, ev.clientY - pressStart.y);
    if (moved < DRAG_THRESHOLD) clickBuild(ev);
  }
  dragging = false; lastDrag = null; pressStart = null;
});
canvas.addEventListener('pointercancel', () => { dragging = false; lastDrag = null; pressStart = null; });

canvas.addEventListener('wheel', (ev) => {
  if (!game.map) return;
  ev.preventDefault();
  const dir = ev.deltaY > 0 ? -1 : 1;
  game.setZoom(game.zoomIndex + dir);
  setActive(zoomsEl, 'data-zoom', game.zoomIndex);
}, { passive: false });

// --- pointer → tile -------------------------------------------------------

function pointerTile(ev) {
  const rect = canvas.getBoundingClientRect();
  const sx = (ev.clientX - rect.left) * (canvas.width / rect.width);
  const sy = (ev.clientY - rect.top) * (canvas.height / rect.height);
  // worldToScreen lifts a tile UP by elevationLift(e)·ts·ISO_ELEV_RATIO, but
  // screenToWorld assumes flat ground (elevation 0). Pointing at a raised
  // terrace would otherwise resolve to the flat tile below it — a vertical
  // mismatch (present even on flat land, which sits at LAND_BASE). Correct it
  // by re-inverting at the pointed tile's own elevation, iterating to settle
  // on the tile whose lifted top is actually under the cursor.
  const K = game.tileSize * ISO_ELEV_RATIO;
  const tileElev = (wx, wy) => {
    const tx = Math.floor(wx);
    const ty = Math.floor(wy);
    if (!game.map || tx < 0 || ty < 0 || tx >= GRID_COLS || ty >= GRID_ROWS) return 0;
    return game.map.tiles[ty][tx].elevation;
  };
  let w = screenToWorld(sx, sy, game.camera, game.tileSize, canvas.width, canvas.height);
  for (let i = 0; i < 5; i++) {
    const e = tileElev(w.x, w.y);
    const next = screenToWorld(sx, sy + elevationLift(e) * K, game.camera, game.tileSize, canvas.width, canvas.height);
    if (Math.floor(next.x) === Math.floor(w.x) && Math.floor(next.y) === Math.floor(w.y)) { w = next; break; }
    w = next;
  }
  return { x: Math.floor(w.x), y: Math.floor(w.y) };
}

function clickBuild(ev) {
  if (!buildTool) return; // "inspect" mode — clicking does nothing
  const { x, y } = pointerTile(ev);
  if (x < 0 || y < 0 || x >= GRID_COLS || y >= GRID_ROWS) return;
  let ok;
  if (buildTool === 'woodRoad') ok = game.planRoad(activeTeam, 'wood', x, y, true);
  else if (buildTool === 'stoneRoad') ok = game.planRoad(activeTeam, 'stone', x, y, true);
  else ok = game.build(activeTeam, buildTool, x, y);
  if (!ok) flashBuildFail();
}

let buildFailTimer = null;
function flashBuildFail() {
  if (!buildHintEl) return;
  buildHintEl.textContent = t('build.fail');
  buildHintEl.classList.add('warn');
  clearTimeout(buildFailTimer);
  buildFailTimer = setTimeout(() => {
    buildHintEl.classList.remove('warn');
    buildHintEl.textContent = buildHintIdle();
  }, 2200);
}
function buildHintIdle() {
  if (!buildTool) return t('build.inspect');
  return t('build.do', { name: t('build.' + buildTool), team: teamLetter(activeTeam) });
}

function describeTile(tile) {
  if (tile.building) {
    return `${t('build.' + tile.building.kind)} ${t('good.wood')}${tile.building.wood}/${t('good.stone')}${tile.building.stone}`;
  }
  if (tile.feature) {
    const f = tile.feature;
    const good = f.kind === 'forest' ? t('good.wood') : t('good.stone');
    return `${t('feat.' + f.kind)} ${good}${f.stock}/${f.max}`;
  }
  if (tile.crop) {
    const pct = Math.round(tile.crop.growth * 100);
    const ripe = tile.crop.growth >= 1 ? ' (ready)' : '';
    return `${t('good.' + tile.crop.kind)} ${pct}%${ripe}`;
  }
  if (tile.item) return t('good.' + tile.item.type);
  const base = tile.type === TileType.WATER ? t('legend.water') : t('legend.richSoil');
  if (tile.road) return `${base} · ${t(tile.road === 'stone' ? 'build.stoneRoad' : 'build.woodRoad')}`;
  return base;
}

function updateTooltip(ev) {
  if (!tooltip || !game.map || !game.camera) return;
  const { x, y } = pointerTile(ev);
  if (x < 0 || y < 0 || x >= GRID_COLS || y >= GRID_ROWS) { tooltip.hidden = true; game.hover = null; return; }
  game.hover = { x, y };
  const tile = game.map.tiles[y][x];
  const rect = canvas.getBoundingClientRect();
  tooltip.hidden = false;
  tooltip.style.left = `${ev.clientX - rect.left + 12}px`;
  tooltip.style.top = `${ev.clientY - rect.top + 12}px`;
  tooltip.textContent = `(${x}, ${y}) Lv${tile.level} · ${describeTile(tile)}`;
}
canvas.addEventListener('pointerleave', () => { if (tooltip) tooltip.hidden = true; game.hover = null; });

// --- Panel hover tooltip (goods & buildings stat-cells) -------------------
const panelTip = document.createElement('div');
panelTip.id = 'panel-tip';
panelTip.className = 'panel-tip';
panelTip.hidden = true;
document.body.appendChild(panelTip);

let _ptTarget = null;
document.addEventListener('mouseover', (e) => {
  const cell = e.target.closest('[data-tip-kind]');
  if (cell === _ptTarget) return;
  _ptTarget = cell;
  if (!cell) { panelTip.hidden = true; return; }
  const kind = cell.dataset.tipKind;
  const key = cell.dataset.tipKey;
  const entry = PANEL_TIPS[kind]?.[key];
  if (!entry) { panelTip.hidden = true; return; }
  const text = entry[getLang()] || entry.en;
  const lines = text.split('\n');
  panelTip.innerHTML = `<b>${lines[0]}</b>` + lines.slice(1).map(l => `<span>${l}</span>`).join('');
  panelTip.hidden = false;
});
document.addEventListener('mousemove', (e) => {
  if (!panelTip.hidden) {
    const x = e.clientX + 14, y = e.clientY + 14;
    const rw = panelTip.offsetWidth || 200;
    panelTip.style.left = `${Math.min(x, window.innerWidth - rw - 8)}px`;
    panelTip.style.top  = `${y}px`;
  }
});
document.addEventListener('mouseout', (e) => {
  if (!e.relatedTarget || !e.relatedTarget.closest('[data-tip-kind]')) {
    if (_ptTarget && !_ptTarget.contains(e.relatedTarget)) {
      _ptTarget = null;
      panelTip.hidden = true;
    }
  }
});

// --- boot -----------------------------------------------------------------

applyLang(getLang());
// Pre-fill a random seed so Generate is one click away.
if (startSeed) startSeed.value = String(randomSeed());
setInterval(refreshPanels, 200);
