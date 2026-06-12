/**
 * profit-check.mjs — レシピごとの加工利益チェック
 * node bench/profit-check.mjs [before|after]
 */
const MODE = process.argv[2] || 'after';

const SELL_BEFORE = {
  wood:2,stone:4,plank:5,brick:6,charcoal:7,
  iron:10,copper:8,tin:7,bronze:12,coal:9,
  clay:3,sand:2,glass:8,rope:4,cloth:6,leather:7,
  grain:3,flour:5,tool:14,gear:16,
  wheat:4,potato:5,cotton:10,turnip:3,rice:8,
  thread:14,cottonCloth:25,canvas:40,
  ironOre:0,copperOre:0,tinOre:0,
};

const SELL_AFTER = {
  wood:2,stone:4,plank:5,brick:8,charcoal:8,
  iron:10,copper:10,tin:10,bronze:25,coal:9,
  clay:3,sand:2,glass:8,rope:8,cloth:11,leather:7,
  grain:3,flour:8,tool:32,gear:100,
  wheat:4,potato:5,cotton:10,turnip:3,rice:8,
  thread:14,cottonCloth:35,canvas:88,
  ironOre:0,copperOre:0,tinOre:0,
};

const SELL = MODE === 'before' ? SELL_BEFORE : SELL_AFTER;

const RECIPES = [
  { bldg:'製材所',          inputs:[['wood',2]],                    out:'plank'       },
  { bldg:'炭焼き窯',        inputs:[['wood',3]],                    out:'charcoal'    },
  { bldg:'窯 (レンガ)',     inputs:[['clay',2]],                    out:'brick'       },
  { bldg:'窯 (ガラス)',     inputs:[['sand',3]],                    out:'glass'       },
  { bldg:'精錬所 (鉄)',     inputs:[['ironOre',1],['charcoal',1]], out:'iron'        },
  { bldg:'精錬所 (銅)',     inputs:[['copperOre',1],['charcoal',1]],out:'copper'     },
  { bldg:'精錬所 (錫)',     inputs:[['tinOre',1],['charcoal',1]],  out:'tin'         },
  { bldg:'合金炉',          inputs:[['copper',1],['tin',1]],        out:'bronze'      },
  { bldg:'ロープ工場',      inputs:[['grain',2]],                   out:'rope'        },
  { bldg:'風車',            inputs:[['grain',2]],                   out:'flour'       },
  { bldg:'機織り場 (布)',   inputs:[['grain',3]],                   out:'cloth'       },
  { bldg:'紡績工場',        inputs:[['cotton',1]],                  out:'thread'      },
  { bldg:'機織り場 (木綿)', inputs:[['thread',2]],                  out:'cottonCloth' },
  { bldg:'機織り場 (帆布)', inputs:[['cottonCloth',2]],             out:'canvas'      },
  { bldg:'鍛冶屋',          inputs:[['iron',2],['plank',1]],        out:'tool'        },
  { bldg:'精密工房',        inputs:[['bronze',2],['tool',1]],       out:'gear'        },
];

console.log(`\n=== 加工利益チェック (${MODE.toUpperCase()}) ===\n`);
console.log('建物              レシピ                         原料¥  出力¥  損益     判定');
console.log('----------------- ------------------------------ ------ ------ -------- ----');

for (const r of RECIPES) {
  const inV  = r.inputs.reduce((s,[g,n]) => s + (SELL[g]??0)*n, 0);
  const outV = SELL[r.out] ?? 0;
  const gain = outV - inV;
  const pct  = inV > 0 ? (gain/inV*100).toFixed(0) : '∞';
  const mark = gain > 3  ? '✅'
             : gain > 0  ? '🟡'
             : gain === 0 ? '⚖️ '
             :              '❌';
  const recipe = r.inputs.map(([g,n])=>`${g}×${n}`).join('+') + `→${r.out}`;
  console.log(
    `${r.bldg.padEnd(18)}${recipe.padEnd(32)}` +
    `¥${String(inV).padEnd(7)}¥${String(outV).padEnd(7)}` +
    `${(gain>=0?'+':'')+gain}(${pct}%)  ${mark}`
  );
}
console.log('\n ※ 精錬所の鉱石は交易不可 (sell=0)。炭だけが機会費用になります。\n');
