import React, { useState, useMemo, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';

// --- 初期データ定義 ---
const INITIAL_CONFIG = {
  dates: ["12/25(木)", "12/26(金)", "12/27(土)", "1/4(日)", "1/6(火)", "1/7(水)"],
  periods: ["1限 (13:00~)", "2限 (14:10~)", "3限 (15:20~)"],
  classes: ["Sクラス", "Aクラス", "Bクラス", "Cクラス"],
  subjects: ["英語", "数学", "国語", "理科", "社会"],
  subjectCounts: { "英語": 4, "数学": 4, "国語": 3, "理科": 4, "社会": 3 },
  
  teachers: [
    { name: "堀上", subjects: ["英語"], ngSlots: [], ngClasses: [] },
    { name: "石原", subjects: ["英語"], ngSlots: [], ngClasses: [] },
    { name: "高松", subjects: ["英語"], ngSlots: [], ngClasses: [] },
    { name: "南條", subjects: ["英語"], ngSlots: [], ngClasses: [] },
    { name: "片岡", subjects: ["数学"], ngSlots: [], ngClasses: [] },
    { name: "半田", subjects: ["数学"], ngSlots: [], ngClasses: [] },
    { name: "香川", subjects: ["数学"], ngSlots: [], ngClasses: [] },
    { name: "江本", subjects: ["数学"], ngSlots: [], ngClasses: [] },
    { name: "河野", subjects: ["数学"], ngSlots: [], ngClasses: [] },
    { name: "杉原", subjects: ["数学"], ngSlots: [], ngClasses: [] },
    { name: "奥村", subjects: ["数学"], ngSlots: [], ngClasses: [] },
    { name: "小松", subjects: ["国語"], ngSlots: [], ngClasses: [] },
    { name: "松川", subjects: ["国語"], ngSlots: [], ngClasses: [] },
    { name: "三宮", subjects: ["理科"], ngSlots: [], ngClasses: [] },
    { name: "滝澤", subjects: ["理科"], ngSlots: [], ngClasses: [] },
    { name: "井上", subjects: ["社会"], ngSlots: [], ngClasses: [] },
    { name: "野口", subjects: ["社会"], ngSlots: [], ngClasses: [] },
    { name: "未定", subjects: ["英語", "数学", "国語", "理科", "社会"], ngSlots: [], ngClasses: [] }
  ],
  externalCounts: {}
};

const SUBJECT_COLORS = {
  "英語": "bg-red-100",
  "数学": "bg-blue-100",
  "国語": "bg-yellow-100",
  "理科": "bg-green-100",
  "社会": "bg-purple-100"
};

const toCircleNum = (num) => {
  const circles = ["0", "①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩", "⑪", "⑫", "⑬", "⑭", "⑮", "⑯", "⑰", "⑱", "⑲", "⑳"];
  return circles[num] || `(${num})`;
};

const STORAGE_KEY_SCHEDULE = 'winter_schedule_data';
const STORAGE_KEY_CONFIG = 'winter_schedule_config';

export default function ScheduleApp() {
  const [schedule, setSchedule] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY_SCHEDULE);
    return saved ? JSON.parse(saved) : {};
  });
  const [config, setConfig] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY_CONFIG);
    const parsed = saved ? JSON.parse(saved) : INITIAL_CONFIG;
    if (!parsed.externalCounts) parsed.externalCounts = {};
    return parsed;
  });

  const [history, setHistory] = useState([{}]);
  const [historyIndex, setHistoryIndex] = useState(0);
  
  const [showConfig, setShowConfig] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [editingNgIndex, setEditingNgIndex] = useState(null);
  
  const [showExternalLoad, setShowExternalLoad] = useState(false);

  const [generatedPatterns, setGeneratedPatterns] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [saveStatus, setSaveStatus] = useState("✅ 自動保存済み");
  const [highlightTeacher, setHighlightTeacher] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [clipboard, setClipboard] = useState(null);
  const [isCompact, setIsCompact] = useState(false);
  const [dragSource, setDragSource] = useState(null);

  const fileInputRef = useRef(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SCHEDULE, JSON.stringify(schedule));
    setSaveStatus("💾 保存中...");
    const timer = setTimeout(() => setSaveStatus("✅ 自動保存済み"), 800);
    return () => clearTimeout(timer);
  }, [schedule]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(config));
  }, [config]);

  const updateScheduleWithHistory = (newSchedule) => {
    const nextHistory = history.slice(0, historyIndex + 1);
    nextHistory.push(newSchedule);
    if (nextHistory.length > 50) nextHistory.shift();
    setHistory(nextHistory);
    setHistoryIndex(nextHistory.length - 1);
    setSchedule(newSchedule);
  };

  const undo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setSchedule(history[historyIndex - 1]);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setSchedule(history[historyIndex + 1]);
    }
  };

  useEffect(() => {
    if (history.length === 1 && Object.keys(history[0]).length === 0 && Object.keys(schedule).length > 0) {
      setHistory([schedule]);
      setHistoryIndex(0);
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [history, historyIndex]);

  const handleCellNavigation = (e, dIndex, pIndex, cIndex, type) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
      let nextD = dIndex, nextP = pIndex, nextC = cIndex, nextType = type;
      if (e.key === 'ArrowUp') { if (pIndex > 0) nextP--; else if (dIndex > 0) { nextD--; nextP = config.periods.length - 1; } }
      else if (e.key === 'ArrowDown') { if (pIndex < config.periods.length - 1) nextP++; else if (dIndex < config.dates.length - 1) { nextD++; nextP = 0; } }
      else if (e.key === 'ArrowLeft') { if (type === 'teacher') nextType = 'subject'; else if (cIndex > 0) { nextC--; nextType = 'teacher'; } }
      else if (e.key === 'ArrowRight') { if (type === 'subject') nextType = 'teacher'; else if (cIndex < config.classes.length - 1) { nextC++; nextType = 'subject'; } }
      const nextElement = document.getElementById(`select-${nextD}-${nextP}-${nextC}-${nextType}`);
      if (nextElement) nextElement.focus();
    }
  };

  const handleDragStart = (e, key, data) => {
    if (data.locked || !data.subject) { e.preventDefault(); return; }
    setDragSource({ key, data });
    e.dataTransfer.effectAllowed = "move";
    e.target.style.opacity = '0.5';
  };
  const handleDragEnd = (e) => { e.target.style.opacity = '1'; setDragSource(null); };
  const handleDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; };
  const handleDrop = (e, targetKey, targetData) => {
    e.preventDefault();
    if (!dragSource || dragSource.key === targetKey || targetData.locked) return;
    const newSchedule = { ...schedule };
    newSchedule[dragSource.key] = { ...targetData, locked: false }; 
    newSchedule[targetKey] = { ...dragSource.data, locked: false };
    updateScheduleWithHistory(newSchedule);
  };

  const handleContextMenu = (e, date, period, cls, headerType = null, headerValue = null) => {
    e.preventDefault();
    setContextMenu({ x: e.pageX, y: e.pageY, date, period, cls, headerType, headerValue });
  };

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  const handleMenuAction = (action) => {
    if (!contextMenu) return;
    if (contextMenu.headerType) {
      const { headerType, headerValue } = contextMenu;
      const newSchedule = { ...schedule };
      let updated = false;
      config.dates.forEach(d => {
        config.periods.forEach(p => {
          config.classes.forEach(c => {
            let isTarget = false;
            if (headerType === 'date' && d === headerValue) isTarget = true;
            if (headerType === 'class' && c === headerValue) isTarget = true;
            if (headerType === 'period' && p === headerValue) isTarget = true;
            if (isTarget) {
              const k = `${d}-${p}-${c}`;
              if (!newSchedule[k]) newSchedule[k] = {};
              if (action === 'lock-all') { newSchedule[k].locked = true; updated = true; }
              if (action === 'unlock-all') { newSchedule[k].locked = false; updated = true; }
              if (action === 'clear-all' && !newSchedule[k].locked) { delete newSchedule[k]; updated = true; }
            }
          });
        });
      });
      if (updated) updateScheduleWithHistory(newSchedule);
      setContextMenu(null);
      return;
    }
    const { date, period, cls } = contextMenu;
    const key = `${date}-${period}-${cls}`;
    const current = schedule[key] || {};
    if (action === 'copy') { if (current.subject) setClipboard({ subject: current.subject, teacher: current.teacher }); }
    else if (action === 'paste') { if (clipboard && !current.locked) { const newSchedule = { ...schedule }; newSchedule[key] = { ...current, subject: clipboard.subject, teacher: clipboard.teacher }; updateScheduleWithHistory(newSchedule); } }
    else if (action === 'lock') toggleLock(date, period, cls);
    else if (action === 'clear') { if (!current.locked) { const newSchedule = { ...schedule }; delete newSchedule[key]; updateScheduleWithHistory(newSchedule); } }
    setContextMenu(null);
  };

  const handleExternalCountChange = (date, teacherName, value) => {
    const key = `${date}-${teacherName}`;
    const count = parseInt(value) || 0;
    setConfig(prev => ({ ...prev, externalCounts: { ...prev.externalCounts, [key]: count } }));
  };

  const handleAssign = (date, period, className, type, value) => {
    const key = `${date}-${period}-${className}`;
    if (schedule[key]?.locked) return;
    const newSchedule = { ...schedule };
    if (!newSchedule[key]) newSchedule[key] = {};
    if (type === 'subject') newSchedule[key] = { ...newSchedule[key], subject: value, teacher: "" };
    else newSchedule[key] = { ...newSchedule[key], [type]: value };
    updateScheduleWithHistory(newSchedule);
  };

  const toggleLock = (date, period, className) => {
    const key = `${date}-${period}-${className}`;
    const newSchedule = { ...schedule };
    if (!newSchedule[key]) newSchedule[key] = {};
    newSchedule[key] = { ...newSchedule[key], locked: !newSchedule[key].locked };
    updateScheduleWithHistory(newSchedule);
  };

  const handleClearUnlocked = () => {
    if (!window.confirm("ロックされていないコマを全て削除しますか？")) return;
    const newSchedule = {};
    Object.keys(schedule).forEach(key => { if (schedule[key].locked) newSchedule[key] = schedule[key]; });
    updateScheduleWithHistory(newSchedule);
  };

  const handleResetAll = () => {
    if (!window.confirm("【警告】全データを消去しますか？")) return;
    localStorage.removeItem(STORAGE_KEY_SCHEDULE);
    localStorage.removeItem(STORAGE_KEY_CONFIG);
    setSchedule({}); setConfig(INITIAL_CONFIG); setHistory([{}]); setHistoryIndex(0);
    alert("初期化しました。");
  };

  const applyPattern = (pattern) => { updateScheduleWithHistory(pattern); setGeneratedPatterns([]); alert("適用しました！"); };
  const handleLoadJson = (event) => { 
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader(); reader.onload = (e) => { try { const data = JSON.parse(e.target.result); if (data.config && data.schedule) { setConfig({ ...data.config, subjectCounts: data.config.subjectCounts || INITIAL_CONFIG.subjectCounts }); updateScheduleWithHistory(data.schedule); alert("読込完了"); } } catch (e) { alert("読込エラー"); } }; reader.readAsText(file); event.target.value = '';
  };
  const handleListConfigChange = (k, v) => setConfig(p => ({ ...p, [k]: v.split(',').map(s => s.trim()).filter(s => s) }));
  const handleSubjectCountChange = (s, c) => setConfig(p => ({ ...p, subjectCounts: { ...p.subjectCounts, [s]: parseInt(c) || 0 } }));
  const addTeacher = () => { const n = prompt("名前:"); if (n) setConfig(p => ({ ...p, teachers: [...p.teachers, { name: n, subjects: [], ngSlots: [], ngClasses: [] }] })); };
  const toggleTeacherSubject = (i, s) => setConfig(p => { const t = [...p.teachers]; if (t[i].subjects.includes(s)) t[i].subjects = t[i].subjects.filter(v => v !== s); else t[i].subjects.push(s); return { ...p, teachers: t }; });
  const toggleTeacherNgClass = (i, c) => setConfig(p => { const t = [...p.teachers]; if (!t[i].ngClasses) t[i].ngClasses=[]; if(t[i].ngClasses.includes(c)) t[i].ngClasses=t[i].ngClasses.filter(v=>v!==c); else t[i].ngClasses.push(c); return { ...p, teachers: t }; });
  const toggleTeacherNg = (i, d, pd) => setConfig(p => { const t = [...p.teachers]; const k=`${d}-${pd}`; if (!t[i].ngSlots) t[i].ngSlots=[]; if(t[i].ngSlots.includes(k)) t[i].ngSlots=t[i].ngSlots.filter(v=>v!==k); else t[i].ngSlots.push(k); return { ...p, teachers: t }; });
  const removeTeacher = (i) => { if(window.confirm("削除しますか？")) setConfig(p => ({ ...p, teachers: p.teachers.filter((_, idx) => idx !== i) })); };

  // 分析
  const analysis = useMemo(() => {
    const conflictMap = {}; const subjectOrders = {}; const dailySubjectMap = {};
    const teacherDailyCounts = {};
    const errorKeys = [];
    const sortedKeys = [];
    config.dates.forEach(d => config.periods.forEach(p => config.classes.forEach(c => sortedKeys.push({ d, p, c, key: `${d}-${p}-${c}` }))));
    config.classes.forEach(c => {
      const counts = {};
      sortedKeys.filter(k => k.c === c).forEach(({ d, p, key }) => {
        const e = schedule[key];
        if (!e || !e.subject) return;
        counts[e.subject] = (counts[e.subject] || 0) + 1;
        subjectOrders[key] = counts[e.subject];
        const dk = `${c}-${d}-${e.subject}`;
        dailySubjectMap[dk] = (dailySubjectMap[dk] || 0) + 1;
      });
    });
    config.dates.forEach(d => {
      config.teachers.forEach(t => {
        const ext = config.externalCounts?.[`${d}-${t.name}`] || 0;
        teacherDailyCounts[`${d}-${t.name}`] = { current: 0, external: ext, total: ext };
      });
      config.periods.forEach(p => {
        const tc = {};
        config.classes.forEach(c => { 
          const t = schedule[`${d}-${p}-${c}`]?.teacher; 
          if (t && t !== "未定") {
            tc[t] = (tc[t] || 0) + 1; 
            const dayKey = `${d}-${t}`;
            if(!teacherDailyCounts[dayKey]) teacherDailyCounts[dayKey] = { current: 0, external: 0, total: 0 };
            teacherDailyCounts[dayKey].current += 1;
            teacherDailyCounts[dayKey].total += 1;
          }
        });
        Object.keys(tc).forEach(t => { 
          if (tc[t] > 1) {
            conflictMap[`${d}-${p}-${t}`] = true; 
            config.classes.forEach(c => { if (schedule[`${d}-${p}-${c}`]?.teacher === t) errorKeys.push(`${d}-${p}-${c}`); });
          }
        });
      });
    });
    return { conflictMap, subjectOrders, dailySubjectMap, errorKeys, teacherDailyCounts };
  }, [schedule, config]);

  const dashboard = useMemo(() => {
    const totalRequired = Object.values(config.subjectCounts).reduce((a, b) => a + b, 0) * config.classes.length;
    let filledCount = 0;
    Object.values(schedule).forEach(v => { if(v.subject) filledCount++; });
    const progress = totalRequired > 0 ? Math.round((filledCount / totalRequired) * 100) : 0;
    return { progress, filledCount, totalRequired };
  }, [schedule, config]);

  const scrollToFirstError = () => {
    if (analysis.errorKeys.length > 0) {
      const element = document.getElementById(analysis.errorKeys[0]);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.classList.add("ring-4", "ring-red-500");
        setTimeout(() => element.classList.remove("ring-4", "ring-red-500"), 1000);
      }
    }
  };

  const SummaryTable = ({ targetSchedule }) => {
    const summary = {};
    config.classes.forEach(cls => { summary[cls] = {}; config.subjects.forEach(subj => summary[cls][subj] = {}); });
    const teacherTotals = {};
    config.teachers.forEach(t => teacherTotals[t.name] = { current: 0, external: 0 });
    config.dates.forEach(d => { config.teachers.forEach(t => { const ext = config.externalCounts?.[`${d}-${t.name}`] || 0; teacherTotals[t.name].external += ext; }); });
    Object.keys(targetSchedule).forEach(key => {
      const entry = targetSchedule[key];
      if (entry && entry.subject && entry.teacher) {
        const cls = config.classes.find(c => key.includes(c));
        if (cls && summary[cls][entry.subject]) {
          summary[cls][entry.subject][entry.teacher] = (summary[cls][entry.subject][entry.teacher] || 0) + 1;
          if(teacherTotals[entry.teacher]) teacherTotals[entry.teacher].current += 1;
        }
      }
    });
    const sortedTeachers = Object.entries(teacherTotals).filter(([_, val]) => (val.current + val.external) > 0).sort((a, b) => (b[1].current + b[1].external) - (a[1].current + a[1].external));
    const maxCount = sortedTeachers.length > 0 ? (sortedTeachers[0][1].current + sortedTeachers[0][1].external) : 1;

    return (
      <div className="flex flex-col gap-6">
        <div className="bg-white p-4 rounded shadow border border-gray-300">
          <h3 className="font-bold text-gray-700 mb-3 border-b pb-2 flex justify-between">
            <span>📊 講師別 担当コマ数 (青:今回 / 灰:他学年)</span><span className="text-xs text-gray-500">※クリックでハイライト</span>
          </h3>
          <div className="space-y-2">
            {sortedTeachers.map(([name, counts]) => {
              const total = counts.current + counts.external;
              return (
                <div key={name} className={`flex items-center text-sm cursor-pointer p-1 rounded hover:bg-gray-100 ${highlightTeacher === name ? "bg-yellow-100 ring-2 ring-yellow-400" : ""}`} onClick={() => setHighlightTeacher(highlightTeacher === name ? null : name)}>
                  <div className="w-20 font-bold text-gray-700 text-right pr-2 truncate">{name}</div>
                  <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden flex">
                    <div className="h-full bg-gray-400" style={{ width: `${(counts.external / maxCount) * 100}%` }}></div>
                    <div className={`h-full ${name === "未定" ? "bg-red-400" : "bg-blue-500"}`} style={{ width: `${(counts.current / maxCount) * 100}%` }}></div>
                  </div>
                  <div className="w-16 pl-2 font-bold text-gray-600 text-xs">計{total} <span className="text-gray-400">({counts.external}+{counts.current})</span></div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="overflow-x-auto border border-gray-300 rounded shadow-sm bg-white p-2">
          <table className="w-full text-xs border-collapse">
            <thead><tr className="bg-gray-100 border-b"><th className="p-2 border-r w-20">クラス</th>{config.subjects.map(s => <th key={s} className="p-2 border-r">{s}</th>)}</tr></thead>
            <tbody>
              {config.classes.map(cls => (
                <tr key={cls} className="border-b">
                  <td className="p-2 font-bold bg-gray-50 border-r">{cls}</td>
                  {config.subjects.map(subj => (
                    <td key={subj} className="p-2 border-r align-top">
                      <div className="flex flex-col gap-1">{Object.entries(summary[cls][subj]).map(([t, c]) => <span key={t} className="bg-blue-50 px-1 rounded text-blue-800">{t}×{c}</span>)}</div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const generateSchedule = () => { 
    setIsGenerating(true);
    setTimeout(() => {
      const solutions = []; const slots = [];
      config.dates.forEach(d => config.periods.forEach(p => config.classes.forEach(c => { const k = `${d}-${p}-${c}`; if (!schedule[k] || !schedule[k].subject) slots.push({ d, p, c, k }); })));
      const currentCounts = {};
      config.classes.forEach(c => { currentCounts[c] = {}; config.subjects.forEach(s => currentCounts[c][s] = 0); });
      Object.keys(schedule).forEach(k => { const e = schedule[k]; if (e && e.subject) { const c = config.classes.find(cl => k.includes(cl)); if(c) currentCounts[c][e.subject] = (currentCounts[c][e.subject] || 0) + 1; } });

      let iter = 0; const MAX = 500000;
      const solve = (idx, tempSch, tempCnt) => {
        iter++; if (iter > MAX || solutions.length >= 3) return;
        if (idx >= slots.length) { solutions.push(JSON.parse(JSON.stringify(tempSch))); return; }
        const { d, p, c, k } = slots[idx];
        const sortedSubj = [...config.subjects].sort((a, b) => { const remA = (config.subjectCounts[a]||0) - (tempCnt[c][a]||0); const remB = (config.subjectCounts[b]||0) - (tempCnt[c][b]||0); return remB - remA; });
        for (const s of sortedSubj) {
          if (iter > MAX) return;
          if ((tempCnt[c][s]||0) >= (config.subjectCounts[s]||0)) continue;
          if (config.periods.some(per => tempSch[`${d}-${per}-${c}`]?.subject === s)) continue;
          const validTeachers = config.teachers.filter(t => t.subjects.includes(s) && !t.ngClasses?.includes(c) && !t.ngSlots?.includes(`${d}-${p}`));
          const availableTeachers = validTeachers.filter(t => {
             const ext = config.externalCounts?.[`${d}-${t.name}`] || 0;
             let dayCount = 0;
             config.periods.forEach(per => { config.classes.forEach(cl => { if (tempSch[`${d}-${per}-${cl}`]?.teacher === t.name) dayCount++; }); });
             return (ext + dayCount) < 4; 
          });
          const shuffled = [...availableTeachers].sort(() => Math.random() - 0.5);
          for (const tObj of shuffled) {
            const tName = tObj.name;
            if (config.classes.some(otherC => otherC !== c && tempSch[`${d}-${p}-${otherC}`]?.teacher === tName)) continue;
            tempSch[k] = { subject: s, teacher: tName }; tempCnt[c][s]++;
            solve(idx + 1, tempSch, tempCnt); if (solutions.length >= 3) return;
            delete tempSch[k]; tempCnt[c][s]--;
          }
        }
      };
      solve(0, JSON.parse(JSON.stringify(schedule)), JSON.parse(JSON.stringify(currentCounts)));
      setGeneratedPatterns(solutions); setIsGenerating(false);
      if (solutions.length === 0) alert("条件が厳しすぎます。外部負荷などを確認してください。");
    }, 100);
  };

  const handleDownloadExcel = () => { 
    const headerRow = ["日付", "時限", ...config.classes]; const dataRows = [];
    config.dates.forEach(d => config.periods.forEach(p => { const row = [d, p]; config.classes.forEach(c => { const e = schedule[`${d}-${p}-${c}`]; row.push(e && e.subject ? `${e.subject}\n${e.teacher}` : ""); }); dataRows.push(row); }));
    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);
    ws1['!cols'] = [{ wch: 15 }, { wch: 15 }, ...config.classes.map(() => ({ wch: 20 }))];
    XLSX.utils.book_append_sheet(wb, ws1, "時間割");
    const currentTotals = {}; Object.values(schedule).forEach(e => { if(e.teacher) currentTotals[e.teacher] = (currentTotals[e.teacher]||0)+1; });
    const ws2 = XLSX.utils.aoa_to_sheet([["講師名", "今回担当コマ数"], ...Object.entries(currentTotals).sort((a,b)=>b[1]-a[1])]);
    XLSX.utils.book_append_sheet(wb, ws2, "講師別集計");
    const pRows = []; config.teachers.forEach(t => { if (t.name === "未定") return; const slots = []; config.dates.forEach(d => config.periods.forEach(p => config.classes.forEach(c => { if (schedule[`${d}-${p}-${c}`]?.teacher === t.name) slots.push([d, p, c, schedule[`${d}-${p}-${c}`].subject]); }))); if (slots.length) pRows.push([`■ ${t.name}`], ["日付", "時限", "クラス", "科目"], ...slots, [], []); });
    if (pRows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pRows), "個人別");
    XLSX.writeFile(wb, `時間割_${new Date().toISOString().slice(0,10)}.xlsx`);
  };
  const handleSaveJson = () => { const blob = new Blob([JSON.stringify({ version: 27, config, schedule }, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `schedule_v27.json`; link.click(); };

  const printStyle = `
    @media print {
      @page { size: landscape; margin: 5mm; }
      body { -webkit-print-color-adjust: exact; font-size: 10pt; }
      .no-print { display: none !important; }
      .print-container { max-height: none !important; overflow: visible !important; border: none !important; }
      table { width: 100% !important; border-collapse: collapse !important; }
      th, td { border: 1px solid #000 !important; padding: 2px !important; }
      .sticky { position: static !important; }
    }
  `;

  return (
    <div className="p-4 bg-gray-50 min-h-screen font-sans" onClick={() => setContextMenu(null)}>
      <style>{printStyle}</style>

      {/* ヘッダー・ボタン群 */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-6 gap-4 no-print">
        <div>
          {/* ★ v27: タイトル変更 */}
          <h1 className="text-2xl font-bold text-gray-800">時間割作成くん v27</h1>
          <p className="text-sm text-gray-600">他学年/午前コマ数管理対応</p>
        </div>
        
        {/* ダッシュボード */}
        <div className="flex items-center gap-4 bg-white p-2 rounded shadow border px-4 w-full xl:w-auto xl:max-w-2xl justify-center">
           <div className="flex flex-col w-32"><div className="flex justify-between text-xs mb-1 font-bold text-gray-600"><span>進捗: {dashboard.progress}%</span><span>{dashboard.filledCount}/{dashboard.totalRequired}</span></div><div className="h-2 bg-gray-200 rounded overflow-hidden"><div className="h-full bg-green-500 rounded transition-all duration-500" style={{width: `${dashboard.progress}%`}}></div></div></div>
           {analysis.errorKeys.length > 0 ? (
             <button onClick={scrollToFirstError} className="flex items-center gap-1 text-xs bg-red-100 text-red-600 px-3 py-2 rounded-full font-bold hover:bg-red-200 animate-pulse transition-colors border border-red-200">⚠️ 重複 {analysis.errorKeys.length}件</button>
           ) : (<div className="flex items-center gap-1 text-xs bg-green-100 text-green-700 px-3 py-2 rounded-full font-bold border border-green-200">✨ エラーなし</div>)}
        </div>

        {/* ボタン群 (★ v27: ラベル復活 & 折り返し対応) */}
        <div className="flex flex-wrap items-center gap-2">
           <span className="text-xs text-green-600 font-bold mr-2">{saveStatus}</span>
           <button onClick={() => setIsCompact(!isCompact)} className={`px-3 py-2 rounded shadow border flex items-center gap-1 ${isCompact ? "bg-indigo-100 text-indigo-700 border-indigo-300" : "bg-white text-gray-600 border-gray-300"}`} title="表示サイズ切替">{isCompact ? "🔍 標準" : "📏 縮小"}</button>
           <div className="flex bg-white rounded shadow border border-gray-300 mr-2"><button onClick={undo} disabled={historyIndex === 0} className="px-3 py-2 text-gray-600 hover:bg-gray-100 disabled:opacity-30 border-r" title="元に戻す">↩️</button><button onClick={redo} disabled={historyIndex === history.length - 1} className="px-3 py-2 text-gray-600 hover:bg-gray-100 disabled:opacity-30" title="やり直し">↪️</button></div>
           
           <button onClick={handleDownloadExcel} className="px-3 py-2 bg-green-700 text-white rounded hover:bg-green-800 shadow text-sm flex items-center gap-1">📊 Excel</button>
           <button onClick={handleClearUnlocked} className="px-3 py-2 bg-red-500 text-white rounded hover:bg-red-600 shadow text-sm flex items-center gap-1">🗑️ 削除</button>
           <button onClick={() => setShowSummary(!showSummary)} className="px-3 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 shadow text-sm flex items-center gap-1">📊 集計</button>
           <button onClick={() => setShowConfig(true)} className="px-3 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 shadow text-sm flex items-center gap-1">⚙️ 設定</button>
           <button onClick={generateSchedule} disabled={isGenerating} className={`px-3 py-2 text-white rounded shadow text-sm flex items-center gap-1 ${isGenerating ? "bg-purple-400 cursor-wait" : "bg-purple-600 hover:bg-purple-700"}`}>🧙‍♂️ 自動作成</button>
           
           <button onClick={handleSaveJson} className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 shadow text-sm flex items-center gap-1">💾 保存</button>
           <button onClick={() => fileInputRef.current.click()} className="px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 shadow text-sm flex items-center gap-1">📂 開く</button>
           <input type="file" accept=".json" ref={fileInputRef} onChange={handleLoadJson} className="hidden" />
        </div>
      </div>

      {/* 以下、コンテンツエリア (変更なし) */}
      {showSummary && <div className="mb-6 animate-fade-in no-print"><SummaryTable targetSchedule={schedule} /></div>}
      {generatedPatterns.length > 0 && (
        <div className="mb-6 p-4 bg-purple-50 border-2 border-purple-200 rounded-lg animate-fade-in no-print">
          <div className="flex justify-between items-center mb-2"><div className="font-bold text-lg text-purple-800">生成結果</div><button onClick={() => setGeneratedPatterns([])} className="text-gray-500">キャンセル</button></div>
          {generatedPatterns.map((p, i) => <div key={i} className="bg-white border p-4 mb-4"><button onClick={() => applyPattern(p)} className="bg-purple-600 text-white px-4 py-1 rounded mb-2">案 {i+1} を適用</button><SummaryTable targetSchedule={p} /></div>)}
        </div>
      )}

      {showConfig && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4 no-print">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-y-auto p-6 relative animate-fade-in">
            <button onClick={() => setShowConfig(false)} className="absolute top-4 right-4 text-gray-500 hover:text-gray-800 text-xl font-bold">✕</button>
            <h2 className="font-bold text-xl mb-4 text-gray-700 border-b pb-2">⚙️ マスタ設定</h2>
            
            <div className="flex gap-4 mb-4 border-b">
              <button onClick={() => setShowExternalLoad(false)} className={`pb-2 font-bold ${!showExternalLoad ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-500"}`}>基本設定</button>
              <button onClick={() => setShowExternalLoad(true)} className={`pb-2 font-bold ${showExternalLoad ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-500"}`}>📅 他学年・午前コマ数登録</button>
            </div>

            {showExternalLoad ? (
              <div className="overflow-x-auto">
                <div className="bg-yellow-50 p-2 mb-2 rounded text-sm text-yellow-800 border border-yellow-200">※ここに「午前中」や「他学年」ですでに入っている授業コマ数を入力してください。自動生成や警告に反映されます。</div>
                <table className="w-full border-collapse text-sm">
                  <thead><tr><th className="border p-2 bg-gray-100 min-w-[100px]">講師名</th>{config.dates.map(d => <th key={d} className="border p-2 bg-gray-100 min-w-[60px]">{d}</th>)}</tr></thead>
                  <tbody>{config.teachers.map(t => (<tr key={t.name}><td className="border p-2 font-bold bg-gray-50">{t.name}</td>{config.dates.map(d => (<td key={d} className="border p-0"><input type="number" min="0" className="w-full h-full p-2 text-center focus:bg-blue-50 focus:outline-none" value={config.externalCounts?.[`${d}-${t.name}`] || ""} placeholder="-" onChange={(e) => handleExternalCountChange(d, t.name, e.target.value)} /></td>))}</tr>))}</tbody>
                </table>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-4">
                  <div><label className="text-xs font-bold">日付</label><textarea className="w-full border p-2 text-sm h-16" value={config.dates.join(", ")} onChange={(e) => handleListConfigChange('dates', e.target.value)} /></div>
                  <div><label className="text-xs font-bold">時限</label><textarea className="w-full border p-2 text-sm h-12" value={config.periods.join(", ")} onChange={(e) => handleListConfigChange('periods', e.target.value)} /></div>
                  <div><label className="text-xs font-bold">クラス</label><textarea className="w-full border p-2 text-sm h-12" value={config.classes.join(", ")} onChange={(e) => handleListConfigChange('classes', e.target.value)} /></div>
                  <div className="border p-2 bg-yellow-50"><label className="text-xs font-bold">必要コマ数</label><div className="grid grid-cols-2 gap-2">{config.subjects.map(s => <div key={s} className="flex justify-between bg-white p-1 border"><span className="text-xs">{s}</span><input type="number" className="w-12 text-right text-sm" value={config.subjectCounts?.[s]||0} onChange={(e) => handleSubjectCountChange(s, e.target.value)} /></div>)}</div></div>
                </div>
                <div className="md:col-span-2 border-l pl-4">
                  <div className="flex justify-between mb-2"><label className="text-sm font-bold">講師設定</label><button onClick={addTeacher} className="text-xs bg-blue-500 text-white px-2 rounded">+追加</button></div>
                  <div className="overflow-y-auto max-h-[400px] border bg-gray-50 p-2 mb-4"><table className="w-full text-sm"><thead><tr><th>氏名</th><th>科目</th><th>NGクラス</th><th>NG時</th><th>×</th></tr></thead><tbody>{config.teachers.map((t, i) => (<tr key={i} className="bg-white border-b"><td className="p-2 font-bold">{t.name}</td><td className="p-2"><div className="flex flex-wrap gap-1">{config.subjects.map(s => <label key={s} className="bg-gray-100 px-1 border"><input type="checkbox" checked={t.subjects.includes(s)} onChange={() => toggleTeacherSubject(i, s)} /><span className="text-xs">{s}</span></label>)}</div></td><td className="p-2"><div className="flex flex-wrap gap-1">{config.classes.map(c => <label key={c} className="border px-1"><input type="checkbox" checked={t.ngClasses?.includes(c)} onChange={() => toggleTeacherNgClass(i, c)} /><span className="text-xs">{c}</span></label>)}</div></td><td className="p-2 text-center"><button onClick={() => setEditingNgIndex(editingNgIndex===i?null:i)} className="text-xs border px-1">NG時</button></td><td className="p-2 text-center"><button onClick={() => removeTeacher(i)} className="text-red-500">×</button></td></tr>))}</tbody></table></div>
                  {editingNgIndex !== null && config.teachers[editingNgIndex] && <div className="bg-blue-50 border p-3"><h3 className="font-bold text-blue-800">NG時間</h3><div className="overflow-x-auto"><table className="w-full bg-white text-sm"><thead><tr><th></th>{config.periods.map(p => <th key={p} className="border p-1 bg-gray-100">{p}</th>)}</tr></thead><tbody>{config.dates.map(d => <tr key={d}><td className="border p-1 font-bold">{d}</td>{config.periods.map(p => { const k=`${d}-${p}`; const isNg=config.teachers[editingNgIndex].ngSlots?.includes(k); return <td key={k} onClick={() => toggleTeacherNg(editingNgIndex, d, p)} className={`border p-1 text-center cursor-pointer ${isNg?"bg-red-100 text-red-600":"text-gray-300"}`}>{isNg?"NG":"○"}</td> })}</tr>)}</tbody></table></div></div>}
                </div>
              </div>
            )}
            <div className="mt-4 border-t pt-4"><button onClick={handleResetAll} className="text-xs text-red-500 underline">⚠️ 全データ初期化</button></div>
          </div>
        </div>
      )}
      
      <div className={`overflow-auto shadow-lg rounded-lg border border-gray-300 max-h-[80vh] print-container ${isCompact ? "text-xs" : "text-sm"}`}>
        <table className="border-collapse w-full bg-white text-left relative">
          <thead className="sticky top-0 z-30 bg-gray-800 text-white shadow-md">
            <tr><th className={`border-r border-gray-600 sticky left-0 z-40 bg-gray-800 ${isCompact ? "p-1 w-16" : "p-3 w-24"}`}>日付</th><th className={`border-r border-gray-600 sticky left-24 z-30 bg-gray-800 ${isCompact ? "p-1 w-16" : "p-3 w-24"}`}>時限</th>{config.classes.map(cls => <th key={cls} className={`border-r border-gray-600 last:border-0 cursor-context-menu hover:bg-gray-700 transition-colors ${isCompact ? "p-1 min-w-[100px]" : "p-3 min-w-[150px]"}`} onContextMenu={(e) => handleContextMenu(e, null, null, null, 'class', cls)}>{cls}</th>)}</tr>
          </thead>
          <tbody>
            {config.dates.map((date, dIndex) => (
              config.periods.map((period, pIndex) => {
                const isDayEnd = pIndex === config.periods.length - 1;
                const borderClass = isDayEnd ? "border-b-4 border-gray-400" : "border-b hover:bg-gray-50";
                return (
                  <tr key={`${date}-${period}`} className={borderClass}>
                    {pIndex === 0 && <td rowSpan={config.periods.length} className={`font-bold align-top bg-gray-100 border-r sticky left-0 z-20 shadow-sm border-b-4 border-gray-400 cursor-context-menu hover:bg-gray-200 transition-colors ${isCompact ? "p-1" : "p-3"}`} onContextMenu={(e) => handleContextMenu(e, null, null, null, 'date', date)}>{date}</td>}
                    <td className={`border-r bg-gray-50 text-gray-700 sticky left-24 z-10 shadow-sm cursor-context-menu hover:bg-gray-200 transition-colors ${isDayEnd ? "border-b-4 border-gray-400" : ""} ${isCompact ? "p-1" : "p-3"}`} onContextMenu={(e) => handleContextMenu(e, null, null, null, 'period', period)}>{period}</td>
                    {config.classes.map((cls, cIndex) => {
                      const key = `${date}-${period}-${cls}`;
                      const currentData = schedule[key] || {};
                      const currentSubject = currentData.subject || "";
                      const currentTeacher = currentData.teacher || "";
                      const isLocked = currentData.locked || false; 
                      const isTeacherConflict = currentTeacher && analysis.conflictMap[`${date}-${period}-${currentTeacher}`];
                      const order = analysis.subjectOrders[key] || 0;
                      const maxCount = config.subjectCounts?.[currentSubject] || 0;
                      const isCountOver = maxCount > 0 && order > maxCount;
                      const filteredTeachers = currentSubject ? config.teachers.filter(t => t.subjects.includes(currentSubject)) : config.teachers;
                      const subjectColor = SUBJECT_COLORS[currentSubject] || "bg-white"; 
                      const cellBgColor = isTeacherConflict ? "bg-red-200" : subjectColor; 
                      const borderColor = isTeacherConflict ? "border-red-400 border-2" : (isLocked ? "border-gray-500 border-2" : "border-gray-200 border");
                      const isDimmed = highlightTeacher && currentTeacher !== highlightTeacher;

                      return (
                        <td 
                          key={cls} id={key} className={`border-r last:border-0 ${isCompact ? "p-1" : "p-2"}`} 
                          onContextMenu={(e) => handleContextMenu(e, date, period, cls)}
                          draggable={!isLocked && !!currentSubject}
                          onDragStart={(e) => handleDragStart(e, key, currentData)}
                          onDragOver={handleDragOver}
                          onDrop={(e) => handleDrop(e, key, currentData)}
                          onDragEnd={handleDragEnd}
                        >
                          <div className={`flex flex-col rounded ${borderColor} ${cellBgColor} ${isLocked ? "bg-opacity-100 shadow-inner" : "bg-opacity-90"} ${isDimmed ? "opacity-25 grayscale" : "transition-opacity"} ${isCompact ? "gap-0 p-1" : "gap-2 p-2"}`}>
                            <div className="flex justify-between items-start">
                               <div className="relative flex-1">
                                  <select 
                                    id={`select-${dIndex}-${pIndex}-${cIndex}-subject`}
                                    className={`w-full font-medium focus:outline-none cursor-pointer appearance-none bg-transparent ${isCountOver ? "text-red-600 font-bold" : "text-gray-800"} ${isLocked ? "pointer-events-none" : ""}`} 
                                    onChange={(e) => handleAssign(date, period, cls, 'subject', e.target.value)} 
                                    value={currentSubject}
                                    onKeyDown={(e) => handleCellNavigation(e, dIndex, pIndex, cIndex, 'subject')}
                                  >
                                    <option value="">-</option>{config.subjects.map(s => <option key={s} value={s} disabled={analysis.dailySubjectMap[`${cls}-${date}-${s}`] > 0 && currentSubject !== s} className={analysis.dailySubjectMap[`${cls}-${date}-${s}`] > 0 && currentSubject !== s ? "bg-gray-200" : ""}>{s}</option>)}
                                  </select>
                                  {currentSubject && <div className={`absolute right-0 top-0 px-1 rounded pointer-events-none ${isCountOver ? "bg-red-500 text-white" : "bg-white/80 text-blue-800 border"} ${isCompact ? "text-[10px]" : "text-xs"}`}>{toCircleNum(order)}{isCountOver&&"⚠"}</div>}
                               </div>
                               <button onClick={() => toggleLock(date, period, cls)} className="ml-1 focus:outline-none hover:scale-110" title="ロック">{isLocked ? "🔒" : "🔓"}</button>
                            </div>
                            <select 
                              id={`select-${dIndex}-${pIndex}-${cIndex}-teacher`}
                              className={`w-full rounded font-bold cursor-pointer ${isTeacherConflict ? "text-red-600 bg-red-100" : "text-blue-900 bg-white/50"} ${(!currentSubject || isLocked) ? "opacity-50 pointer-events-none" : ""} ${isCompact ? "p-0 text-xs" : "p-1"}`} 
                              onChange={(e) => handleAssign(date, period, cls, 'teacher', e.target.value)} 
                              value={currentTeacher} 
                              disabled={!currentSubject || isLocked}
                              onKeyDown={(e) => handleCellNavigation(e, dIndex, pIndex, cIndex, 'teacher')}
                            >
                              <option value="">-</option>
                              {filteredTeachers.map(t => {
                                const isNgSlot = t.ngSlots?.includes(`${date}-${period}`);
                                const isNgClass = t.ngClasses?.includes(cls);
                                const counts = analysis.teacherDailyCounts[`${date}-${t.name}`] || { current: 0, external: 0, total: 0 };
                                const isOverworked = counts.total >= 4; 
                                const isDisabled = isNgSlot || isNgClass;
                                let label = t.name;
                                if (isDisabled) label += isNgSlot ? "(NG時)" : "(クラス外)";
                                else label += ` (計${counts.total})`;
                                if (isOverworked) label += "⚠️";
                                return <option key={t.name} value={t.name} disabled={isDisabled} className={isDisabled ? "text-gray-300 bg-gray-100" : (isOverworked ? "bg-yellow-100" : "")}>{label}</option>;
                              })}
                            </select>
                            {isTeacherConflict && <div className="text-xs text-red-600 font-bold text-center bg-red-100 rounded">重複</div>}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            ))}
          </tbody>
        </table>
      </div>

      {contextMenu && (
        <div className="fixed bg-white border border-gray-200 shadow-xl rounded z-50 text-sm overflow-hidden animate-fade-in" style={{ top: contextMenu.y, left: contextMenu.x }}>
          <button onClick={() => handleMenuAction('copy')} className="block w-full text-left px-4 py-2 hover:bg-gray-100 border-b">📝 コピー</button>
          <button onClick={() => handleMenuAction('paste')} className={`block w-full text-left px-4 py-2 border-b ${!clipboard?"text-gray-300":"hover:bg-gray-100"}`}>📋 貼り付け</button>
          <button onClick={() => handleMenuAction('lock')} className="block w-full text-left px-4 py-2 hover:bg-gray-100 border-b">🔒 ロック切替</button>
          <button onClick={() => handleMenuAction('clear')} className="block w-full text-left px-4 py-2 hover:bg-red-50 text-red-600">🗑️ クリア</button>
        </div>
      )}
    </div>
  );
}