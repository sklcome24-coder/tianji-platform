/**
 * 天紀紫微斗數 · 排盤引擎
 *
 * 這一份是從 ziwei.html 抽出來的**純計算**核心。抽出來的理由只有一個：
 * 原本安星邏輯埋在 React 元件裡，還跟 CSS class 寫在同一行
 * （`addStar('祿存', luCun, 'text-emerald-700')`），這種狀態下寫不了任何自動驗證——
 * 而命盤算錯不會報錯，它會安安靜靜地給你一張看起來完全正常的錯盤。
 *
 * 本檔的三條界線：
 *   一、不碰 DOM、不碰 React、不碰網路、不含任何顏色或版面資訊。
 *   二、不產生斷語。輸出的是盤面資料，怎麼論斷是使用者的事。
 *   三、曆法一律由注入的 lunar-javascript 提供，本檔不自行推算農曆與干支。
 *
 * 用法（node）：
 *   const { buildChart } = require('./ziwei-engine.js');
 *   const { Solar } = require('lunar-javascript');
 *   const chart = buildChart({ year:1984, month:1, day:1, hour:12, minute:0,
 *                              gender:'M', targetYear:2026 }, { Solar });
 *
 * 用法（瀏覽器）：載入 lunar.js 之後
 *   ZiweiEngine.buildChart(inputs, { Solar: window.Solar })
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ZiweiEngine = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TIAN_GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
  const DI_ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  const PALACE_NAMES_SEQ = ['命宮', '兄弟', '夫妻', '子女', '財帛', '疾厄',
                            '遷移', '交友', '官祿', '田宅', '福德', '父母'];

  const SI_HUA = {
    '甲': { lu: '廉貞', quan: '破軍', ke: '武曲', ji: '太陽' },
    '乙': { lu: '天機', quan: '天梁', ke: '紫微', ji: '太陰' },
    '丙': { lu: '天同', quan: '天機', ke: '文昌', ji: '廉貞' },
    '丁': { lu: '太陰', quan: '天同', ke: '天機', ji: '巨門' },
    '戊': { lu: '貪狼', quan: '太陰', ke: '右弼', ji: '天機' },
    '己': { lu: '武曲', quan: '貪狼', ke: '天梁', ji: '文曲' },
    '庚': { lu: '太陽', quan: '武曲', ke: '太陰', ji: '天同' },
    '辛': { lu: '巨門', quan: '太陽', ke: '文曲', ji: '文昌' },
    '壬': { lu: '天梁', quan: '紫微', ke: '左輔', ji: '武曲' },
    '癸': { lu: '破軍', quan: '巨門', ke: '太陰', ji: '貪狼' }
  };

  // 六十甲子納音所屬之局數（2水 3木 4金 5土 6火）
  const NA_YIN_ELEMENTS = [
    4, 4, 6, 6, 3, 3, 5, 5, 4, 4, 6, 6, 2, 2, 5, 5, 4, 4, 3, 3,
    2, 2, 5, 5, 6, 6, 3, 3, 2, 2, 4, 4, 6, 6, 3, 3, 5, 5, 4, 4,
    6, 6, 2, 2, 5, 5, 4, 4, 3, 3, 2, 2, 5, 5, 6, 6, 3, 3, 2, 2
  ];

  const FIVE_ELEMENTS = {
    2: { name: '水二局', startAge: 2, element: '水' },
    3: { name: '木三局', startAge: 3, element: '木' },
    4: { name: '金四局', startAge: 4, element: '金' },
    5: { name: '土五局', startAge: 5, element: '土' },
    6: { name: '火六局', startAge: 6, element: '火' }
  };

  // 子時以 23:00 為界，子1…亥12 之索引（子=0）
  const getZhiIndexFromHour = (hour) =>
    (typeof hour !== 'number' || isNaN(hour)) ? 0
      : (hour >= 23 || hour < 1) ? 0
      : Math.floor((hour + 1) / 2);

  // 五虎遁：甲己之年丙作首…求寅宮天干
  const getYinPalaceGanIndex = (yearGanIdx) => (2 + (yearGanIdx % 5) * 2) % 10;

  // 依命宮干支查六十甲子納音，得五行局
  const getBureau = (mingGanIdx, mingZhiIdx) => {
    for (let i = 0; i < 60; i++) {
      if ((i % 10) === mingGanIdx && (i % 12) === mingZhiIdx) return NA_YIN_ELEMENTS[i];
    }
    return 2;
  };

  const getZiweiPos = (bureau, day) => {
    const X = (day % bureau === 0) ? 0 : bureau - (day % bureau);
    const Q = (day + X) / bureau;
    const posIndex = (2 + Q - 1) % 12;
    if (X === 0) return posIndex;
    return (X % 2 !== 0) ? (posIndex - X + 12) % 12 : (posIndex + X) % 12;
  };

  const TIANFU_MAP = { 0: 4, 1: 3, 2: 2, 3: 1, 4: 0, 5: 11,
                       6: 10, 7: 9, 8: 8, 9: 7, 10: 6, 11: 5 };
  const getTianfuPos = (zwPos) => TIANFU_MAP[zwPos];

  // 三方四正：本宮、對宮、三合兩宮
  const getRelatedPalaces = (index) => [index, (index + 6) % 12, (index + 4) % 12, (index + 8) % 12];

  // —— 安星表（口訣皆註於後，便於逐條覆按）——
  // 祿存：甲祿在寅、乙卯、丙戊巳、丁己午、庚申、辛酉、壬亥、癸子
  const LU_CUN_POS = [2, 3, 5, 6, 5, 6, 8, 9, 11, 0];
  // 魁鉞：甲戊庚牛羊、乙己鼠猴、丙丁豬雞、辛逢馬虎、壬癸兔蛇
  const KUI_POS = [1, 0, 11, 11, 1, 0, 1, 6, 3, 3];
  const YUE_POS = [7, 8, 9, 9, 7, 8, 7, 2, 5, 5];
  // 火鈴：寅午戌起丑、申子辰起寅、巳酉丑起卯、亥卯未起酉；鈴星寅午戌起卯、餘起戌
  const FIRE_START = { 0: 2, 1: 3, 2: 1, 3: 9 };
  const BELL_START = { 0: 10, 1: 10, 2: 3, 3: 10 };
  // 天馬：申子辰馬在寅、巳酉丑在亥、寅午戌在申、亥卯未在巳
  const MA_POS = { 0: 2, 1: 11, 2: 8, 3: 5 };

  const ZW_SERIES = [['紫微', 0], ['天機', 1], ['太陽', 3], ['武曲', 4], ['天同', 5], ['廉貞', 8]];
  const TF_SERIES = [['天府', 0], ['太陰', 1], ['貪狼', 2], ['巨門', 3],
                     ['天相', 4], ['天梁', 5], ['七殺', 6], ['破軍', 10]];

  const HUA_KEYS = [['lu', '祿'], ['quan', '權'], ['ke', '科'], ['ji', '忌']];

  const mod12 = (n) => ((n % 12) + 12) % 12;

  /**
   * 排盤。
   * @param inputs  {year, month, day, hour, minute, gender:'M'|'F', targetYear}
   *                year/month/day 為**國曆**；hour 為 0–23。
   * @param deps    {Solar}  lunar-javascript 的 Solar
   * @returns 盤面資料。不含顏色、不含斷語。
   */
  function buildChart(inputs, deps) {
    const Solar = deps && deps.Solar;
    if (!Solar) throw new Error('buildChart 需要注入 lunar-javascript 的 Solar');

    const year = parseInt(inputs.year, 10);
    const hour = parseInt(inputs.hour, 10) || 0;
    const minute = parseInt(inputs.minute, 10) || 0;
    const targetYear = parseInt(inputs.targetYear, 10);

    let solar = Solar.fromYmdHms(year, inputs.month, inputs.day, hour, minute, 0);
    // 晚子時換日：過了夜間十一點即算次日（倪師法）
    if (hour >= 23) solar = solar.next(1);
    const lunar = solar.getLunar();

    const lunarYearGanZhi = lunar.getYearInGanZhi();
    const bazi = {
      yearGanZhi: lunar.getYearInGanZhiExact(),
      monthGanZhi: lunar.getMonthInGanZhiExact(),
      dayGanZhi: lunar.getDayInGanZhiExact(),
      timeGanZhi: lunar.getTimeInGanZhi(),
      lunarYearGan: lunarYearGanZhi.charAt(0),
      lunarYearZhi: lunarYearGanZhi.charAt(1)
    };

    // 閏月折算（紫微斗數全書法）：閏月上半月作本月、下半月作次月
    let lunarMonth = lunar.getMonth();
    const lunarDay = lunar.getDay();
    if (lunarMonth < 0) {
      lunarMonth = -lunarMonth + (lunarDay > 15 ? 1 : 0);
      if (lunarMonth > 12) lunarMonth = 1;
    }

    const timeZhiIdx = getZhiIndexFromHour(hour);
    // 年干支統一以農曆正月初一為界——干與支同源，不可一者用立春一者用春節
    const yearGanIdx = TIAN_GAN.indexOf(bazi.lunarYearGan);
    const yearZhiIdx = DI_ZHI.indexOf(bazi.lunarYearZhi);

    const mingPos = mod12(2 + (lunarMonth - 1) - timeZhiIdx);
    const shenPos = mod12(2 + (lunarMonth - 1) + timeZhiIdx);

    const startGanIdx = getYinPalaceGanIndex(yearGanIdx);
    const palaces = [];
    for (let i = 0; i < 12; i++) {
      const palaceNameIdx = mod12(mingPos - i);
      const distFromYin = mod12(i - 2);
      palaces[i] = {
        id: i,
        name: PALACE_NAMES_SEQ[palaceNameIdx],
        gan: TIAN_GAN[(startGanIdx + distFromYin) % 10],
        zhi: DI_ZHI[i],
        isMing: i === mingPos,
        isShen: i === shenPos,
        stars: [],
        dayun: '',
        isLiuNian: false
      };
    }

    const mingGanIdx = TIAN_GAN.indexOf(palaces[mingPos].gan);
    const bureauVal = getBureau(mingGanIdx, mingPos);
    const bureauInfo = FIVE_ELEMENTS[bureauVal];

    // 大限：陽男陰女順行，陰男陽女逆行
    const age = targetYear - year + 1;
    const isYangYear = (yearGanIdx % 2 === 0);
    const isMale = (inputs.gender === 'M');
    const isClockwise = (isYangYear === isMale);

    let currentDayunIdx = -1;
    for (let k = 0; k < 12; k++) {
      const startAge = bureauInfo.startAge + (k * 10);
      const endAge = startAge + 9;
      const targetIdx = mod12(isClockwise ? (mingPos + k) : (mingPos - k));
      palaces[targetIdx].dayun = `${startAge}-${endAge}`;
      if (age >= startAge && age <= endAge) currentDayunIdx = targetIdx;
    }
    const prevDayunIdx = currentDayunIdx === -1 ? -1
      : mod12(isClockwise ? currentDayunIdx - 1 : currentDayunIdx + 1);

    const targetZhiIdx = mod12(targetYear - 4);
    palaces[targetZhiIdx].isLiuNian = true;

    // —— 安主星 ——
    const zwPos = getZiweiPos(bureauVal, lunarDay);
    const tfPos = getTianfuPos(zwPos);
    const push = (pos, name, series) => palaces[mod12(pos)].stars.push({ name, series });

    ZW_SERIES.forEach(([name, off]) => push(zwPos - off, name, '紫微系'));
    TF_SERIES.forEach(([name, off]) => push(tfPos + off, name, '天府系'));

    // —— 安吉星、煞星 ——
    const luCun = LU_CUN_POS[yearGanIdx];
    push(luCun, '祿存', '吉');
    push(luCun + 1, '擎羊', '煞');
    push(luCun - 1, '陀羅', '煞');
    push(KUI_POS[yearGanIdx], '天魁', '吉');
    push(YUE_POS[yearGanIdx], '天鉞', '吉');
    push(10 - timeZhiIdx, '文昌', '吉');           // 昌戌起子逆行
    push(4 + timeZhiIdx, '文曲', '吉');            // 曲辰起子順行
    push(4 + (lunarMonth - 1), '左輔', '吉');      // 輔辰起正月順
    push(10 - (lunarMonth - 1), '右弼', '吉');     // 弼戌起正月逆
    push(11 + timeZhiIdx, '地劫', '煞');           // 亥起子時，劫順
    push(11 - timeZhiIdx, '地空', '煞');           // 亥起子時，空逆

    const zhiGroup = yearZhiIdx % 4;               // 0申子辰 1巳酉丑 2寅午戌 3亥卯未
    push(FIRE_START[zhiGroup] + timeZhiIdx, '火星', '煞');
    push(BELL_START[zhiGroup] + timeZhiIdx, '鈴星', '煞');
    push(MA_POS[zhiGroup], '天馬', '吉');

    // —— 四化：生年四化 hua、流年四化 liuHua ——
    const targetYearGan = TIAN_GAN[mod10(targetYear - 4)];
    const natalHua = SI_HUA[TIAN_GAN[yearGanIdx]];
    const liuNianHua = SI_HUA[targetYearGan];
    palaces.forEach(p => p.stars.forEach(s => {
      HUA_KEYS.forEach(([k, label]) => {
        if (natalHua && natalHua[k] === s.name) s.hua = label;
        if (liuNianHua && liuNianHua[k] === s.name) s.liuHua = label;
      });
    }));

    return {
      inputs: { year, month: inputs.month, day: inputs.day, hour, minute,
                gender: inputs.gender, targetYear },
      bazi,
      lunar: { month: lunarMonth, day: lunarDay, isLeap: lunar.getMonth() < 0 },
      mingPos, shenPos,
      bureau: { value: bureauVal, name: bureauInfo.name, element: bureauInfo.element,
                startAge: bureauInfo.startAge },
      direction: isClockwise ? '順行' : '逆行',
      age,
      zwPos, tfPos,
      currentDayunIdx, prevDayunIdx,
      liuNianIdx: targetZhiIdx,
      palaces
    };
  }

  function mod10(n) { return ((n % 10) + 10) % 10; }

  /** 取某宮所有星名，供測試與文字輸出用 */
  function starsOf(chart, palaceName) {
    const p = chart.palaces.find(x => x.name === palaceName);
    return p ? p.stars.map(s => s.name) : [];
  }

  /** 依地支取宮 */
  function palaceAtZhi(chart, zhi) {
    return chart.palaces[DI_ZHI.indexOf(zhi)];
  }

  return {
    buildChart, starsOf, palaceAtZhi, getRelatedPalaces,
    getZhiIndexFromHour, getYinPalaceGanIndex, getBureau, getZiweiPos, getTianfuPos,
    TIAN_GAN, DI_ZHI, PALACE_NAMES_SEQ, SI_HUA, FIVE_ELEMENTS, NA_YIN_ELEMENTS,
    LU_CUN_POS, KUI_POS, YUE_POS, FIRE_START, BELL_START, MA_POS
  };
}));
