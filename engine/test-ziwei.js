/**
 * 紫微排盤引擎 · 覆核測試
 *
 * 為什麼要有這支：命盤算錯不會報錯。它會安安靜靜給你一張看起來完全正常的錯盤，
 * 而錯的地方往往只是某顆星差一宮——肉眼看不出來，論斷卻整個歪掉。
 * 玄空那套是拿《玄空學》書上的盤逐格覆核 432 格才敢說可覆按；紫微要走同一條路。
 *
 * 這支分兩層：
 *   一、**口訣層**——安星表對照傳統口訣，逐干逐支檢查。不需要外部命例，
 *       改動安星邏輯若破壞口訣，這一層立刻擋下。
 *   二、**命例層**——拿已驗證的實際命盤逐宮逐星對。命例放在 cases/ 下，
 *       一個 JSON 一例。**目前尚無經確認的命例**，待補。
 *
 * 用法：node engine/test-ziwei.js
 */
'use strict';

const path = require('path');
const fs = require('fs');
const L = require(path.join(__dirname, '..', 'assets', 'lunar.js'));
const Solar = L.Solar || (typeof global !== 'undefined' && global.Solar);
const E = require(path.join(__dirname, 'ziwei-engine.js'));

let pass = 0, fail = 0;
const failures = [];

function chk(label, ok, detail) {
  if (ok) { pass++; }
  else { fail++; failures.push(label + (detail ? `　${detail}` : '')); }
}

const Z = E.DI_ZHI;
const zhi = (i) => Z[((i % 12) + 12) % 12];

// ── 一、口訣層 ───────────────────────────────────────────────

console.log('【一】安星口訣對照');

// 祿存：甲祿在寅、乙卯、丙戊巳、丁己午、庚申、辛酉、壬亥、癸子
{
  const want = { 甲: '寅', 乙: '卯', 丙: '巳', 丁: '午', 戊: '巳',
                 己: '午', 庚: '申', 辛: '酉', 壬: '亥', 癸: '子' };
  let ok = true, bad = [];
  E.TIAN_GAN.forEach((g, i) => {
    const got = zhi(E.LU_CUN_POS[i]);
    if (got !== want[g]) { ok = false; bad.push(`${g}→${got}(應${want[g]})`); }
  });
  chk('祿存十干', ok, bad.join(' '));
}

// 魁鉞：甲戊庚牛羊、乙己鼠猴、丙丁豬雞、辛逢馬虎、壬癸兔蛇
{
  const want = {
    甲: ['丑', '未'], 戊: ['丑', '未'], 庚: ['丑', '未'],
    乙: ['子', '申'], 己: ['子', '申'],
    丙: ['亥', '酉'], 丁: ['亥', '酉'],
    辛: ['午', '寅'],
    壬: ['卯', '巳'], 癸: ['卯', '巳']
  };
  let ok = true, bad = [];
  E.TIAN_GAN.forEach((g, i) => {
    const got = [zhi(E.KUI_POS[i]), zhi(E.YUE_POS[i])];
    if (got[0] !== want[g][0] || got[1] !== want[g][1]) {
      ok = false; bad.push(`${g}→魁${got[0]}鉞${got[1]}(應${want[g].join('')})`);
    }
  });
  chk('天魁天鉞十干', ok, bad.join(' '));
}

// 火鈴起例：寅午戌起丑、申子辰起寅、巳酉丑起卯、亥卯未起酉；鈴星寅午戌起卯、餘起戌
{
  const group = { 申子辰: 0, 巳酉丑: 1, 寅午戌: 2, 亥卯未: 3 };
  const wantFire = { 寅午戌: '丑', 申子辰: '寅', 巳酉丑: '卯', 亥卯未: '酉' };
  const wantBell = { 寅午戌: '卯', 申子辰: '戌', 巳酉丑: '戌', 亥卯未: '戌' };
  let ok = true, bad = [];
  Object.entries(group).forEach(([name, g]) => {
    const f = zhi(E.FIRE_START[g]), b = zhi(E.BELL_START[g]);
    if (f !== wantFire[name]) { ok = false; bad.push(`火${name}→${f}(應${wantFire[name]})`); }
    if (b !== wantBell[name]) { ok = false; bad.push(`鈴${name}→${b}(應${wantBell[name]})`); }
  });
  chk('火星鈴星起例', ok, bad.join(' '));
}

