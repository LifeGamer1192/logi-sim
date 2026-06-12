// Auto-build prerequisite logic.
// strategy.js の PROC_BUILD_PREREQS が適切なタイミングで true/false を返すかを検証。
// Run with: npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { PROC_BUILD_PREREQS } from '../src/strategy.js';

/** 指定 kinds の building のみ持つフェイクチームを作る */
function fakeTeam(kinds) {
  return { buildings: kinds.map(k => ({ kind: k })) };
}

test('sawmill・charcoalKiln は前提条件なしで建築可', () => {
  const empty = fakeTeam([]);
  assert.ok(PROC_BUILD_PREREQS.sawmill(empty), 'sawmill');
  assert.ok(PROC_BUILD_PREREQS.charcoalKiln(empty), 'charcoalKiln');
});

test('kiln は clayMine または sandMine が必要', () => {
  assert.ok(!PROC_BUILD_PREREQS.kiln(fakeTeam([])), '採掘所なし → 不可');
  assert.ok( PROC_BUILD_PREREQS.kiln(fakeTeam(['clayMine'])),  'clayMine → 可');
  assert.ok( PROC_BUILD_PREREQS.kiln(fakeTeam(['sandMine'])),  'sandMine → 可');
  assert.ok( PROC_BUILD_PREREQS.kiln(fakeTeam(['clayMine', 'sandMine'])), '両方 → 可');
});

test('smelter は charcoalKiln ＋ いずれかの金属鉱山が必要', () => {
  assert.ok(!PROC_BUILD_PREREQS.smelter(fakeTeam([])),                          'どちらもなし → 不可');
  assert.ok(!PROC_BUILD_PREREQS.smelter(fakeTeam(['charcoalKiln'])),             '窯のみ → 不可');
  assert.ok(!PROC_BUILD_PREREQS.smelter(fakeTeam(['ironMine'])),                 '鉱山のみ → 不可');
  assert.ok( PROC_BUILD_PREREQS.smelter(fakeTeam(['charcoalKiln', 'ironMine'])), '+ironMine → 可');
  assert.ok( PROC_BUILD_PREREQS.smelter(fakeTeam(['charcoalKiln', 'copperMine'])), '+copperMine → 可');
  assert.ok( PROC_BUILD_PREREQS.smelter(fakeTeam(['charcoalKiln', 'tinMine'])),  '+tinMine → 可');
});

test('alloyForge は smelter + copperMine + tinMine が必要', () => {
  assert.ok(!PROC_BUILD_PREREQS.alloyForge(fakeTeam(['smelter', 'copperMine'])), 'tinMine なし → 不可');
  assert.ok(!PROC_BUILD_PREREQS.alloyForge(fakeTeam(['smelter', 'tinMine'])),    'copperMine なし → 不可');
  assert.ok(!PROC_BUILD_PREREQS.alloyForge(fakeTeam(['copperMine', 'tinMine'])), 'smelter なし → 不可');
  assert.ok( PROC_BUILD_PREREQS.alloyForge(fakeTeam(['smelter', 'copperMine', 'tinMine'])), '全揃い → 可');
});

test('grain 系（ropeMaker / windmill / weavery）は farm が必要', () => {
  const noFarm = fakeTeam([]);
  const withFarm = fakeTeam(['farm']);
  for (const kind of ['ropeMaker', 'windmill', 'weavery']) {
    assert.ok(!PROC_BUILD_PREREQS[kind](noFarm),   `${kind}: farm なし → 不可`);
    assert.ok( PROC_BUILD_PREREQS[kind](withFarm), `${kind}: farm あり → 可`);
  }
});

test('smithy は smelter + sawmill が必要', () => {
  assert.ok(!PROC_BUILD_PREREQS.smithy(fakeTeam(['smelter'])),          'sawmill なし → 不可');
  assert.ok(!PROC_BUILD_PREREQS.smithy(fakeTeam(['sawmill'])),           'smelter なし → 不可');
  assert.ok( PROC_BUILD_PREREQS.smithy(fakeTeam(['smelter', 'sawmill'])), '両方 → 可');
});

test('precisionWorkshop は alloyForge + smithy が必要', () => {
  assert.ok(!PROC_BUILD_PREREQS.precisionWorkshop(fakeTeam(['alloyForge'])), 'smithy なし → 不可');
  assert.ok(!PROC_BUILD_PREREQS.precisionWorkshop(fakeTeam(['smithy'])),     'alloyForge なし → 不可');
  assert.ok( PROC_BUILD_PREREQS.precisionWorkshop(fakeTeam(['alloyForge', 'smithy'])), '両方 → 可');
});

test('全加工 building に PROC_BUILD_PREREQS が定義されている', () => {
  const ORDER = [
    'sawmill', 'charcoalKiln', 'kiln', 'smelter', 'alloyForge',
    'ropeMaker', 'windmill', 'weavery', 'smithy', 'precisionWorkshop',
  ];
  for (const kind of ORDER) {
    assert.strictEqual(typeof PROC_BUILD_PREREQS[kind], 'function', `${kind} に関数がない`);
  }
});

test('依存チェーンの整合性: precisionWorkshop に至る完全な建築済み状態 → 全て可', () => {
  const full = fakeTeam([
    'loggingCamp', 'stoneCutter', 'clayMine', 'sandMine', 'coalMine',
    'farm', 'ironMine', 'copperMine', 'tinMine', 'ranch',
    'sawmill', 'charcoalKiln', 'kiln', 'smelter', 'alloyForge',
    'ropeMaker', 'windmill', 'weavery', 'smithy',
  ]);
  assert.ok(PROC_BUILD_PREREQS.precisionWorkshop(full), '全建築済み → precisionWorkshop 可');
});
