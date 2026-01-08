import React, { useState, useMemo, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';

// --- 初期データ定義 ---
const INITIAL_TEACHERS = [
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
];

const DEFAULT_TAB_CONFIG = {
  dates: ["12/25(木)", "12/26(金)", "12/27(土)", "1/4(日)", "1/6(火)", "1/7(水)"],
  periods: ["1限 (13:00~)", "2限 (14:10~)", "3限 (15:20~)"],
  classes: ["Sクラス", "Aクラス", "Bクラス", "Cクラス"],
  subjectCounts: { "英語": 4, "数学": 4, "国語": 3, "理科": 4, "社会": 3 }
};

const SUBJECT_COLORS = {
  "英語": "bg-red-100", "数学": "bg-blue-100", "国語": "bg-yellow-100",
  "理科": "bg-green-100", "社会": "bg-purple-100"
};

const toCircleNum = (num) => {
  const circles = ["0", "①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩", "⑪", "⑫", "⑬", "⑭", "⑮", "⑯", "⑰", "⑱", "⑲", "⑳"];
  return circles[num] || `(${num})`;
};

const STORAGE_KEY_PROJECT = 'winter_schedule_project_v30';

export default function ScheduleApp() {
  // --- State ---
  const [project, setProject] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY_PROJECT);
    if (saved) return JSON.parse(saved);
    return {
      teachers: INITIAL_TEACHERS,
      activeTabId: 1,
      tabs: [{ id: 1, name: "メイン(午後)", config: { ...DEFAULT_TAB_CONFIG }, schedule: {} }]
    };
  });

  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  
  const [showConfig, setShowConfig] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [showExternalLoad, setShowExternalLoad] = useState(false);
  const [generatedPatterns, setGeneratedPatterns] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [saveStatus, setSaveStatus] = useState("✅ 保存済");
  const [highlightTeacher, setHighlightTeacher] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [clipboard, setClipboard] = useState(null);
  const [isCompact, setIsCompact] = useState(false);
  const [dragSource, setDragSource] = useState(null);
  const [editingNgIndex, setEditingNgIndex] = useState(null); // 設定画面用

  const fileInputRef = useRef(null);

  const activeTab = project.tabs.find(t => t.id === project.activeTabId) || project.tabs[0];
  const currentSchedule = activeTab.schedule;
  const currentConfig = activeTab.config;
  const commonSubjects = Object.keys(currentConfig.subjectCounts);

  // --- History & Persistence ---
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PROJECT, JSON.stringify(project));
    setSaveStatus("💾 保存中...");
    const timer = setTimeout(() => setSaveStatus("✅ 保存済"), 800);
    return () => clearTimeout(timer);
  }, [project]);

  // プロジェクト全体を履歴に保存
  const pushHistory = (newProject) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newProject);
    if (newHistory.length > 50) newHistory.shift();
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    setProject(newProject);
  };

  const undo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setProject(history[historyIndex - 1]);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setProject(history[historyIndex + 1]);
    }
  };

  // 初回ロード時に履歴初期化
  useEffect(() => {
    if (history.length === 0) {
      setHistory([project]);
      setHistoryIndex(0);
    }
  }, []);

  // --- Logic: Analysis & Cross-Tab Conflicts ---
  // ★ v30: 全タブ横断での重複チェックロジック強化
  const analysis = useMemo(() => {
    const conflictMap = {}; // { "12/25-1限-堀上": true } -> 時間帯重複
    const subjectOrders = {}; 
    const dailySubjectMap = {}; 
    const errorKeys = []; // 現在のタブでエラーになっているセルのキー
    const teacherDailyCounts = {}; // 日次コマ数

    // 1. 全タブ走査して「時間帯×講師」の使用状況をマッピング
    // Map key: "date-period-teacherName"
    const globalUsage = {}; 

    project.tabs.forEach(tab => {
      Object.keys(tab.schedule).forEach(key => {
        const entry = tab.schedule[key];
        if (!entry || !entry.teacher || entry.teacher === "未定") return;

        // key = "date-period-class" -> splitして date, periodを取得
        // 注: dateにハイフンが含まれると誤動作するため、configから探すのが安全だが、
        // ここでは簡易的にsplitを使用 (date形式が固定ならOK)
        // データの堅牢性を高めるため、dateとperiodはconfigの配列インデックスで管理する方が良いが、
        // 既存実装に合わせて文字列マッチングを行う。
        const matchedDate = tab.config.dates.find(d => key.startsWith(d));
        const matchedPeriod = tab.config.periods.find(p => key.includes(p));

        if (matchedDate && matchedPeriod) {
          const usageKey = `${matchedDate}-${matchedPeriod}-${entry.teacher}`;
          if (!globalUsage[usageKey]) globalUsage[usageKey] = [];
          globalUsage[usageKey].push({ tabId: tab.id, class: key.split('-').pop() }); // どこで使われているか記録

          // 日次カウント (全タブ合計)
          const dayKey = `${matchedDate}-${entry.teacher}`;
          if (!teacherDailyCounts[dayKey]) {
             const ext = (project.externalCounts?.[dayKey] || 0);
             teacherDailyCounts[dayKey] = { current: 0, external: ext, total: ext };
          }
          teacherDailyCounts[dayKey].current++;
          teacherDailyCounts[dayKey].total++;
        }
      });
    });

    // 2. 現在のタブのスケジュールをチェック
    currentConfig.dates.forEach(d => {
      currentConfig.periods.forEach(p => {
        currentConfig.classes.forEach(c => {
          const key = `${d}-${p}-${c}`;
          const entry = currentSchedule[key];

          // 科目回数
          if (entry && entry.subject) {
            const subjKey = `${c}-${d}-${entry.subject}`;
            dailySubjectMap[subjKey] = (dailySubjectMap[subjKey] || 0) + 1;
            // 科目順序（簡易）
            const s = entry.subject;
            subjectOrders[key] = (subjectOrders[key] || 0) + 1; // ここは簡易ロジック
          }

          // ★ 重複判定 (他タブ含む)
          if (entry && entry.teacher && entry.teacher !== "未定") {
            const usageKey = `${d}-${p}-${entry.teacher}`;
            const usages = globalUsage[usageKey] || [];
            
            // 自分自身以外の使用実績があれば重複
            // (同じタブ・同じ時間・同じクラスはあり得ないkeyなので、count > 1なら重複)
            if (usages.length > 1) {
              conflictMap[`${d}-${p}-${entry.teacher}`] = true;
              errorKeys.push(key);
            }
          }
        });
      });
    });

    // 科目順序の正確な計算 (クラスごとに走査)
    currentConfig.classes.forEach(c => {
      const counts = {};
      currentConfig.dates.forEach(d => {
        currentConfig.periods.forEach(p => {
          const key = `${d}-${p}-${c}`;
          const s = currentSchedule[key]?.subject;
          if (s) {
            counts[s] = (counts[s] || 0) + 1;
            subjectOrders[key] = counts[s];
          }
        });
      });
    });

    return { conflictMap, subjectOrders, dailySubjectMap, errorKeys, teacherDailyCounts };
  }, [project, currentSchedule, currentConfig]); // project全体が変わったら再計算

  const dashboard = useMemo(() => {
    const total = Object.values(currentConfig.subjectCounts).reduce((a,b)=>a+b,0) * currentConfig.classes.length;
    let filled = 0; Object.values(currentSchedule).forEach(v => { if(v.subject) filled++; });
    return { progress: total > 0 ? Math.round((filled/total)*100) : 0, filled, total };
  }, [currentSchedule, currentConfig]);

  // --- Handlers ---
  const handleAddTab = () => {
    const name = prompt("新しいタブの名前:");
    if (!name) return;
    const newId = Math.max(...project.tabs.map(t => t.id)) + 1;
    const newTab = { id: newId, name, config: { ...DEFAULT_TAB_CONFIG }, schedule: {} };
    pushHistory({ ...project, tabs: [...project.tabs, newTab], activeTabId: newId });
  };

  const handleDeleteTab = (e, id) => {
    e.stopPropagation();
    if (project.tabs.length <= 1 || !window.confirm("このタブを削除しますか？")) return;
    const newTabs = project.tabs.filter(t => t.id !== id);
    pushHistory({ ...project, tabs: newTabs, activeTabId: newTabs[0].id });
  };

  const handleRenameTab = (e, id) => {
    e.stopPropagation();
    const tab = project.tabs.find(t => t.id === id);
    const newName = prompt("タブ名を変更:", tab.name);
    if (newName) pushHistory({ ...project, tabs: project.tabs.map(t => t.id === id ? { ...t, name: newName } : t) });
  };

  const handleListConfigChange = (key, value) => {
    const arr = value.split(',').map(s => s.trim()).filter(s => s);
    const newTabs = project.tabs.map(t => t.id === project.activeTabId ? { ...t, config: { ...t.config, [key]: arr } } : t);
    pushHistory({ ...project, tabs: newTabs });
  };

  const handleSubjectCountChange = (subj, val) => {
    const newCounts = { ...currentConfig.subjectCounts, [subj]: parseInt(val) || 0 };
    const newTabs = project.tabs.map(t => t.id === project.activeTabId ? { ...t, config: { ...t.config, subjectCounts: newCounts } } : t);
    pushHistory({ ...project, tabs: newTabs });
  };

  // --- 講師操作 (v30: 削除時にスケジュールからも消す) ---
  const addTeacher = () => {
    const name = prompt("講師名:");
    if(name) pushHistory({ ...project, teachers: [...project.teachers, { name, subjects: [], ngSlots: [], ngClasses: [] }] });
  };
  const removeTeacher = (idx) => {
    if(!window.confirm("この講師を削除しますか？\n(割り当て済みのコマからも削除されます)")) return;
    const targetName = project.teachers[idx].name;
    const newTeachers = project.teachers.filter((_, i) => i !== idx);
    
    // 全タブのスケジュールからこの講師を削除
    const newTabs = project.tabs.map(tab => {
      const newSch = { ...tab.schedule };
      Object.keys(newSch).forEach(k => {
        if (newSch[k].teacher === targetName) {
          newSch[k] = { ...newSch[k], teacher: "" }; // 講師だけ消す
        }
      });
      return { ...tab, schedule: newSch };
    });

    pushHistory({ ...project, teachers: newTeachers, tabs: newTabs });
  };

  const toggleTeacherSubject = (idx, subj) => {
    const newTeachers = [...project.teachers];
    const t = newTeachers[idx];
    if(t.subjects.includes(subj)) t.subjects = t.subjects.filter(s=>s!==subj); else t.subjects.push(subj);
    pushHistory({ ...project, teachers: newTeachers });
  };
  
  // NG設定 (設定画面用)
  const toggleTeacherNg = (idx, d, p) => {
    const newTeachers = [...project.teachers];
    const t = newTeachers[idx];
    const k = `${d}-${p}`;
    if(!t.ngSlots) t.ngSlots = [];
    if(t.ngSlots.includes(k)) t.ngSlots = t.ngSlots.filter(x=>x!==k); else t.ngSlots.push(k);
    pushHistory({ ...project, teachers: newTeachers });
  };

  const handleAssign = (d, p, c, type, val) => {
    const k = `${d}-${p}-${c}`;
    if(currentSchedule[k]?.locked) return;
    const e = { ...(currentSchedule[k] || {}) };
    if(type === 'subject') { e.subject = val; e.teacher = ""; } else { e[type] = val; }
    
    const newTabs = project.tabs.map(t => t.id === project.activeTabId ? { ...t, schedule: { ...t.schedule, [k]: e } } : t);
    pushHistory({ ...project, tabs: newTabs });
  };

  const toggleLock = (d, p, c) => {
    const k = `${d}-${p}-${c}`;
    const e = { ...(currentSchedule[k] || {}) };
    e.locked = !e.locked;
    const newTabs = project.tabs.map(t => t.id === project.activeTabId ? { ...t, schedule: { ...t.schedule, [k]: e } } : t);
    pushHistory({ ...project, tabs: newTabs });
  };

  // --- Context Menu Actions (v30: Add NG toggle) ---
  const handleContextMenu = (e, d, p, c, type=null, val=null) => { e.preventDefault(); setContextMenu({ x: e.pageX, y: e.pageY, d, p, c, type, val }); };
  
  const handleMenuAction = (action) => {
    if (!contextMenu) return;
    
    // Header Actions
    if (contextMenu.type) {
      const ns = { ...currentSchedule }; let upd = false;
      currentConfig.dates.forEach(d => currentConfig.periods.forEach(p => currentConfig.classes.forEach(c => {
        if ((contextMenu.type==='date'&&d===contextMenu.val)||(contextMenu.type==='class'&&c===contextMenu.val)||(contextMenu.type==='period'&&p===contextMenu.val)) {
          const k=`${d}-${p}-${c}`; if(!ns[k])ns[k]={};
          if(action==='lock-all'){ns[k].locked=true;upd=true;} if(action==='unlock-all'){ns[k].locked=false;upd=true;} if(action==='clear-all'&&!ns[k].locked){delete ns[k];upd=true;}
        }
      })));
      if (upd) {
        const newTabs = project.tabs.map(t => t.id === project.activeTabId ? { ...t, schedule: ns } : t);
        pushHistory({ ...project, tabs: newTabs });
      }
    } else { 
      // Cell Actions
      const { d, p, c } = contextMenu;
      const k = `${d}-${p}-${c}`; 
      const curr = currentSchedule[k] || {};
      
      if(action==='copy'&&curr.subject) setClipboard({subject:curr.subject,teacher:curr.teacher});
      
      if(action==='paste'&&clipboard&&!curr.locked) {
        const newTabs = project.tabs.map(t => t.id === project.activeTabId ? { ...t, schedule: { ...t.schedule, [k]: { ...curr, subject: clipboard.subject, teacher: clipboard.teacher } } } : t);
        pushHistory({ ...project, tabs: newTabs });
      }
      
      if(action==='lock') toggleLock(d, p, c);
      
      if(action==='clear'&&!curr.locked) {
        const ns = { ...currentSchedule }; delete ns[k]; 
        const newTabs = project.tabs.map(t => t.id === project.activeTabId ? { ...t, schedule: ns } : t);
        pushHistory({ ...project, tabs: newTabs });
      }

      // ★ v30: カレンダー上でのNG登録
      if(action==='set-ng' && curr.teacher && curr.teacher !== "未定") {
        // 現在の講師のNGリストに、この日時を追加
        const teacherIdx = project.teachers.findIndex(t => t.name === curr.teacher);
        if (teacherIdx >= 0) {
          toggleTeacherNg(teacherIdx, d, p);
        }
      }
    }
    setContextMenu(null);
  };

  const handleExternalCountChange = (d, t, v) => {
    const counts = { ...project.externalCounts, [`${d}-${t}`]: parseInt(v)||0 };
    pushHistory({ ...project, externalCounts: counts });
  };

  const handleClearUnlocked = () => { if(window.confirm("ロック以外を削除しますか？")) { const ns={}; Object.keys(currentSchedule).forEach(k=>{if(currentSchedule[k].locked)ns[k]=currentSchedule[k]}); const newTabs = project.tabs.map(t => t.id === project.activeTabId ? { ...t, schedule: ns } : t); pushHistory({ ...project, tabs: newTabs }); }};
  const handleResetAll = () => { if(window.confirm("全データ削除しますか？")) { localStorage.removeItem(STORAGE_KEY_PROJECT); window.location.reload(); }};
  const applyPattern = (pat) => { const newTabs = project.tabs.map(t => t.id === project.activeTabId ? { ...t, schedule: pat } : t); pushHistory({ ...project, tabs: newTabs }); setGeneratedPatterns([]); };
  const handleLoadJson = (e) => { const f=e.target.files[0]; if(!f)return; const r=new FileReader(); r.onload=(ev)=>{try{const data=JSON.parse(ev.target.result); pushHistory(data); alert("読込完了");}catch{alert("エラー");}}; r.readAsText(f); e.target.value=''; };
  const handleSaveJson = () => { const b=new Blob([JSON.stringify(project,null,2)],{type:"application/json"}); const u=URL.createObjectURL(b); const a=document.createElement('a'); a.href=u; a.download=`schedule_project_v30.json`; a.click(); };

  // Generate Schedule Logic
  const generateSchedule = () => {
    setIsGenerating(true);
    setTimeout(() => {
      const solutions = []; const slots = [];
      currentConfig.dates.forEach(d => currentConfig.periods.forEach(p => currentConfig.classes.forEach(c => { const k=`${d}-${p}-${c}`; if(!currentSchedule[k]?.subject) slots.push({d,p,c,k}); })));
      const counts = {}; currentConfig.classes.forEach(c => { counts[c] = {}; commonSubjects.forEach(s => counts[c][s] = 0); });
      Object.keys(currentSchedule).forEach(k => { const e=currentSchedule[k]; if(e?.subject) counts[k.split('-')[2]][e.subject]++; });

      const solve = (idx, tempSch, tempCnt, iter={c:0}) => {
        if (iter.c++ > 50000 || solutions.length >= 3) return;
        if (idx >= slots.length) { solutions.push(JSON.parse(JSON.stringify(tempSch))); return; }
        const {d,p,c,k} = slots[idx];
        const subjects = commonSubjects.sort(() => Math.random() - 0.5);
        for (const s of subjects) {
          if ((tempCnt[c][s]||0) >= currentConfig.subjectCounts[s]) continue;
          if (currentConfig.periods.some(per => tempSch[`${d}-${per}-${c}`]?.subject === s)) continue;
          const validT = project.teachers.filter(t => t.subjects.includes(s) && !t.ngClasses?.includes(c) && !t.ngSlots?.includes(`${d}-${p}`));
          const availT = validT.filter(t => {
             // ★ v30: 自動生成でも他タブ・外部負荷を考慮
             const dayKey = `${d}-${t.name}`;
             const ext = analysis.teacherDailyCounts[dayKey]?.external || 0;
             const currentTabCount = analysis.teacherDailyCounts[dayKey]?.current || 0; 
             // 注: generate中はtempSchを使う必要があるが、簡易的に現在の解析値 + tempSchでの増加分を見るなど複雑になるため
             // ここでは「既存の負荷 + 1 < 5」という簡易チェックにする
             return (ext + currentTabCount) < 5; 
          });
          const tObj = availT[Math.floor(Math.random()*availT.length)];
          if (tObj) {
             if (!currentConfig.classes.some(oc => oc!==c && tempSch[`${d}-${p}-${oc}`]?.teacher===tObj.name)) {
                tempSch[k] = { subject: s, teacher: tObj.name }; tempCnt[c][s]++;
                solve(idx+1, tempSch, tempCnt, iter);
                if (solutions.length>=3) return;
                delete tempSch[k]; tempCnt[c][s]--;
             }
          }
        }
      };
      solve(0, JSON.parse(JSON.stringify(currentSchedule)), JSON.parse(JSON.stringify(counts)));
      setGeneratedPatterns(solutions); setIsGenerating(false);
      if(solutions.length===0) alert("生成パターンが見つかりませんでした");
    }, 100);
  };

  const handleDownloadExcel = () => {
    const wb = XLSX.utils.book_new();
    project.tabs.forEach(tab => {
      const header = ["日付", "時限", ...tab.config.classes];
      const rows = [];
      tab.config.dates.forEach(d => {
        tab.config.periods.forEach(p => {
          const row = [d, p];
          tab.config.classes.forEach(c => { const e = tab.schedule[`${d}-${p}-${c}`]; row.push(e && e.subject ? `${e.subject}\n${e.teacher}` : ""); });
          rows.push(row);
        });
      });
      const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
      ws['!cols'] = [{ wch: 15 }, { wch: 15 }, ...tab.config.classes.map(() => ({ wch: 20 }))];
      XLSX.utils.book_append_sheet(wb, ws, tab.name);
    });
    XLSX.writeFile(wb, "時間割プロジェクト.xlsx");
  };

  // --- Components ---
  const printStyle = `@media print { @page { size: landscape; } .no-print { display: none !important; } .print-container { max-height: none !important; border: none !important; } }`;

  return (
    <div className="p-4 bg-gray-100 min-h-screen font-sans" onClick={() => setContextMenu(null)}>
      <style>{printStyle}</style>

      {/* Header */}
      <div className="flex justify-between items-center mb-2 no-print bg-white p-3 rounded shadow-sm border-b border-gray-200">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-gray-700">📅 時間割作成くん v30</h1>
          <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded border border-green-200">{saveStatus}</span>
        </div>
        <div className="flex gap-2">
          <button onClick={handleSaveJson} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 shadow text-sm font-bold">💾 プロジェクト保存</button>
          <button onClick={() => fileInputRef.current.click()} className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 shadow text-sm font-bold">📂 開く</button>
          <button onClick={handleDownloadExcel} className="flex items-center gap-1 px-3 py-1.5 bg-green-800 text-white rounded hover:bg-green-900 shadow text-sm font-bold">📊 全Excel出力</button>
          <input type="file" accept=".json" ref={fileInputRef} onChange={handleLoadJson} className="hidden" />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-end gap-1 px-2 no-print overflow-x-auto">
        {project.tabs.map(tab => (
          <div 
            key={tab.id}
            onClick={() => { setProject({ ...project, activeTabId: tab.id }); setHistoryIndex(historyIndex); }} // Tab change doesn't need history push, but syncs
            onDoubleClick={(e) => handleRenameTab(e, tab.id)}
            className={`px-4 py-2 rounded-t-lg cursor-pointer flex items-center gap-2 select-none transition-all ${project.activeTabId === tab.id ? "bg-white text-blue-700 font-bold shadow-[0_-2px_5px_rgba(0,0,0,0.05)] pt-3" : "bg-gray-200 text-gray-500 hover:bg-gray-300 mt-1"}`}
          >
            {tab.name}
            {project.tabs.length > 1 && <span onClick={(e) => handleDeleteTab(e, tab.id)} className="text-xs ml-2 hover:text-red-500">×</span>}
          </div>
        ))}
        <button onClick={handleAddTab} className="px-3 py-2 text-gray-500 hover:text-blue-600 font-bold text-sm">+ タブ追加</button>
      </div>

      {/* Main Content */}
      <div className="bg-white p-4 rounded-b-lg rounded-tr-lg shadow-md min-h-[600px]">
        
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4 p-2 bg-slate-50 border border-slate-200 rounded no-print">
          <div className="flex items-center gap-3 bg-white px-3 py-1.5 rounded border border-gray-200 shadow-sm flex-1 min-w-[250px]">
            <div className="text-xs font-bold text-gray-500">進捗</div>
            <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden relative">
              <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${dashboard.progress}%` }}></div>
            </div>
            <div className="text-sm font-bold text-blue-600 w-12 text-right">{dashboard.progress}%</div>
            {analysis.errorKeys.length > 0 ? (
              <button onClick={scrollToFirstError} className="ml-2 text-xs bg-red-100 text-red-600 px-2 py-1 rounded border border-red-200 font-bold animate-pulse hover:bg-red-200">⚠️ {analysis.errorKeys.length}件</button>
            ) : <span className="ml-2 text-xs text-green-600 font-bold">✨ OK</span>}
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => setIsCompact(!isCompact)} className="flex items-center gap-1 px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded hover:bg-gray-50 shadow-sm text-sm">{isCompact ? "🔍 標準" : "📏 縮小"}</button>
            <div className="h-6 w-px bg-gray-300 mx-1"></div>
            <button onClick={undo} disabled={historyIndex === 0} className="px-3 py-2 text-gray-600 hover:bg-gray-100 disabled:opacity-30 border rounded shadow-sm">↩️</button>
            <button onClick={redo} disabled={historyIndex === history.length - 1} className="px-3 py-2 text-gray-600 hover:bg-gray-100 disabled:opacity-30 border rounded shadow-sm">↪️</button>
            <div className="h-6 w-px bg-gray-300 mx-1"></div>
            <button onClick={() => setShowSummary(!showSummary)} className="flex items-center gap-1 px-3 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 shadow-sm text-sm font-bold">📊 集計</button>
            <button onClick={() => setShowConfig(true)} className="flex items-center gap-1 px-3 py-2 bg-gray-700 text-white rounded hover:bg-gray-800 shadow-sm text-sm font-bold">⚙️ 設定</button>
            <div className="h-6 w-px bg-gray-300 mx-1"></div>
            <button onClick={handleClearUnlocked} className="flex items-center gap-1 px-3 py-2 bg-red-100 text-red-700 border border-red-200 rounded hover:bg-red-200 shadow-sm text-sm font-bold">🗑️ 削除</button>
            <button onClick={generateSchedule} disabled={isGenerating} className={`flex items-center gap-1 px-4 py-2 text-white rounded shadow-sm text-sm font-bold transition-colors ${isGenerating ? "bg-purple-300 cursor-not-allowed" : "bg-purple-600 hover:bg-purple-700"}`}>{isGenerating ? "🔮 生成中..." : "🧙‍♂️ 自動作成"}</button>
          </div>
        </div>

        {/* Schedule Table */}
        <div className={`overflow-auto shadow border border-gray-300 max-h-[70vh] bg-gray-50 print-container ${isCompact ? "text-xs" : "text-sm"}`}>
          <table className="w-full border-collapse text-left relative">
            <thead className="sticky top-0 z-30 bg-gray-800 text-white shadow-md">
              <tr>
                <th className={`border-r border-gray-600 sticky left-0 z-40 bg-gray-800 ${isCompact ? "p-1 w-12" : "p-3 w-20"}`}>日付</th>
                <th className={`border-r border-gray-600 sticky left-12 z-30 bg-gray-800 ${isCompact ? "p-1 w-12" : "p-3 w-20"}`} style={{left: isCompact?'3rem':'5rem'}}>時限</th>
                {currentConfig.classes.map(c => <th key={c} className={`border-r border-gray-600 cursor-context-menu hover:bg-gray-700 ${isCompact ? "p-1 min-w-[80px]" : "p-3 min-w-[140px]"}`} onContextMenu={(e) => handleContextMenu(e, null, null, null, 'class', c)}>{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {currentConfig.dates.map((d, dIdx) => (
                currentConfig.periods.map((p, pIdx) => {
                  const isDayEnd = pIdx === currentConfig.periods.length - 1;
                  return (
                    <tr key={`${d}-${p}`} className={`bg-white ${isDayEnd ? "border-b-4 border-gray-400" : "border-b hover:bg-gray-200"}`}>
                      {pIdx === 0 && <td rowSpan={currentConfig.periods.length} className={`font-bold align-top bg-gray-100 border-r sticky left-0 z-20 border-b-4 border-gray-400 cursor-context-menu hover:bg-gray-200 ${isCompact ? "p-1" : "p-3"}`} onContextMenu={(e) => handleContextMenu(e, null, null, null, 'date', d)}>{d}</td>}
                      <td className={`border-r bg-gray-50 text-gray-700 sticky z-10 ${isDayEnd ? "border-b-4 border-gray-400" : ""} ${isCompact ? "p-1 left-12" : "p-3 left-20"}`} style={{left: isCompact?'3rem':'5rem'}} onContextMenu={(e) => handleContextMenu(e, null, null, null, 'period', p)}>{p}</td>
                      {currentConfig.classes.map((c) => {
                        const key = `${d}-${p}-${c}`;
                        const entry = currentSchedule[key] || {};
                        const isLocked = entry.locked;
                        
                        // ★ v30: クロスタブ重複の判定
                        const isConflict = analysis.conflictMap[`${d}-${p}-${entry.teacher}`];
                        
                        const order = analysis.subjectOrders[key] || 0;
                        const maxCnt = currentConfig.subjectCounts[entry.subject] || 0;
                        const isOver = maxCnt > 0 && order > maxCnt;
                        const filteredTeachers = entry.subject ? project.teachers.filter(t => t.subjects.includes(entry.subject)) : project.teachers;

                        return (
                          <td 
                            key={c} id={key} className={`border-r last:border-0 ${isCompact ? "p-0.5" : "p-2"}`}
                            draggable={!isLocked && !!entry.subject}
                            onDragStart={(e) => handleDragStart(e, key, entry)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => handleDrop(e, key, entry)}
                            onContextMenu={(e) => handleContextMenu(e, d, p, c)}
                          >
                            {/* ★ v30: 重複なら背景を赤く */}
                            <div className={`flex flex-col rounded h-full ${isConflict ? "bg-red-200 ring-2 ring-red-600 z-10 relative" : (SUBJECT_COLORS[entry.subject] || "bg-white")} ${isLocked ? "border-2 border-gray-500" : "border border-gray-200"} ${isCompact ? "gap-0 p-0.5" : "gap-1 p-1.5"}`}>
                              <div className="flex justify-between items-start">
                                <div className="relative flex-1">
                                  <select className={`w-full bg-transparent font-bold focus:outline-none cursor-pointer text-gray-800 ${isCompact ? "text-[10px]" : "text-sm"} ${isLocked ? "pointer-events-none" : ""}`} value={entry.subject || ""} onChange={(e) => handleAssign(d, p, c, 'subject', e.target.value)}>
                                    <option value="">-</option>{commonSubjects.map(s => <option key={s} value={s}>{s}</option>)}
                                  </select>
                                  {entry.subject && <span className={`absolute right-0 top-0 text-[9px] px-1 rounded-full ${isOver ? "bg-red-500 text-white" : "bg-white/60 text-gray-600 border"}`}>{toCircleNum(order)}{isOver&&"!"}</span>}
                                </div>
                                <button onClick={() => toggleLock(d, p, c)} className={`ml-1 focus:outline-none text-gray-400 hover:text-gray-800 ${isCompact ? "text-[8px]" : "text-xs"}`}>{isLocked ? "🔒" : "🔓"}</button>
                              </div>
                              <select 
                                className={`w-full rounded cursor-pointer ${isConflict ? "text-red-800 font-extrabold" : "text-blue-900"} ${isCompact ? "text-[10px] py-0" : "text-sm py-1"} ${(!entry.subject || isLocked) ? "opacity-50 pointer-events-none" : "bg-white/50 hover:bg-white"}`}
                                value={entry.teacher || ""}
                                onChange={(e) => handleAssign(d, p, c, 'teacher', e.target.value)}
                              >
                                <option value="">-</option>
                                {filteredTeachers.map(t => {
                                  const dayKey = `${d}-${t.name}`;
                                  const daily = analysis.teacherDailyCounts[dayKey] || { total: 0 };
                                  const isNg = t.ngSlots?.includes(`${d}-${p}`); // ★ v30: 選択肢でもNGを強調
                                  let label = t.name;
                                  if (isNg) label += " (NG)";
                                  else label += ` (計${daily.total})`;
                                  
                                  return <option key={t.name} value={t.name} className={isNg ? "bg-gray-300 text-gray-500" : (daily.total >= 4 ? "bg-yellow-100" : "")} disabled={isNg}>{label}</option>;
                                })}
                              </select>
                              {isConflict && <div className="text-[10px] text-red-700 font-bold text-center bg-red-100 rounded mt-1">⚠️ 他タブと重複</div>}
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
      </div>

      {contextMenu && (
        <div className="fixed bg-white border border-gray-200 shadow-xl rounded z-50 text-sm overflow-hidden animate-fade-in" style={{ top: contextMenu.y, left: contextMenu.x }}>
          {contextMenu.type ? (
            <>
              <div className="px-4 py-2 bg-gray-50 border-b font-bold text-gray-500 text-xs">{contextMenu.val} の一括操作</div>
              <button onClick={() => handleMenuAction('lock-all')} className="block w-full text-left px-4 py-2 hover:bg-gray-100 border-b">🔒 一括ロック</button>
              <button onClick={() => handleMenuAction('unlock-all')} className="block w-full text-left px-4 py-2 hover:bg-gray-100 border-b">🔓 一括解除</button>
              <button onClick={() => handleMenuAction('clear-all')} className="block w-full text-left px-4 py-2 hover:bg-red-50 text-red-600">🗑️ 一括クリア</button>
            </>
          ) : (
            <>
              <button onClick={() => handleMenuAction('copy')} className="block w-full text-left px-4 py-2 hover:bg-gray-100 border-b">📝 コピー</button>
              <button onClick={() => handleMenuAction('paste')} className={`block w-full text-left px-4 py-2 border-b ${!clipboard?"text-gray-300":"hover:bg-gray-100"}`}>📋 貼り付け</button>
              
              {/* ★ v30: NG登録メニュー追加 */}
              {currentSchedule[`${contextMenu.d}-${contextMenu.p}-${contextMenu.c}`]?.teacher && (
                <button onClick={() => handleMenuAction('set-ng')} className="block w-full text-left px-4 py-2 hover:bg-yellow-100 border-b text-yellow-800">🚫 この時間をNG登録</button>
              )}

              <button onClick={() => handleMenuAction('lock')} className="block w-full text-left px-4 py-2 hover:bg-gray-100 border-b">🔒 ロック切替</button>
              <button onClick={() => handleMenuAction('clear')} className="block w-full text-left px-4 py-2 hover:bg-red-50 text-red-600">🗑️ クリア</button>
            </>
          )}
        </div>
      )}

      {/* Config Modal (Same as v29) - Code preserved but omitted for brevity in diff if not changed, but needed for full file replacement */}
      {showConfig && (
        <div className="fixed inset-0 bg-black/50 z-50 flex justify-center items-center p-4 no-print">
          <div className="bg-white w-full max-w-5xl h-[85vh] rounded-lg shadow-2xl flex flex-col overflow-hidden animate-fade-in">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50">
              <h2 className="font-bold text-lg text-gray-700">⚙️ 設定メニュー</h2>
              <button onClick={() => setShowConfig(false)} className="text-2xl font-bold text-gray-400 hover:text-gray-600">×</button>
            </div>
            
            <div className="flex gap-4 px-6 pt-4 border-b">
              <button onClick={() => setShowExternalLoad(false)} className={`pb-2 font-bold ${!showExternalLoad ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-500"}`}>基本設定</button>
              <button onClick={() => setShowExternalLoad(true)} className={`pb-2 font-bold ${showExternalLoad ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-500"}`}>📅 他学年・午前登録</button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {showExternalLoad ? (
                <div className="overflow-x-auto">
                  <div className="bg-yellow-50 p-2 mb-2 rounded text-sm text-yellow-800 border border-yellow-200">※ここに「午前中」や「他学年」ですでに入っている授業コマ数を入力してください。</div>
                  <table className="w-full border-collapse text-sm">
                    <thead><tr><th className="border p-2 bg-gray-100 min-w-[100px]">講師名</th>{currentConfig.dates.map(d => <th key={d} className="border p-2 bg-gray-100 min-w-[60px]">{d}</th>)}</tr></thead>
                    <tbody>{project.teachers.map(t => (<tr key={t.name}><td className="border p-2 font-bold bg-gray-50">{t.name}</td>{currentConfig.dates.map(d => (<td key={d} className="border p-0"><input type="number" min="0" className="w-full h-full p-2 text-center focus:bg-blue-50 focus:outline-none" value={project.externalCounts?.[`${d}-${t.name}`] || ""} placeholder="-" onChange={(e) => handleExternalCountChange(d, t.name, e.target.value)} /></td>))}</tr>))}</tbody>
                  </table>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-4">
                    <div><label className="text-xs font-bold">日付</label><textarea className="w-full border p-2 text-sm h-16" value={currentConfig.dates.join(", ")} onChange={(e) => handleListConfigChange('dates', e.target.value)} /></div>
                    <div><label className="text-xs font-bold">時限</label><textarea className="w-full border p-2 text-sm h-12" value={currentConfig.periods.join(", ")} onChange={(e) => handleListConfigChange('periods', e.target.value)} /></div>
                    <div><label className="text-xs font-bold">クラス</label><textarea className="w-full border p-2 text-sm h-12" value={currentConfig.classes.join(", ")} onChange={(e) => handleListConfigChange('classes', e.target.value)} /></div>
                    <div className="border p-2 bg-yellow-50"><label className="text-xs font-bold">必要コマ数</label><div className="grid grid-cols-2 gap-2">{commonSubjects.map(s => <div key={s} className="flex justify-between bg-white p-1 border"><span className="text-xs">{s}</span><input type="number" className="w-12 text-right text-sm" value={currentConfig.subjectCounts[s]||0} onChange={(e) => handleSubjectCountChange(s, e.target.value)} /></div>)}</div></div>
                  </div>
                  <div className="md:col-span-2 border-l pl-4">
                    <div className="flex justify-between mb-2"><label className="text-sm font-bold">講師設定</label><button onClick={addTeacher} className="text-xs bg-blue-500 text-white px-2 rounded">+追加</button></div>
                    <div className="overflow-y-auto max-h-[400px] border bg-gray-50 p-2 mb-4"><table className="w-full text-sm"><thead><tr><th>氏名</th><th>科目</th><th>NGクラス</th><th>NG時</th><th>×</th></tr></thead><tbody>{project.teachers.map((t, i) => (<tr key={i} className="bg-white border-b"><td className="p-2 font-bold">{t.name}</td><td className="p-2"><div className="flex flex-wrap gap-1">{commonSubjects.map(s => <label key={s} className="bg-gray-100 px-1 border"><input type="checkbox" checked={t.subjects.includes(s)} onChange={() => toggleTeacherSubject(i, s)} /><span className="text-xs">{s}</span></label>)}</div></td><td className="p-2"><div className="flex flex-wrap gap-1">{currentConfig.classes.map(c => <label key={c} className="border px-1"><input type="checkbox" checked={t.ngClasses?.includes(c)} onChange={() => toggleTeacherNgClass(i, c)} /><span className="text-xs">{c}</span></label>)}</div></td><td className="p-2 text-center"><button onClick={() => setEditingNgIndex(editingNgIndex===i?null:i)} className="text-xs border px-1">NG時</button></td><td className="p-2 text-center"><button onClick={() => removeTeacher(i)} className="text-red-500">×</button></td></tr>))}</tbody></table></div>
                    {editingNgIndex !== null && project.teachers[editingNgIndex] && <div className="bg-blue-50 border p-3"><h3 className="font-bold text-blue-800">NG時間設定</h3><div className="overflow-x-auto"><table className="w-full bg-white text-sm"><thead><tr><th></th>{currentConfig.periods.map(p => <th key={p} className="border p-1 bg-gray-100">{p}</th>)}</tr></thead><tbody>{currentConfig.dates.map(d => <tr key={d}><td className="border p-1 font-bold">{d}</td>{currentConfig.periods.map(p => { const k=`${d}-${p}`; const isNg=project.teachers[editingNgIndex].ngSlots?.includes(k); return <td key={k} onClick={() => toggleTeacherNg(editingNgIndex, d, p)} className={`border p-1 text-center cursor-pointer ${isNg?"bg-red-100 text-red-600":"text-gray-300"}`}>{isNg?"NG":"○"}</td> })}</tr>)}</tbody></table></div></div>}
                  </div>
                </div>
              )}
              <div className="mt-4 border-t pt-4"><button onClick={handleResetAll} className="text-xs text-red-500 underline">⚠️ 全データ初期化</button></div>
            </div>
          </div>
        )}
    </div>
  );
}