#!/usr/bin/env node
/**
 * 紫微排盤命令列介面
 * ====================
 * 為什麼要有這支：ziwei-engine.js 是 UMD 模組，只能被 require，
 * 命令列直接跑什麼都不會發生。而「把算盤與判讀拆開」的架構裡，
 * 排盤必須能在對話之外先算完——模型不該用最貴的資源做查表的事。
 *
 * 用法：
 *   node engine/ziwei-cli.js --date 1984-01-01 --time 12:00 --gender M
 *   node engine/ziwei-cli.js --date 1984-01-01 --time 12:00 --gender M --year 2026
 *   node engine/ziwei-cli.js --date 1984-01-01 --time 12:00 --gender M --json
 *
 *   --date    西曆出生日期 YYYY-MM-DD（必填）
 *   --time    出生時間 HH:MM（必填，時辰以此判定）
 *   --gender  M 或 F（必填，決定大限順逆）
 *   --year    流年，預設今年
 *   --json    輸出 JSON 而非表格
 */
const path = require('path');
const HERE = __dirname;
const E = require(path.join(HERE, 'ziwei-engine.js'));
const L = require(path.join(HERE, '..', 'assets', 'lunar.js'));
const Solar = L.Solar || global.Solar;

function parseArgs(argv) {
  const a = {};
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (!k.startsWith('--')) continue;
    const name = k.slice(2);
    if (name === 'json') { a.json = true; continue; }
    a[name] = argv[++i];
  }
  return a;
}

function die(msg) {
  console.error('錯誤：' + msg);
  console.error('用法：node engine/ziwei-cli.js --date YYYY-MM-DD --time HH:MM --gender M|F [--year 2026] [--json]');
  process.exit(1);
}

const a = parseArgs(process.argv);
if (!a.date) die('缺 --date');
if (!a.time) die('缺 --time');
if (!a.gender) die('缺 --gender');

const dm = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(a.date.trim());
if (!dm) die('--date 格式應為 YYYY-MM-DD，收到：' + a.date);
const tm = /^(\d{1,2}):(\d{1,2})$/.exec(a.time.trim());
if (!tm) die('--time 格式應為 HH:MM，收到：' + a.time);
const gender = a.gender.trim().toUpperCase();
if (gender !== 'M' && gender !== 'F') die('--gender 只接受 M 或 F，收到：' + a.gender);

const inputs = {
  year: +dm[1], month: +dm[2], day: +dm[3],
  hour: +tm[1], minute: +tm[2],
  gender,
  targetYear: a.year ? parseInt(a.year, 10) : new Date().getFullYear(),
};

let chart;
try {
  chart = E.buildChart(inputs, { Solar });
} catch (e) {
  die('排盤失敗：' + e.message);
}

if (a.json) {
  console.log(JSON.stringify(chart, null, 2));
  process.exit(0);
}

const pad = (s, n) => {
  // 中文字寬約為西文兩倍，用視覺寬度對齊，不然表格會歪
  const w = [...String(s)].reduce((acc, ch) => acc + (ch.charCodeAt(0) > 0x2e80 ? 2 : 1), 0);
  return String(s) + ' '.repeat(Math.max(0, n - w));
};

const b = chart.bazi || {};
const lu = chart.lunar || {};
const bureau = (chart.bureau && chart.bureau.name) || chart.bureau || '—';
const line = '═'.repeat(58);
console.log(line);
console.log(`  出生　${inputs.year}-${String(inputs.month).padStart(2,'0')}-${String(inputs.day).padStart(2,'0')} ` +
            `${String(inputs.hour).padStart(2,'0')}:${String(inputs.minute).padStart(2,'0')}　` +
            `${gender === 'M' ? '男' : '女'}　虛歲 ${chart.age}`);
if (lu.month) console.log(`  農曆　${lu.isLeap ? '閏' : ''}${lu.month}月${lu.day}日`);
if (b.yearGanZhi) console.log(`  八字　${b.yearGanZhi} ${b.monthGanZhi} ${b.dayGanZhi} ${b.timeGanZhi}`);
console.log(`  五行局　${bureau}　大限${chart.direction || ''}　流年 ${inputs.targetYear}`);
console.log(line);
console.log(`  ${pad('宮位',14)}${pad('干支',6)}${pad('大限',10)}星曜`);
console.log('  ' + '─'.repeat(54));
chart.palaces.forEach(p => {
  const marks = [p.isMing ? '命' : '', p.isShen ? '身' : '', p.isLiuNian ? '流年' : ''].filter(Boolean).join('');
  const stars = (p.stars || []).map(s => s.name).join('、') || '（空宮）';
  console.log(`  ${pad(p.name + (marks ? '·' + marks : ''), 14)}${pad(p.gan + p.zhi, 6)}${pad(p.dayun || '—', 10)}${stars}`);
});
console.log(line);
