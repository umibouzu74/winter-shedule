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

const STORAGE_KEY_PROJECT = 'winter_schedule_project_v28';

export default function ScheduleApp() {
  // --- State Management ---
  // ★ v28: 構造変更
  // teachers: 全タブ共通の講師マスタ
  // tabs: タブごとのデータ (config, schedule)
  // activeTabId: 現在表示中のタブID
  const [project, setProject] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY_PROJECT);
    if (saved) return JSON.parse(saved);
    return {
      teachers: INITIAL_TEACHERS,
      activeTabId: 1,
      tabs: [
        { id: 1, name: "メイン(午後)", config: { ...DEFAULT_TAB_CONFIG }, schedule: {} }
      ]
    };
  });

  const [history, setHistory] = useState([{}]); // 履歴管理は簡易化のため一時的にリセットされます
  const [historyIndex, setHistoryIndex] = useState(0);
  
  const [showConfig, setShowConfig] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [editingNgIndex, setEditingNgIndex] = useState(null);
  const [generatedPatterns, setGeneratedPatterns] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [saveStatus, setSaveStatus] = useState("✅ 自動保存済み");
  const [highlightTeacher, setHighlightTeacher] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [clipboard, setClipboard] = useState(null);
  const [isCompact, setIsCompact] = useState(false);
  const [dragSource, setDragSource] = useState(null);

  const fileInputRef = useRef(null);

  // Helper to get current tab data
  const activeTab = project.tabs.find(t => t.id === project.activeTabId) || project.tabs[0];
  const currentSchedule = activeTab.schedule;
  const currentConfig = activeTab.config;
  // 共通の科目はとりあえず現在のタブのsubjectCountsのキーから取得（タブごとに科目が違う場合は修正が必要だが今回は簡易化）
  const commonSubjects = Object.keys(currentConfig.subjectCounts);

  // --- Effects ---
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PROJECT, JSON.stringify(project));
    setSaveStatus("💾 保存中...");
    const timer = setTimeout(() => setSaveStatus("✅ 自動保存済み"), 800);
    return () => clearTimeout(timer);
  }, [project]);

  // --- State Updaters ---
  const updateProject = (newProject) => {
    setProject(newProject);
    // History logic here if needed (simplified for multi-tab complexity)
  };

  const updateCurrentSchedule = (newSchedule) => {
    const newTabs = project.tabs.map(t => 
      t.id === project.activeTabId ? { ...t, schedule: newSchedule } : t
    );
    updateProject({ ...project, tabs: newTabs });
  };

  const updateCurrentConfig = (key, value) => {
    const newTabs = project.tabs.map(t => 
      t.id === project.activeTabId ? { ...t, config: { ...t.config, [key]: value } } : t
    );
    updateProject({ ...project, tabs: newTabs });
  };

  // --- Logic: Cross-Tab Calculation ---
  // ★ v28: 全タブを横断して、講師・日付ごとのコマ数を集計する
  const globalDailyCounts = useMemo(() => {
    const counts = {}; // Key: "日付-講師名", Value: Count
    
    project.tabs.forEach(tab => {
      Object.keys(tab.schedule).forEach(key => {
        // key format: "date-period-class"
        // keyからdateを抽出するのは不安定なので、schedule登録時にdateを持たせるか、splitする
        // ここではsplitで対応 (dateにハイフンが含まれるとバグるリスクがあるが、現状の実装に合わせる)
        // 安全策: config.datesを使ってマッチングする
        const date = tab.config.dates.find(d => key.startsWith(d));
        const entry = tab.schedule[key];
        
        if (date && entry && entry.teacher && entry.teacher !== "未定") {
          const mapKey = `${date}-${entry.teacher}`;
          counts[mapKey] = (counts[mapKey] || 0) + 1;
        }
      });
    });
    return counts;
  }, [project]);

  // --- Logic: Analysis for Current Tab ---
  const analysis = useMemo(() => {
    const conflictMap = {}; const subjectOrders = {}; const dailySubjectMap = {};
    const errorKeys = [];
    
    // 現在のタブ内での分析
    currentConfig.dates.forEach(d => {
      currentConfig.periods.forEach(p => {
        const teacherInPeriod = {};
        currentConfig.classes.forEach(c => {
          const key = `${d}-${p}-${c}`;
          const entry = currentSchedule[key];
          
          // 科目回数カウント
          if (entry && entry.subject) {
            const subjKey = `${c}-${d}-${entry.subject}`;
            dailySubjectMap[subjKey] = (dailySubjectMap[subjKey] || 0) + 1;
            
            // クラス内での科目順序 (簡易計算)
            // Note: 正確な順序計算は全走査が必要
          }

          // 同時限の重複チェック
          if (entry && entry.teacher && entry.teacher !== "未定") {
            teacherInPeriod[entry.teacher] = (teacherInPeriod[entry.teacher] || 0) + 1;
          }
        });

        // 重複検出
        Object.entries(teacherInPeriod).forEach(([t, count]) => {
          if (count > 1) {
            conflictMap[`${d}-${p}-${t}`] = true;
            currentConfig.classes.forEach(c => {
              if (currentSchedule[`${d}-${p}-${c}`]?.teacher === t) {
                errorKeys.push(`${d}-${p}-${c}`);
              }
            });
          }
        });
      });
    });

    // クラスごとの科目カウント (Orderバッジ用)
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

    return { conflictMap, subjectOrders, dailySubjectMap, errorKeys };
  }, [currentSchedule, currentConfig]);

  // --- Handlers ---
  const handleAddTab = () => {
    const name = prompt("新しいタブの名前を入力してください (例: 午前・中2):");
    if (!name) return;
    const newId = Math.max(...project.tabs.map(t => t.id)) + 1;
    const newTab = {
      id: newId,
      name: name,
      config: { ...DEFAULT_TAB_CONFIG }, // デフォルト設定で開始
      schedule: {}
    };
    setProject({
      ...project,
      tabs: [...project.tabs, newTab],
      activeTabId: newId
    });
  };

  const handleDeleteTab = (e, id) => {
    e.stopPropagation();
    if (project.tabs.length <= 1) { alert("最後のタブは削除できません"); return; }
    if (!window.confirm("このタブとスケジュールを削除しますか？")) return;
    const newTabs = project.tabs.filter(t => t.id !== id);
    setProject({
      ...project,
      tabs: newTabs,
      activeTabId: newTabs[0].id
    });
  };

  const handleRenameTab = (e, id) => {
    e.stopPropagation(); // タブ切り替えを防ぐ
    const tab = project.tabs.find(t => t.id === id);
    const newName = prompt("タブ名を変更:", tab.name);
    if (newName) {
      const newTabs = project.tabs.map(t => t.id === id ? { ...t, name: newName } : t);
      setProject({ ...project, tabs: newTabs });
    }
  };

  const handleListConfigChange = (key, value) => {
    const arr = value.split(',').map(s => s.trim()).filter(s => s);
    updateCurrentConfig(key, arr);
  };

  const handleSubjectCountChange = (subj, val) => {
    const newCounts = { ...currentConfig.subjectCounts, [subj]: parseInt(val) || 0 };
    updateCurrentConfig('subjectCounts', newCounts);
  };

  // 講師マスタ操作 (Global)
  const addTeacher = () => {
    const name = prompt("講師名:");
    if(name) setProject(p => ({ ...p, teachers: [...p.teachers, { name, subjects: [], ngSlots: [], ngClasses: [] }] }));
  };
  const toggleTeacherSubject = (idx, subj) => {
    setProject(p => {
      const newTeachers = [...p.teachers];
      const t = newTeachers[idx];
      if(t.subjects.includes(subj)) t.subjects = t.subjects.filter(s => s !== subj);
      else t.subjects.push(subj);
      return { ...p, teachers: newTeachers };
    });
  };
  const toggleTeacherNg = (idx, date, period) => {
    setProject(p => {
      const newTeachers = [...p.teachers];
      // Note: NGスロットは「日付-時限」文字列で管理しているため、
      // 異なるタブで同じ「日付-時限」文字列があれば共有される（これは正しい挙動）
      const key = `${date}-${period}`;
      const t = newTeachers[idx];
      if(!t.ngSlots) t.ngSlots = [];
      if(t.ngSlots.includes(key)) t.ngSlots = t.ngSlots.filter(k => k !== key);
      else t.ngSlots.push(key);
      return { ...p, teachers: newTeachers };
    });
  };
  const removeTeacher = (idx) => {
    if(window.confirm("削除しますか？")) {
      setProject(p => ({ ...p, teachers: p.teachers.filter((_, i) => i !== idx) }));
    }
  };

  // Schedule Operations
  const handleAssign = (date, period, cls, type, value) => {
    const key = `${date}-${period}-${cls}`;
    if (currentSchedule[key]?.locked) return;
    const newEntry = { ...(currentSchedule[key] || {}) };
    if (type === 'subject') { newEntry.subject = value; newEntry.teacher = ""; }
    else { newEntry[type] = value; }
    
    updateCurrentSchedule({ ...currentSchedule, [key]: newEntry });
  };

  const toggleLock = (date, period, cls) => {
    const key = `${date}-${period}-${cls}`;
    const newEntry = { ...(currentSchedule[key] || {}) };
    newEntry.locked = !newEntry.locked;
    updateCurrentSchedule({ ...currentSchedule, [key]: newEntry });
  };

  // Drag & Drop
  const handleDragStart = (e, key, data) => {
    if (data.locked || !data.subject) { e.preventDefault(); return; }
    setDragSource({ key, data });
    e.dataTransfer.effectAllowed = "move";
    e.target.style.opacity = '0.5';
  };
  const handleDrop = (e, targetKey, targetData) => {
    e.preventDefault();
    if (!dragSource || dragSource.key === targetKey || targetData.locked) return;
    const newSchedule = { ...currentSchedule };
    newSchedule[dragSource.key] = { ...targetData, locked: false };
    newSchedule[targetKey] = { ...dragSource.data, locked: false };
    updateCurrentSchedule(newSchedule);
    setDragSource(null);
    e.target.style.opacity = '1';
  };

  // Dashboard Metrics
  const dashboard = useMemo(() => {
    const total = Object.values(currentConfig.subjectCounts).reduce((a,b)=>a+b,0) * currentConfig.classes.length;
    let filled = 0;
    Object.values(currentSchedule).forEach(v => { if(v.subject) filled++; });
    const progress = total > 0 ? Math.round((filled/total)*100) : 0;
    return { progress, filled, total };
  }, [currentSchedule, currentConfig]);

  const handleDownloadExcel = () => {
    const wb = XLSX.utils.book_new();
    
    // 全タブを出力
    project.tabs.forEach(tab => {
      const header = ["日付", "時限", ...tab.config.classes];
      const rows = [];
      tab.config.dates.forEach(d => {
        tab.config.periods.forEach(p => {
          const row = [d, p];
          tab.config.classes.forEach(c => {
            const e = tab.schedule[`${d}-${p}-${c}`];
            row.push(e && e.subject ? `${e.subject}\n${e.teacher}` : "");
          });
          rows.push(row);
        });
      });
      const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
      ws['!cols'] = [{ wch: 15 }, { wch: 15 }, ...tab.config.classes.map(() => ({ wch: 20 }))];
      XLSX.utils.book_append_sheet(wb, ws, tab.name);
    });

    // 講師別集計（全タブ合算）
    const totalCounts = {};
    Object.entries(globalDailyCounts).forEach(([key, count]) => {
      const [_, name] = key.split('-'); // 簡易分割
      totalCounts[name] = (totalCounts[name] || 0) + count;
    });
    const summaryRows = [["講師名", "全タブ合計コマ数"], ...Object.entries(totalCounts).sort((a,b)=>b[1]-a[1])];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(wb, wsSummary, "全講師集計");

    XLSX.writeFile(wb, `時間割プロジェクト_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  // --- Render ---
  return (
    <div className="p-4 bg-gray-50 min-h-screen font-sans">
      <style>{`@media print { @page { size: landscape; } .no-print { display: none; } }`}</style>

      {/* Header & Tabs */}
      <div className="no-print">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold text-gray-800">時間割作成くん v28 <span className="text-sm font-normal text-gray-500">マルチタブ管理版</span></h1>
          <div className="flex gap-2">
            <span className="text-xs text-green-600 font-bold mr-2 self-center">{saveStatus}</span>
            <button onClick={handleDownloadExcel} className="px-3 py-1 bg-green-700 text-white rounded text-sm">📊 全タブExcel出力</button>
            <button onClick={() => setShowConfig(true)} className="px-3 py-1 bg-gray-600 text-white rounded text-sm">⚙️ 設定</button>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="flex items-end gap-1 border-b-2 border-gray-300 mb-4 overflow-x-auto">
          {project.tabs.map(tab => (
            <div 
              key={tab.id}
              onClick={() => setProject({ ...project, activeTabId: tab.id })}
              onDoubleClick={(e) => handleRenameTab(e, tab.id)}
              className={`px-4 py-2 rounded-t-lg cursor-pointer flex items-center gap-2 select-none transition-colors ${project.activeTabId === tab.id ? "bg-white border-t-2 border-l-2 border-r-2 border-gray-300 -mb-[2px] font-bold text-blue-700 z-10" : "bg-gray-200 text-gray-600 hover:bg-gray-300"}`}
            >
              {tab.name}
              {project.tabs.length > 1 && (
                <span onClick={(e) => handleDeleteTab(e, tab.id)} className="text-xs text-gray-400 hover:text-red-500 font-bold px-1">×</span>
              )}
            </div>
          ))}
          <button onClick={handleAddTab} className="px-3 py-2 text-gray-500 hover:text-blue-600 font-bold text-sm">+ タブ追加</button>
        </div>
      </div>

      {/* Main Content Area (Active Tab) */}
      <div className="bg-white p-1 rounded min-h-[500px]">
        
        {/* Dashboard for Current Tab */}
        <div className="flex justify-between items-center bg-blue-50 p-2 rounded mb-4 border border-blue-100 no-print">
          <div className="flex items-center gap-4">
            <div className="font-bold text-blue-800">{activeTab.name} の進捗:</div>
            <div className="w-40 h-3 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${dashboard.progress}%` }}></div>
            </div>
            <div className="text-sm font-bold text-blue-700">{dashboard.progress}% ({dashboard.filled}/{dashboard.total})</div>
          </div>
          {analysis.errorKeys.length > 0 && (
            <div className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-bold animate-pulse">⚠️ このタブに重複が {analysis.errorKeys.length} 件あります</div>
          )}
          <button onClick={() => setIsCompact(!isCompact)} className="text-xs border px-2 py-1 bg-white rounded">{isCompact ? "🔍 標準表示" : "📏 縮小表示"}</button>
        </div>

        {/* Schedule Table */}
        <div className={`overflow-auto shadow border border-gray-300 max-h-[75vh] ${isCompact ? "text-xs" : "text-sm"}`}>
          <table className="w-full border-collapse text-left relative">
            <thead className="sticky top-0 z-30 bg-gray-800 text-white shadow">
              <tr>
                <th className={`border-r border-gray-600 sticky left-0 z-40 bg-gray-800 ${isCompact ? "p-1 w-16" : "p-3 w-24"}`}>日付</th>
                <th className={`border-r border-gray-600 sticky left-24 z-30 bg-gray-800 ${isCompact ? "p-1 w-16" : "p-3 w-24"}`}>時限</th>
                {currentConfig.classes.map(c => <th key={c} className={`border-r border-gray-600 ${isCompact ? "p-1 min-w-[100px]" : "p-3 min-w-[150px]"}`}>{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {currentConfig.dates.map((d, dIdx) => (
                currentConfig.periods.map((p, pIdx) => {
                  const isDayEnd = pIdx === currentConfig.periods.length - 1;
                  const borderClass = isDayEnd ? "border-b-4 border-gray-400" : "border-b hover:bg-gray-50";
                  return (
                    <tr key={`${d}-${p}`} className={borderClass}>
                      {pIdx === 0 && <td rowSpan={currentConfig.periods.length} className={`font-bold align-top bg-gray-100 border-r sticky left-0 z-20 border-b-4 border-gray-400 ${isCompact ? "p-1" : "p-3"}`}>{d}</td>}
                      <td className={`border-r bg-gray-50 text-gray-700 sticky left-24 z-10 ${isDayEnd ? "border-b-4 border-gray-400" : ""} ${isCompact ? "p-1" : "p-3"}`}>{p}</td>
                      {currentConfig.classes.map((c, cIdx) => {
                        const key = `${d}-${p}-${c}`;
                        const entry = currentSchedule[key] || {};
                        const isLocked = entry.locked;
                        const teacherConflict = analysis.conflictMap[`${d}-${p}-${entry.teacher}`];
                        const countOrder = analysis.subjectOrders[key] || 0;
                        const maxCnt = currentConfig.subjectCounts[entry.subject] || 0;
                        const isOver = maxCnt > 0 && countOrder > maxCnt;
                        const filteredTeachers = entry.subject ? project.teachers.filter(t => t.subjects.includes(entry.subject)) : project.teachers;

                        return (
                          <td 
                            key={c}
                            className={`border-r last:border-0 ${isCompact ? "p-1" : "p-2"}`}
                            draggable={!isLocked && !!entry.subject}
                            onDragStart={(e) => handleDragStart(e, key, entry)}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => handleDrop(e, key, entry)}
                          >
                            <div className={`flex flex-col rounded ${teacherConflict ? "bg-red-200" : (SUBJECT_COLORS[entry.subject] || "bg-white")} ${isLocked ? "border-2 border-gray-500" : "border border-gray-200"} ${isCompact ? "gap-0 p-1" : "gap-2 p-2"}`}>
                              {/* Subject Select */}
                              <div className="flex relative">
                                <select 
                                  className={`w-full bg-transparent font-medium focus:outline-none ${isOver ? "text-red-600 font-bold" : ""}`}
                                  value={entry.subject || ""}
                                  onChange={(e) => handleAssign(d, p, c, 'subject', e.target.value)}
                                  disabled={isLocked}
                                >
                                  <option value="">-</option>
                                  {commonSubjects.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                                {entry.subject && <span className={`absolute right-0 text-[10px] px-1 rounded ${isOver ? "bg-red-500 text-white" : "bg-white/50 border"}`}>{toCircleNum(countOrder)}{isOver && "!"}</span>}
                              </div>
                              
                              {/* Teacher Select */}
                              <select 
                                className={`w-full rounded ${teacherConflict ? "bg-red-100 text-red-600 font-bold" : "bg-white/50 text-blue-900"} ${isCompact ? "text-[10px]" : "text-sm"}`}
                                value={entry.teacher || ""}
                                onChange={(e) => handleAssign(d, p, c, 'teacher', e.target.value)}
                                disabled={!entry.subject || isLocked}
                              >
                                <option value="">-</option>
                                {filteredTeachers.map(t => {
                                  // Cross-Tab Daily Count Check
                                  // 現在のタブだけでなく、全タブ合計の「その日のコマ数」を表示
                                  const dayKey = `${d}-${t.name}`;
                                  const totalCount = globalDailyCounts[dayKey] || 0;
                                  const isBusy = totalCount >= 4; // Warning threshold
                                  const label = `${t.name} (計${totalCount})`;
                                  return <option key={t.name} value={t.name} className={isBusy ? "bg-yellow-100" : ""}>{label}{isBusy ? "⚠️" : ""}</option>;
                                })}
                              </select>
                              <div className="text-right">
                                <button onClick={() => toggleLock(d, p, c)} className="text-xs text-gray-400 hover:text-gray-800">{isLocked ? "🔒" : "🔓"}</button>
                              </div>
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

      {/* Config Modal (Split View) */}
      {showConfig && (
        <div className="fixed inset-0 bg-black/50 z-50 flex justify-center items-center p-4 no-print">
          <div className="bg-white w-full max-w-5xl h-[85vh] rounded-lg shadow-2xl flex flex-col overflow-hidden animate-fade-in">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50">
              <h2 className="font-bold text-lg text-gray-700">⚙️ 設定メニュー</h2>
              <button onClick={() => setShowConfig(false)} className="text-2xl font-bold text-gray-400 hover:text-gray-600">×</button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Left: Tab Specific Settings */}
              <div>
                <h3 className="font-bold text-blue-800 mb-4 border-b pb-2">📅 現在のタブ ({activeTab.name}) の設定</h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-gray-500">日付リスト (カンマ区切り)</label>
                    <textarea className="w-full border p-2 text-sm h-20 rounded" value={currentConfig.dates.join(", ")} onChange={(e) => handleListConfigChange('dates', e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500">時限リスト</label>
                    <textarea className="w-full border p-2 text-sm h-16 rounded" value={currentConfig.periods.join(", ")} onChange={(e) => handleListConfigChange('periods', e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500">クラスリスト</label>
                    <textarea className="w-full border p-2 text-sm h-16 rounded" value={currentConfig.classes.join(", ")} onChange={(e) => handleListConfigChange('classes', e.target.value)} />
                  </div>
                  <div className="bg-yellow-50 p-2 rounded border">
                    <label className="text-xs font-bold text-gray-600">必要コマ数 (このタブでの目標)</label>
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      {commonSubjects.map(s => (
                        <div key={s} className="flex justify-between bg-white p-1 border rounded"><span className="text-xs">{s}</span><input type="number" className="w-10 text-right text-xs" value={currentConfig.subjectCounts[s]} onChange={(e) => handleSubjectCountChange(s, e.target.value)} /></div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: Global Teacher Settings */}
              <div className="border-l pl-6">
                <h3 className="font-bold text-green-800 mb-4 border-b pb-2">👤 講師マスタ (全タブ共通)</h3>
                <div className="flex justify-end mb-2"><button onClick={addTeacher} className="text-xs bg-green-600 text-white px-2 py-1 rounded">+ 講師追加</button></div>
                <div className="overflow-y-auto max-h-[400px] border rounded bg-gray-50 p-2">
                  <table className="w-full text-sm">
                    <thead><tr><th className="text-left p-1">氏名</th><th className="text-left p-1">担当科目</th><th className="w-8"></th></tr></thead>
                    <tbody>
                      {project.teachers.map((t, i) => (
                        <tr key={i} className="border-b bg-white">
                          <td className="p-2 font-bold">{t.name}</td>
                          <td className="p-2 flex flex-wrap gap-1">
                            {commonSubjects.map(s => (
                              <label key={s} className={`px-1 border rounded cursor-pointer text-xs ${t.subjects.includes(s) ? "bg-blue-100 border-blue-300" : "opacity-50"}`}>
                                <input type="checkbox" className="hidden" checked={t.subjects.includes(s)} onChange={() => toggleTeacherSubject(i, s)} />
                                {s}
                              </label>
                            ))}
                          </td>
                          <td className="p-2 text-center"><button onClick={() => removeTeacher(i)} className="text-red-400 hover:text-red-600">×</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-gray-400 mt-2">※NG設定などは各タブのカレンダー上で行うか、将来的に共通化予定</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}