// 天馬：申子辰在寅、巳酉丑在亥、寅午戌在申、亥卯未在巳
{
  const want = { 0: '寅', 1: '亥', 2: '申', 3: '巳' };
  let ok = true, bad = [];
  Object.keys(want).forEach(g => {
    const got = zhi(E.MA_POS[g]);
    if (got !== want[g]) { ok = false; bad.push(`組${g}→${got}(應${want[g]})`); }
  });
  chk('天馬四馬地', ok, bad.join(' '));
}

// 五行局：命宮干支查六十甲子納音，逐一驗六十組皆落在 2/3/4/5/6
{
  let ok = true, seen = new Set();
  for (let g = 0; g < 10; g++) for (let z = 0; z < 12; z++) {
    if ((g % 2) !== (z % 2)) continue;   // 干支陰陽須同，六十甲子無陽干配陰支
    const b = E.getBureau(g, z);
    seen.add(b);
    if (![2, 3, 4, 5, 6].includes(b)) ok = false;
  }
  chk('五行局涵蓋六十甲子', ok && seen.size === 5, `得到局數 ${[...seen].sort().join(',')}`);
}

// 紫微天府對宮關係：天府恆為紫微之對映（寅申一線互換）
{
  let ok = true, bad = [];
  for (let zw = 0; zw < 12; zw++) {
    const tf = E.getTianfuPos(zw);
    if ((zw + tf) % 12 !== 4) { ok = false; bad.push(`紫${zhi(zw)}府${zhi(tf)}`); }
  }
  chk('紫微天府相對(和恆為寅申線)', ok, bad.slice(0, 4).join(' '));
}

// 十二宮名序：命宮起逆佈，兄弟在命後一位
{
  const c = E.buildChart({ year: 1984, month: 1, day: 1, hour: 12, minute: 0,
                           gender: 'M', targetYear: 2026 }, { Solar });
  const names = c.palaces.map(p => p.name);
  chk('十二宮齊備', new Set(names).size === 12, names.join(''));
  const ming = c.palaces[c.mingPos];
  chk('命宮標記正確', ming.name === '命宮' && ming.isMing);
  const xiongdi = c.palaces[((c.mingPos - 1) + 12) % 12];
  chk('兄弟宮在命宮逆一位', xiongdi.name === '兄弟', xiongdi.name);
}

// 十四主星：任一盤皆恰好各出現一次
{
  const MAIN = ['紫微', '天機', '太陽', '武曲', '天同', '廉貞', '天府',
                '太陰', '貪狼', '巨門', '天相', '天梁', '七殺', '破軍'];
  let ok = true, bad = [];
  for (const day of [1, 7, 15, 23, 30]) {
    const c = E.buildChart({ year: 1990, month: 6, day, hour: 8, minute: 0,
                             gender: 'F', targetYear: 2026 }, { Solar });
    const all = c.palaces.flatMap(p => p.stars.map(s => s.name));
    MAIN.forEach(m => {
      const n = all.filter(x => x === m).length;
      if (n !== 1) { ok = false; bad.push(`${day}日:${m}×${n}`); }
    });
  }
  chk('十四主星各恰一次', ok, bad.slice(0, 5).join(' '));
}

// 大限：十二宮皆有、且區間不重疊不斷檔
{
  const c = E.buildChart({ year: 1984, month: 1, day: 1, hour: 12, minute: 0,
                           gender: 'M', targetYear: 2026 }, { Solar });
  const spans = c.palaces.map(p => p.dayun).filter(Boolean)
    .map(s => s.split('-').map(Number)).sort((a, b) => a[0] - b[0]);
  chk('大限十二宮齊', spans.length === 12, `${spans.length} 宮`);
  let cont = spans[0][0] === c.bureau.startAge;
  for (let i = 1; i < spans.length; i++) if (spans[i][0] !== spans[i - 1][1] + 1) cont = false;
  chk('大限首運合局數且逐運銜接', cont, spans.map(s => s.join('-')).join(' '));
}

