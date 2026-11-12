'use strict';
/* ================================================================
 * mvu.js — 简化版 MVU 变量同步系统
 * 挂载在 iframe 的 window 上，与 index.html / phone.html 对接
 * 无外部依赖，纯前端运行
 * ================================================================ */

(function () {

  /* ---------- 1. 默认变量结构 ---------- */
  function defaultMvu() {
    const fav = {};
    (state.characters || []).forEach(c => {
      if (c && c.name) fav[c.name] = 0;
    });
    return {
      "基础信息": {
        "日期": { "年": 3000, "月": 1, "日": 1 },
        "当前地点": state.place || "",
        "在场人物": {}
      },
      "财富": { "金币": 0 },
      "好感度": fav,
      "主线进度": { "碎片": 0 },
      "世界状态": { "花粉机制": { "已解决": false } }
    };
  }

  /* ---------- 2. 初始化 / 补全 ---------- */
  function mvuInitDefault() {
    if (!state.mvu || typeof state.mvu !== 'object') {
      state.mvu = defaultMvu();
    } else {
      const d = defaultMvu();
      for (const k in d) if (!state.mvu[k]) state.mvu[k] = d[k];
      if (!state.mvu['基础信息']) state.mvu['基础信息'] = d['基础信息'];
      if (!state.mvu['基础信息']['日期']) state.mvu['基础信息']['日期'] = d['基础信息']['日期'];
      if (!state.mvu['好感度']) state.mvu['好感度'] = d['好感度'];
      (state.characters || []).forEach(c => {
        if (c && c.name && state.mvu['好感度'][c.name] === undefined) {
          state.mvu['好感度'][c.name] = 0;
        }
      });
    }
  }

  /* ---------- 3. 生成提示词 ---------- */
  function mvuBuildPrompt() {
    if (!state.settings || !state.settings.enableMVU) return '';
    mvuInitDefault();
    return `
【当前世界变量】
${JSON.stringify(state.mvu, null, 2)}

【硬性要求】正文结束后必须输出以下块：
<UpdateVariable>
<Analysis>简要说明本轮变量变化（不显示给玩家）</Analysis>
<JSONPatch>
[
  { "op": "replace", "path": "/基础信息/当前地点", "value": "新地点" },
  { "op": "delta",   "path": "/好感度/角色名",     "value": 2 },
  { "op": "replace", "path": "/基础信息/日期/日",   "value": 6 }
]
</JSONPatch>
</UpdateVariable>

规则：
- 只对本轮明确变化的字段输出指令；没有变化可输出空数组 []
- 好感度范围 -20 ~ 100，越界会被自动修正
- 日期按 30 天进 1 月、12 月进 1 年自动进位
- 只读字段：以 "_" 开头的字段禁止输出（如 "_修改设定"）
`;
  }

  /* ---------- 4. 从 AI 回复中提取 Patch ---------- */
  function mvuParseFromReply(text) {
    if (!text) return [];
    const m = text.match(/<UpdateVariable>[\s\S]*?<JSONPatch>([\s\S]*?)<\/JSONPatch>[\s\S]*?<\/UpdateVariable>/);
    if (!m) return [];
    try {
      const arr = JSON.parse(m[1]);
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      console.warn('[mvu] JSONPatch 解析失败', e);
      return [];
    }
  }

  /* ---------- 5. 从正文中剥离变量块 ---------- */
  function mvuStripVariableBlocks(text) {
    if (!text) return text;
    return text
      .replace(/<UpdateVariable>[\s\S]*?<\/UpdateVariable>/g, '')
      .replace(/<Analysis>[\s\S]*?<\/Analysis>/g, '')
      .trim();
  }

  /* ---------- 6. 路径工具 ---------- */
  function getByPath(obj, keys) {
    let cur = obj;
    for (let i = 0; i < keys.length; i++) {
      if (cur == null) return undefined;
      cur = cur[keys[i]];
    }
    return cur;
  }
  function ensurePath(obj, keys) {
    let cur = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!cur[keys[i]] || typeof cur[keys[i]] !== 'object') cur[keys[i]] = {};
      cur = cur[keys[i]];
    }
    return cur;
  }

  /* ---------- 7. 应用 Patch ---------- */
  function mvuApplyPatch(patches) {
    if (!Array.isArray(patches) || !patches.length) return;
    mvuInitDefault();

    for (const p of patches) {
      try {
        if (!p || !p.op || !p.path) continue;
        const keys = String(p.path).replace(/^\//, '').split('/');
        const lastKey = keys[keys.length - 1];

        // 只读字段保护：以 _ 开头
        if (String(lastKey).startsWith('_')) {
          console.warn('[mvu] 拒绝更新只读字段:', p.path);
          continue;
        }

        if (p.op === 'replace' || p.op === 'insert') {
          const parent = ensurePath(state.mvu, keys);
          parent[lastKey] = p.value;

        } else if (p.op === 'delta') {
          const parent = ensurePath(state.mvu, keys);
          parent[lastKey] = (Number(parent[lastKey]) || 0) + (Number(p.value) || 0);
          // 好感度范围修正
          if (keys[0] === '好感度') {
            parent[lastKey] = Math.max(-20, Math.min(100, parent[lastKey]));
          }
          // 金币不能为负
          if (keys[0] === '财富' && lastKey === '金币') {
            parent[lastKey] = Math.max(0, parent[lastKey]);
          }

        } else if (p.op === 'remove') {
          const parent = ensurePath(state.mvu, keys);
          delete parent[lastKey];

        } else if (p.op === 'move' && p.from) {
          const fk = String(p.from).replace(/^\//, '').split('/');
          const val = getByPath(state.mvu, fk);
          const parent = ensurePath(state.mvu, keys);
          parent[lastKey] = val;
        }
      } catch (e) {
        console.warn('[mvu] patch 应用失败', p, e);
      }
    }

    // 日期自动进位（30 天 → 1 月，12 月 → 1 年）
    try {
      const d = state.mvu['基础信息'] && state.mvu['基础信息']['日期'];
      if (d) {
        let { 年, 月, 日 } = d;
        年 = Number(年) || 3000;
        月 = Number(月) || 1;
        日 = Number(日) || 1;
        while (日 > 30) { 日 -= 30; 月 += 1; }
        while (月 > 12) { 月 -= 12; 年 += 1; }
        while (日 < 1)  { 日 += 30; 月 -= 1; }
        while (月 < 1)  { 月 += 12; 年 -= 1; }
        d['年'] = 年; d['月'] = 月; d['日'] = 日;
      }
    } catch (e) { /* 忽略 */ }

    if (typeof persist === 'function') persist();
  }

  /* ---------- 8. 暴露到 window（供 index.html / phone.html 调用） ---------- */
  function expose() {
    window.mvuBuildPrompt = mvuBuildPrompt;
    window.mvuParseFromReply = mvuParseFromReply;
    window.mvuApplyPatch = mvuApplyPatch;
    window.mvuStripVariableBlocks = mvuStripVariableBlocks;
    window.mvuInitDefault = mvuInitDefault;
    window.mvuGet = () => state.mvu;
  }

  /* ---------- 9. 启动：等待 state 就绪 ---------- */
  let tried = 0;
  function boot() {
    if (typeof state !== 'object' || !state) {
      if (++tried > 100) { console.error('[mvu] 等待 state 超时'); return; }
      return setTimeout(boot, 100);
    }
    mvuInitDefault();
    expose();
    if (typeof persist === 'function') persist();
    console.log('[mvu] 初始化完成，当前变量：', JSON.parse(JSON.stringify(state.mvu)));
  }
  boot();

})();