// 四化：生年四化必為四顆不同的星，且皆在盤上
{
  let ok = true, bad = [];
  for (const y of [1984, 1990, 1995, 2000, 2005]) {
    const c = E.buildChart({ year: y, month: 5, day: 10, hour: 10, minute: 0,
                             gender: 'M', targetYear: 2026 }, { Solar });
    const hua = c.palaces.flatMap(p => p.stars.filter(s => s.hua).map(s => s.hua));
    const uniq = new Set(hua);
    if (uniq.size !== hua.length) { ok = false; bad.push(`${y}年四化重複:${hua.join('')}`); }
  }
  chk('生年四化不重複', ok, bad.join(' '));
}

// 陰陽男女順逆：陽男陰女順行、陰男陽女逆行
{
  // 年干支以農曆正月初一為界，故日期必須明寫——1984-06-15 已入甲子，1984-01-01 仍屬癸亥
  const cases = [
    { y: 1984, m: 6, d: 15, g: 'M', want: '順行', why: '甲子陽年·男' },
    { y: 1984, m: 6, d: 15, g: 'F', want: '逆行', why: '甲子陽年·女' },
    { y: 1985, m: 6, d: 15, g: 'M', want: '逆行', why: '乙丑陰年·男' },
    { y: 1985, m: 6, d: 15, g: 'F', want: '順行', why: '乙丑陰年·女' },
    { y: 1984, m: 1, d: 1, g: 'M', want: '逆行', why: '年界前仍癸亥陰年·男' },
  ];
  let ok = true, bad = [];
  cases.forEach(({ y, m, d, g, want, why }) => {
    const c = E.buildChart({ year: y, month: m, day: d, hour: 10, minute: 0,
                             gender: g, targetYear: 2026 }, { Solar });
    if (c.direction !== want) { ok = false; bad.push(`${why}→${c.direction}(應${want})`); }
  });
  chk('陽男陰女順、陰男陽女逆', ok, bad.join(' '));
}

// 晚子時換日（倪師法）：23 時之後算次日
{
  const a = E.buildChart({ year: 2000, month: 3, day: 10, hour: 22, minute: 0,
                           gender: 'M', targetYear: 2026 }, { Solar });
  const b = E.buildChart({ year: 2000, month: 3, day: 10, hour: 23, minute: 30,
                           gender: 'M', targetYear: 2026 }, { Solar });
  chk('晚子時換日', b.lunar.day === a.lunar.day + 1 || b.lunar.day === 1,
      `22時農曆${a.lunar.day}日 / 23時農曆${b.lunar.day}日`);
}

// 決定性：同輸入必得同輸出
{
  const mk = () => JSON.stringify(E.buildChart(
    { year: 1978, month: 11, day: 3, hour: 5, minute: 0, gender: 'F', targetYear: 2026 },
    { Solar }));
  chk('排盤具決定性', mk() === mk());
}

// ── 二、命例層 ───────────────────────────────────────────────

console.log('\n【二】實際命例覆核');
const caseDir = path.join(__dirname, 'cases');
let caseFiles = [];
try { caseFiles = fs.readdirSync(caseDir).filter(f => f.endsWith('.json')); } catch (e) {}

if (caseFiles.length === 0) {
  console.log('  （尚無命例。cases/*.json 放入經確認的盤面即自動納入覆核）');
} else {
  caseFiles.forEach(f => {
    const cs = JSON.parse(fs.readFileSync(path.join(caseDir, f), 'utf8'));
    const c = E.buildChart(cs.inputs, { Solar });
    Object.entries(cs.expect.palaces || {}).forEach(([z, want]) => {
      const got = E.palaceAtZhi(c, z).stars.map(s => s.name).sort();
      chk(`${f} ${z}宮`, JSON.stringify(got) === JSON.stringify([...want].sort()),
          `得 ${got.join('、') || '空'}`);
    });
    if (cs.expect.bureau) chk(`${f} 五行局`, c.bureau.name === cs.expect.bureau, c.bureau.name);
    if (cs.expect.mingZhi) chk(`${f} 命宮`, Z[c.mingPos] === cs.expect.mingZhi, Z[c.mingPos]);
  });
}

// ── 結果 ────────────────────────────────────────────────────

console.log('\n' + '='.repeat(52));
if (fail === 0) {
  console.log(`結果：${pass} 項全數通過 ✔`);
  process.exit(0);
}
console.log(`結果：${pass} 通過、${fail} 失敗`);
failures.forEach(f => console.log('  ✘ ' + f));
process.exit(1);
