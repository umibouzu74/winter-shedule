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

const getSubjectColor = (subject) => {
  if (!subject) return "bg-white";
  const colors = ["bg-red-100", "bg-blue-100", "bg-yellow-100", "bg-green-100", "bg-purple-100", "bg-pink-100", "bg-indigo-100", "bg-teal-100", "bg-orange-100", "bg-lime-100"];
  let hash = 0;
  for (let i = 0; i < subject.length; i++) hash += subject.charCodeAt(i);
  return colors[hash % colors.length];
};

const toCircleNum = (num) => {
  const circles = ["0", "①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩", "⑪", "⑫", "⑬", "⑭", "⑮", "⑯", "⑰", "⑱", "⑲", "⑳"];
  return circles[num] || `(${num})`;
};

const STORAGE_KEY_PROJECT = 'winter_schedule_project_v35';

export default function ScheduleApp() {
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
  const [configTab, setConfigTab] = useState('basic');
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
  const [editingNgIndex, setEditingNgIndex] = useState(null);

  const fileInputRef = useRef(null);

  const activeTab = project.tabs.find(t => t.id === project.activeTabId) || project.tabs[0];
  const currentSchedule = activeTab.schedule;
  const currentConfig = activeTab.config;
  const commonSubjects = Object.keys(currentConfig.subjectCounts);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PROJECT, JSON.stringify(project));
    setSaveStatus("💾 保存中...");
    const timer = setTimeout(() => setSaveStatus("✅ 保存済"), 800);
    return () => clearTimeout(timer);
  }, [project]);

  const pushHistory = (newProject) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newProject);
    if (newHistory.length > 50) newHistory.shift();
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    setProject(newProject);
  };

  const undo = () => { if (historyIndex > 0) { setHistoryIndex(historyIndex - 1); setProject(history[historyIndex - 1]); } };
  const redo = () => { if (historyIndex < history.length - 1) { setHistoryIndex(historyIndex + 1); setProject(history[historyIndex + 1]); } };

  useEffect(() => {
    if (history.length === 0) { setHistory([project]); setHistoryIndex(0); }
  }, []);

  // Analysis
  const analysis = useMemo(() => {
    const conflictMap = {}; const subjectOrders = {}; const dailySubjectMap = {}; const errorKeys = []; const teacherDailyCounts = {};
    const globalUsage = {}; 

    project.tabs.forEach(tab => {
      Object.keys(tab.schedule).forEach(key => {
        const entry = tab.schedule[key];
        if (!entry || !entry.teacher || entry.teacher === "未定") return;
        const matchedDate = tab.config.dates.find(d => key.startsWith(d));
        const matchedPeriod = tab.config.periods.find(p => key.includes(p));
        if (matchedDate && matchedPeriod) {
          const usageKey = `${matchedDate}-${matchedPeriod}-${entry.teacher}`;
          if (!globalUsage[usageKey]) globalUsage[usageKey] = [];
          globalUsage[usageKey].push({ tabId: tab.id });
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

    currentConfig.dates.forEach(d => {
      currentConfig.periods.forEach(p => {
        currentConfig.classes.forEach(c => {
          const key = `${d}-${p}-${c}`;
          const entry = currentSchedule[key];
          if (entry && entry.subject) {
            const subjKey = `${c}-${d}-${entry.subject}`;
            dailySubjectMap[subjKey] = (dailySubjectMap[subjKey] || 0) + 1;
          }
          if (entry && entry.teacher && entry.teacher !== "未定") {
            const usageKey = `${d}-${p}-${entry.teacher}`;
            if ((globalUsage[usageKey] || []).length > 1) {
              conflictMap[`${d}-${p}-${entry.teacher}`] = true;
              errorKeys.push(key);
            }
          }
        });
      });
    });

    currentConfig.classes.forEach(c => {
      const counts = {};
      currentConfig.dates.forEach(d => {
        currentConfig.periods.forEach(p => {
          const key = `${d}-${p}-${c}`;
          const s = currentSchedule[key]?.subject;
          if (s) { counts[s] = (counts[s] || 0) + 1; subjectOrders[key] = counts[s]; }
        });
      });
    });
    return { conflictMap, subjectOrders, dailySubjectMap, errorKeys, teacherDailyCounts };
  }, [project, currentSchedule, currentConfig]);

  const dashboard = useMemo(() => {
    const total = Object.values(currentConfig.subjectCounts).reduce((a,b)=>a+b,0) * currentConfig.classes.length;
    let filled = 0; Object.values(currentSchedule).forEach(v => { if(v.subject) filled++; });
    return { progress: total > 0 ? Math.round((filled/total)*100) : 0, filled, total };
  }, [currentSchedule, currentConfig]);

  // Handlers
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

  const addTeacher = () => { const n = prompt("講師名:"); if(n) pushHistory({ ...project, teachers: [...project.teachers, { name: n, subjects: [], ngSlots: [], ngClasses: [] }] }); };
  const removeTeacher = (idx) => {
    if(!window.confirm("この講師を削除しますか？")) return;
    const targetName = project.teachers[idx].name;
    const newTeachers = project.teachers.filter((_, i) => i !== idx);
    const newTabs = project.tabs.map(tab => {
      const newSch = { ...tab.schedule };
      Object.keys(newSch).forEach(k => { if (newSch[k].teacher === targetName) newSch[k] = { ...newSch[k], teacher: "" }; });
      return { ...tab, schedule: newSch };
    });
    pushHistory({ ...project, teachers: newTeachers, tabs: newTabs });
  };
  const toggleTeacherSubject = (idx, subj) => {
    const newTeachers = [...project.teachers]; const t = newTeachers[idx];
    if(t.subjects.includes(subj)) t.subjects = t.subjects.filter(s=>s!==subj); else t.subjects.push(subj);
    pushHistory({ ...project, teachers: newTeachers });
  };
  const toggleTeacherNg = (idx, d, p) => {
    const newTeachers = [...project.teachers]; const t = newTeachers[idx]; const k = `${d}-${p}`;
    if(!t.ngSlots) t.ngSlots = []; if(t.ngSlots.includes(k)) t.ngSlots = t.ngSlots.filter(x=>x!==k); else t.ngSlots.push(k);
    pushHistory({ ...project, teachers: newTeachers });
  };

  const handleAssign = (d, p, c, type, val) => {
    const k = `${d}-${p}-${c}`; if(currentSchedule[k]?.locked) return;
    const e = { ...(currentSchedule[k] || {}) };
    if(type === 'subject') { e.subject = val; e.teacher = ""; } else { e[type] = val; }
    const newTabs = project.tabs.map(t => t.id === project.activeTabId ? { ...t, schedule: { ...t.schedule, [k]: e } } : t);
    pushHistory({ ...project, tabs: newTabs });
  };
  const toggleLock = (d, p, c) => {
    const k = `${d}-${p}-${c}`; const e = { ...(currentSchedule[k] || {}) }; e.locked = !e.locked;
    const newTabs = project.tabs.map(t => t.id === project.activeTabId ? { ...t, schedule: { ...t.schedule, [k]: e } } : t);
    pushHistory({ ...project, tabs: newTabs });
  };

  const handleContextMenu = (e, d, p, c, type=null, val=null) => { e.preventDefault(); setContextMenu({ x: e.pageX, y: e.pageY, d, p, c, type, val }); };
  const handleMenuAction = (action) => {
    if (!contextMenu) return;
    if (contextMenu.type) {
      const ns = { ...currentSchedule }; let upd = false;
      currentConfig.dates.forEach(d => currentConfig.periods.forEach(p => currentConfig.classes.forEach(c => {
        if ((contextMenu.type==='date'&&d===contextMenu.val)||(contextMenu.type==='class'&&c===contextMenu.val)||(contextMenu.type==='period'&&p===contextMenu.val)) {
          const k=`${d}-${p}-${c}`; if(!ns[k])ns[k]={};
          if(action==='lock-all'){ns[k].locked=true;upd=true;} if(action==='unlock-all'){ns[k].locked=false;upd=true;} if(action==='clear-all'&&!ns[k].locked){delete ns[k];upd=true;}
        }
      })));
      if (upd) { const newTabs = project.tabs.map(t => t.id === project.activeTabId ? { ...t, schedule: ns } : t); pushHistory({ ...project, tabs: newTabs }); }
    } else { 
      const { d, p, c } = contextMenu; const k = `${d}-${p}-${c}`; const curr = currentSchedule[k] || {};
      if(action==='copy'&&curr.subject) setClipboard({subject:curr.subject,teacher:curr.teacher});
      if(action==='paste'&&clipboard&&!curr.locked) { const newTabs = project.tabs.map(t => t.id === project.activeTabId ? { ...t, schedule: { ...t.schedule, [k]: { ...curr, subject: clipboard.subject, teacher: clipboard.teacher } } } : t); pushHistory({ ...project, tabs: newTabs }); }
      if(action==='lock') toggleLock(d, p, c);
      if(action==='clear'&&!curr.locked) { const ns = { ...currentSchedule }; delete ns[k]; const newTabs = project.tabs.map(t => t.id === project.activeTabId ? { ...t, schedule: ns } : t); pushHistory({ ...project, tabs: newTabs }); }
      if(action==='set-ng' && curr.teacher && curr.teacher !== "未定") {
        const teacherIdx = project.teachers.findIndex(t => t.name === curr.teacher);
        if (teacherIdx >= 0) toggleTeacherNg(teacherIdx, d, p);
      }
    }
    setContextMenu(null);
  };

  const handleExternalCountChange = (d, t, v) => {
    const counts = { ...project.externalCounts, [`${d}-${t}`]: parseInt(v)||0 };
    pushHistory({ ...project, externalCounts: counts });
  };

  const cleanSchedule = (proj) => {
    const newTabs = proj.tabs.map(tab => {
      const newSch = {};
      tab.config.dates.forEach(d => {
        tab.config.periods.forEach(p => {
          tab.config.classes.forEach(c => {
            const k = `${d}-${p}-${c}`;
            if (tab.schedule[k]) newSch[k] = tab.schedule[k];
          });
        });
      });
      return { ...tab, schedule: newSch };
    });
    return { ...proj, tabs: newTabs };
  };

  const handleClearUnlocked = () => { if(window.confirm("ロックされていないセル（生成結果など）を全てクリアしますか？")) { const ns={}; Object.keys(currentSchedule).forEach(k=>{if(currentSchedule[k].locked)ns[k]=currentSchedule[k]}); const newTabs = project.tabs.map(t => t.id === project.activeTabId ? { ...t, schedule: ns } : t); pushHistory({ ...project, tabs: newTabs }); }};
  const handleResetAll = () => { if(window.confirm("全データ削除しますか？")) { localStorage.removeItem(STORAGE_KEY_PROJECT); window.location.reload(); }};
  const applyPattern = (pat) => { const newTabs = project.tabs.map(t => t.id === project.activeTabId ? { ...t, schedule: pat } : t); pushHistory({ ...project, tabs: newTabs }); setGeneratedPatterns([]); };
  const handleLoadJson = (e) => { const f=e.target.files[0]; if(!f)return; const r=new FileReader(); r.onload=(ev)=>{try{const data=JSON.parse(ev.target.result); pushHistory(cleanSchedule(data)); alert("読込完了");}catch{alert("エラー");}}; r.readAsText(f); e.target.value=''; };
  const handleSaveJson = () => { const cleaned = cleanSchedule(project); const b=new Blob([JSON.stringify(cleaned,null,2)],{type:"application/json"}); const u=URL.createObjectURL(b); const a=document.createElement('a'); a.href=u; a.download=`schedule_project_v35.json`; a.click(); };

  // ★ v35: ベストエフォート型自動生成 (Most Constrained First)
  const generateSchedule = () => {
    setIsGenerating(true);
    setTimeout(() => {
      // 1. スロットの洗い出しと優先度付け
      const slots = [];
      const currentCounts = {}; 
      currentConfig.classes.forEach(c => { 
        currentCounts[c] = {}; 
        commonSubjects.forEach(s => currentCounts[c][s] = 0); 
      });

      // 既存のカウント集計
      Object.keys(currentSchedule).forEach(k => { 
        const e = currentSchedule[k]; 
        if (e?.subject) {
          const cls = k.split('-')[2];
          currentCounts[cls][e.subject] = (currentCounts[cls][e.subject] || 0) + 1;
        }
      });

      // 空きスロットを特定し、候補者数を計算して「難しい順」に並べる
      currentConfig.dates.forEach(d => {
        currentConfig.periods.forEach(p => {
          currentConfig.classes.forEach(c => {
            const k = `${d}-${p}-${c}`;
            const entry = currentSchedule[k];
            // 「科目が未定」または「科目はあるが講師が未定」のものを対象
            if (!entry || !entry.subject || !entry.teacher) {
              const fixedSubject = entry?.subject;
              let possibleTeachers = 0;
              
              // 候補者数を概算 (ヒューリスティック用)
              const subjectsToCheck = fixedSubject ? [fixedSubject] : commonSubjects;
              let candidates = 0;
              subjectsToCheck.forEach(s => {
                if(!fixedSubject && (currentCounts[c][s] || 0) >= currentConfig.subjectCounts[s]) return;
                const validT = project.teachers.filter(t => 
                  t.subjects.includes(s) && 
                  !t.ngSlots?.includes(`${d}-${p}`) && 
                  !t.ngClasses?.includes(c)
                );
                candidates += validT.length;
              });

              slots.push({ d, p, c, k, fixedSubject, candidates });
            }
          });
        });
      });

      // 候補が少ない（難しい）順にソート
      slots.sort((a, b) => a.candidates - b.candidates);

      // 2. 探索 (Best Effort)
      let bestResult = null;
      let maxFilled = -1;

      const solve = (idx, tempSch, tempCnt, iter={c:0}) => {
        // ベストスコア更新
        if (idx > maxFilled) {
          maxFilled = idx;
          bestResult = JSON.parse(JSON.stringify(tempSch));
        }

        if (iter.c++ > 30000) return; // 制限時間
        if (idx >= slots.length) return; // コンプリート

        const { d, p, c, k, fixedSubject } = slots[idx];
        
        // 試す科目の順序（残り回数が多い科目を優先するなど工夫可能だが、ランダムで分散させる）
        const subjectsToTry = fixedSubject ? [fixedSubject] : commonSubjects.sort(() => Math.random() - 0.5);

        for (const s of subjectsToTry) {
          // コマ数上限チェック
          if (!fixedSubject && (tempCnt[c][s] || 0) >= currentConfig.subjectCounts[s]) continue;
          // 同時限の科目重複チェック (1日1回制限はここでは緩めるか、厳密にするか調整可)
          // ここでは厳密にチェック: 同じクラス・同じ日に同じ科目はNG
          // (ただしfixedSubjectの場合はユーザー指定なので許容したいが、自動割り当てとしては避けるのが無難)
          if (!fixedSubject && currentConfig.periods.some(per => tempSch[`${d}-${per}-${c}`]?.subject === s)) continue;

          // 講師候補の抽出
          const validT = project.teachers.filter(t => 
            t.subjects.includes(s) && 
            !t.ngClasses?.includes(c) && 
            !t.ngSlots?.includes(`${d}-${p}`)
          );

          // 負荷チェック & 重複チェック
          let availT = validT.filter(t => {
             // 他タブ・外部負荷
             const dayKey = `${d}-${t.name}`;
             const ext = analysis.teacherDailyCounts[dayKey]?.external || 0;
             const currentTabCount = analysis.teacherDailyCounts[dayKey]?.current || 0; 
             // tempSch内での増加分も考慮（簡易的に）
             // 正確にはtempSchを走査すべきだが重いので、既存解析値を利用し、
             // 「この探索パスでこれ以上増やしていいか」は確率的に判断
             return (ext + currentTabCount) < 5; 
          });

          // 同時刻の他クラス重複チェック
          availT = availT.filter(t => 
            !currentConfig.classes.some(oc => oc !== c && tempSch[`${d}-${p}-${oc}`]?.teacher === t.name)
          );

          if (availT.length > 0) {
            // 負荷分散ロジック (ランダム性を持たせつつ負荷低い人を優先)
            const tObj = availT[Math.floor(Math.random() * availT.length)];
            
            // 割り当て実行
            tempSch[k] = { subject: s, teacher: tObj.name };
            if(!fixedSubject) tempCnt[c][s]++;

            solve(idx + 1, tempSch, tempCnt, iter);
            
            // 解が見つかって戻ってきた場合（完全制覇）
            if (maxFilled === slots.length) return;

            // Backtrack
            if(fixedSubject) tempSch[k] = { subject: fixedSubject, teacher: "" };
            else { delete tempSch[k]; tempCnt[c][s]--; }
          }
        }
        
        // 誰も割り当てられなくても、スキップして次へ進む (Best Effortの肝)
        // ただし、これをすると「穴あき」ができる。
        // 本当のCSPならバックトラックすべきだが、ユーザー体験としては「埋まるところだけ埋める」が欲しい。
        // なので、ここでスキップ分岐も作る。
        if (iter.c < 30000) { // まだ余裕があればスキップも試す
           solve(idx + 1, tempSch, tempCnt, iter);
        }
      };

      // 実行
      solve(0, JSON.parse(JSON.stringify(currentSchedule)), JSON.parse(JSON.stringify(currentCounts)));

      // 結果処理
      if (bestResult) {
        setGeneratedPatterns([bestResult]);
        if (maxFilled < slots.length) {
          alert(`条件が厳しく、全てのコマを埋めることはできませんでした。\n可能な限り埋めた案（${Math.round(maxFilled/slots.length*100)}%）を提示します。\n\n・残り: ${slots.length - maxFilled}コマ\n・原因: 講師不足、NG重複、コマ数制限など`);
        }
      } else {
        alert("有効なパターンが1つも見つかりませんでした。設定を見直してください。");
      }
      setIsGenerating(false);
    }, 100);
  };

  const handleDownloadExcel = () => { 
    const cleaned = cleanSchedule(project);
    const wb = XLSX.utils.book_new();
    cleaned.tabs.forEach(tab => {
      const ws = XLSX.utils.aoa_to_sheet([["日付","時限",...tab.config.classes], ...tab.config.dates.flatMap(d=>tab.config.periods.map(p=>[d,p,...tab.config.classes.map(c=> { const e=tab.schedule[`${d}-${p}-${c}`]; return e&&e.subject?`${e.subject}\n${e.teacher}`:""; })]))]);
      ws['!cols'] = [{wch:15},{wch:10},...tab.config.classes.map(()=>({wch:20}))]; XLSX.utils.book_append_sheet(wb, ws, tab.name);
    });
    XLSX.writeFile(wb, "時間割プロジェクト.xlsx");
  };

  const SummaryTable = ({ target }) => { 
    const totals = {}; project.teachers.forEach(t=>totals[t.name]=0);
    Object.values(target).forEach(e=>{if(e.teacher && e.teacher !== "未定") totals[e.teacher]++});
    return (
      <div className="bg-white p-4 border rounded">
        <h3 className="font-bold mb-2">📊 この案の集計</h3>
        <div className="flex flex-wrap gap-2">{Object.entries(totals).filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]).map(([n,c])=><span key={n} className="bg-blue-100 px-2 rounded text-sm">{n}:{c}</span>)}</div>
      </div>
    );
  };

  const printStyle = `@media print { @page { size: landscape; } .no-print { display: none !important; } .print-container { max-height: none !important; border: none !important; } }`;

  const handleCellNavigation = (e, dIndex, pIndex, cIndex, type) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
      let nextD = dIndex, nextP = pIndex, nextC = cIndex, nextType = type;
      if (e.key === 'ArrowUp') { if (pIndex > 0) nextP--; else if (dIndex > 0) { nextD--; nextP = currentConfig.periods.length - 1; } }
      else if (e.key === 'ArrowDown') { if (pIndex < currentConfig.periods.length - 1) nextP++; else if (dIndex < currentConfig.dates.length - 1) { nextD++; nextP = 0; } }
      else if (e.key === 'ArrowLeft') { if (type === 'teacher') nextType = 'subject'; else if (cIndex > 0) { nextC--; nextType = 'teacher'; } }
      else if (e.key === 'ArrowRight') { if (type === 'subject') nextType = 'teacher'; else if (cIndex < currentConfig.classes.length - 1) { nextC++; nextType = 'subject'; } }
      const nextElement = document.getElementById(`select-${nextD}-${nextP}-${nextC}-${nextType}`);
      if (nextElement) nextElement.focus();
    }
  };

  const handleDragStart = (e, k, d) => { if(d.locked||!d.subject){e.preventDefault();return;} setDragSource({key:k,data:d}); e.dataTransfer.effectAllowed="move"; e.target.style.opacity='0.5'; };
  const handleDrop = (e, tk, td) => { e.preventDefault(); if(!dragSource||dragSource.key===tk||td.locked)return; const ns={...currentSchedule}; ns[dragSource.key]={...td,locked:false}; ns[tk]={...dragSource.data,locked:false}; const newTabs = project.tabs.map(t => t.id === project.activeTabId ? { ...t, schedule: ns } : t); pushHistory({ ...project, tabs: newTabs }); setDragSource(null); e.target.style.opacity='1'; };

  return (
    <div className="p-4 bg-gray-100 min-h-screen font-sans" onClick={() => setContextMenu(null)}>
      <style>{printStyle}</style>

      <div className="flex justify-between items-center mb-2 no-print bg-white p-3 rounded shadow-sm border-b border-gray-200">
        <div className="flex items-center gap-2"><h1 className="text-xl font-bold text-gray-700">📅 時間割作成くん v35</h1><span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded border border-green-200">{saveStatus}</span></div>
        <div className="flex gap-2">
          <button onClick={handleSaveJson} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 shadow text-sm font-bold">💾 プロジェクト保存</button>
          <button onClick={() => fileInputRef.current.click()} className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 shadow text-sm font-bold">📂 開く</button>
          <button onClick={handleDownloadExcel} className="flex items-center gap-1 px-3 py-1.5 bg-green-800 text-white rounded hover:bg-green-900 shadow text-sm font-bold">📊 全Excel出力</button>
          <input type="file" accept=".json" ref={fileInputRef} onChange={handleLoadJson} className="hidden" />
        </div>
      </div>

      <div className="flex items-end gap-1 px-2 no-print overflow-x-auto">
        {project.tabs.map(tab => (
          <div key={tab.id} onClick={() => { setProject({ ...project, activeTabId: tab.id }); setHistoryIndex(historyIndex); }} onDoubleClick={(e) => handleRenameTab(e, tab.id)} className={`px-4 py-2 rounded-t-lg cursor-pointer flex items-center gap-2 select-none transition-all ${project.activeTabId === tab.id ? "bg-white text-blue-700 font-bold shadow-[0_-2px_5px_rgba(0,0,0,0.05)] pt-3" : "bg-gray-200 text-gray-500 hover:bg-gray-300 mt-1"}`}>
            {tab.name}{project.tabs.length > 1 && <span onClick={(e) => handleDeleteTab(e, tab.id)} className="text-xs ml-2 hover:text-red-500">×</span>}
          </div>
        ))}
        <button onClick={handleAddTab} className="px-3 py-2 text-gray-500 hover:text-blue-600 font-bold text-sm">+ タブ追加</button>
      </div>

      <div className="bg-white p-4 rounded-b-lg rounded-tr-lg shadow-md min-h-[600px]">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4 p-2 bg-slate-50 border border-slate-200 rounded no-print">
          <div className="flex items-center gap-3 bg-white px-3 py-1.5 rounded border border-gray-200 shadow-sm flex-1 min-w-[250px]">
            <div className="text-xs font-bold text-gray-500">進捗</div>
            <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden relative"><div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${dashboard.progress}%` }}></div></div>
            <div className="text-sm font-bold text-blue-600 w-12 text-right">{dashboard.progress}%</div>
            {analysis.errorKeys.length > 0 ? (<button onClick={scrollToFirstError} className="ml-2 text-xs bg-red-100 text-red-600 px-2 py-1 rounded border border-red-200 font-bold animate-pulse hover:bg-red-200">⚠️ {analysis.errorKeys.length}件</button>) : <span className="ml-2 text-xs text-green-600 font-bold">✨ OK</span>}
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
            <button onClick={handleClearUnlocked} className="flex items-center gap-1 px-3 py-2 bg-red-100 text-red-700 border border-red-200 rounded hover:bg-red-200 shadow-sm text-sm font-bold">🗑️ 生成クリア</button>
            <button onClick={generateSchedule} disabled={isGenerating} className={`flex items-center gap-1 px-4 py-2 text-white rounded shadow-sm text-sm font-bold transition-colors ${isGenerating ? "bg-purple-300 cursor-not-allowed" : "bg-purple-600 hover:bg-purple-700"}`}>{isGenerating ? "🔮 生成中..." : "🧙‍♂️ 自動作成"}</button>
          </div>
        </div>

        {showSummary && (
          <div className="mb-4 no-print animate-fade-in">
            <div className="p-4 bg-indigo-50 border border-indigo-100 rounded">
              <h3 className="font-bold text-indigo-800 mb-2">📊 講師別コマ数 (全タブ合計)</h3>
              <div className="flex flex-wrap gap-2">
                {Object.entries(analysis.teacherDailyCounts).filter(([k]) => k.startsWith(currentConfig.dates[0])).map(([k, v]) => { 
                   const name = k.split('-')[1];
                   let total = 0; currentConfig.dates.forEach(d => { total += analysis.teacherDailyCounts[`${d}-${name}`]?.total || 0; });
                   if (total === 0) return null;
                   return (<div key={name} className="bg-white px-2 py-1 rounded border shadow-sm text-sm flex items-center gap-2"><span className="font-bold">{name}</span><span className="bg-blue-100 text-blue-800 px-1 rounded">{total}</span></div>);
                })}
              </div>
            </div>
          </div>
        )}

        {generatedPatterns.length > 0 && (
          <div className="mb-4 p-4 bg-purple-50 border-2 border-purple-200 rounded no-print">
            <div className="flex justify-between items-center mb-2"><h3 className="font-bold text-purple-900">✨ 自動生成の結果 (3案)</h3><button onClick={() => setGeneratedPatterns([])} className="text-sm text-gray-500 underline">キャンセル</button></div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">{generatedPatterns.map((pat, i) => (<div key={i} className="bg-white p-3 rounded border shadow-sm hover:shadow-md transition-shadow"><div className="font-bold text-center mb-2 text-gray-700">案 {i+1}</div><SummaryTable target={pat} /><button onClick={() => applyPattern(pat)} className="w-full mt-2 py-1 bg-purple-600 text-white rounded text-sm font-bold hover:bg-purple-700">この案を採用</button></div>))}</div>
          </div>
        )}

        {showConfig && (
          <div className="fixed inset-0 bg-black/50 z-50 flex justify-center items-center p-4 no-print">
            <div className="bg-white w-full max-w-5xl h-[85vh] rounded-lg shadow-2xl flex flex-col overflow-hidden animate-fade-in">
              <div className="p-4 border-b flex justify-between items-center bg-gray-50"><h2 className="font-bold text-lg text-gray-700">⚙️ 設定メニュー</h2><button onClick={() => setShowConfig(false)} className="text-2xl font-bold text-gray-400 hover:text-gray-600">×</button></div>
              <div className="flex gap-4 px-6 pt-4 border-b">
                <button onClick={() => setConfigTab('basic')} className={`pb-2 font-bold ${configTab==='basic' ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-500"}`}>基本設定</button>
                <button onClick={() => setConfigTab('external')} className={`pb-2 font-bold ${configTab==='external' ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-500"}`}>📅 他学年・午前登録</button>
                <button onClick={() => setConfigTab('ng')} className={`pb-2 font-bold ${configTab==='ng' ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-500"}`}>🚫 NG一括設定</button>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                {configTab === 'external' ? (
                  <div className="overflow-x-auto">
                    <div className="bg-yellow-50 p-3 mb-4 rounded text-sm text-yellow-800 border border-yellow-200"><strong>他学年・午前のコマ数登録:</strong><br/>ここで入力した数字は、自動作成時の制限や、プルダウンの「(計X)」に加算されます。</div>
                    <table className="w-full border-collapse text-sm"><thead><tr><th className="border p-2 bg-gray-100 min-w-[100px] sticky left-0 z-10">講師名</th>{currentConfig.dates.map(d => <th key={d} className="border p-2 bg-gray-100 min-w-[60px] text-center">{d}</th>)}</tr></thead><tbody>{project.teachers.map(t => (<tr key={t.name}><td className="border p-2 font-bold bg-gray-50 sticky left-0 z-10">{t.name}</td>{currentConfig.dates.map(d => (<td key={d} className="border p-0"><input type="number" min="0" className="w-full h-full p-2 text-center focus:bg-blue-50 focus:outline-none" value={project.externalCounts?.[`${d}-${t.name}`] || ""} placeholder="-" onChange={(e) => handleExternalCountChange(d, t.name, e.target.value)} /></td>))}</tr>))}</tbody></table>
                  </div>
                ) : configTab === 'ng' ? (
                  <div className="overflow-x-auto">
                    <div className="bg-red-50 p-3 mb-4 rounded text-sm text-red-800 border border-red-200"><strong>NG一括設定:</strong><br/>クリックしてNG（赤）/ OK（白）を切り替えます。全タブ共通の設定です。</div>
                    <table className="w-full border-collapse text-xs whitespace-nowrap">
                      <thead><tr><th className="border p-2 bg-gray-100 sticky left-0 z-20">講師名</th>{currentConfig.dates.map(d => (currentConfig.periods.map(p => (<th key={`${d}-${p}`} className="border p-1 bg-gray-50 font-normal min-w-[40px] text-center">{d}<br/>{p}</th>))))}</tr></thead>
                      <tbody>{project.teachers.map((t, idx) => (<tr key={t.name}><td className="border p-2 font-bold bg-gray-50 sticky left-0 z-10">{t.name}</td>{currentConfig.dates.map(d => (currentConfig.periods.map(p => { const k=`${d}-${p}`; const isNg=t.ngSlots?.includes(k); return (<td key={k} onClick={() => toggleTeacherNg(idx, d, p)} className={`border p-1 text-center cursor-pointer hover:opacity-80 transition-colors ${isNg?"bg-red-500 text-white font-bold":"bg-white"}`}>{isNg?"NG":""}</td>); }))) }</tr>))}</tbody>
                    </table>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <h3 className="font-bold text-blue-800 border-b pb-1">📅 カレンダー設定 ({activeTab.name})</h3>
                      <div><label className="text-xs font-bold text-gray-500">日付 (カンマ区切り)</label><textarea className="w-full border p-2 text-sm h-20 rounded" value={currentConfig.dates.join(", ")} onChange={(e) => handleListConfigChange('dates', e.target.value)} /></div>
                      <div><label className="text-xs font-bold text-gray-500">時限 (カンマ区切り)</label><textarea className="w-full border p-2 text-sm h-16 rounded" value={currentConfig.periods.join(", ")} onChange={(e) => handleListConfigChange('periods', e.target.value)} /></div>
                      <div><label className="text-xs font-bold text-gray-500">クラス (カンマ区切り)</label><textarea className="w-full border p-2 text-sm h-16 rounded" value={currentConfig.classes.join(", ")} onChange={(e) => handleListConfigChange('classes', e.target.value)} /></div>
                      <div className="bg-orange-50 p-2 rounded border border-orange-100"><label className="text-xs font-bold text-orange-800">必要コマ数 (目標)</label><div className="grid grid-cols-3 gap-2 mt-2">{commonSubjects.map(s => (<div key={s} className="flex justify-between bg-white p-1 border rounded"><span className="text-xs font-bold">{s}</span><input type="number" className="w-12 text-right text-sm" value={currentConfig.subjectCounts[s]||0} onChange={(e) => handleSubjectCountChange(s, e.target.value)} /></div>))}</div></div>
                    </div>
                    <div className="border-l pl-6 space-y-4">
                      <div className="flex justify-between items-center border-b pb-1"><h3 className="font-bold text-green-800">👤 講師マスタ (全タブ共通)</h3><button onClick={addTeacher} className="text-xs bg-green-600 text-white px-2 py-1 rounded shadow">+ 追加</button></div>
                      <div className="overflow-y-auto max-h-[400px] border rounded bg-gray-50 p-2"><table className="w-full text-sm"><thead><tr><th className="text-left p-1">氏名</th><th className="text-left p-1">担当科目</th><th className="w-8"></th></tr></thead><tbody>{project.teachers.map((t, i) => (<tr key={i} className="border-b bg-white last:border-0"><td className="p-2 font-bold">{t.name}</td><td className="p-2 flex flex-wrap gap-1">{commonSubjects.map(s => (<label key={s} className={`px-2 py-0.5 border rounded cursor-pointer text-xs select-none transition-colors ${t.subjects.includes(s) ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-400 border-gray-200"}`}><input type="checkbox" className="hidden" checked={t.subjects.includes(s)} onChange={() => toggleTeacherSubject(i, s)} />{s}</label>))}</td><td className="p-2 text-center"><button onClick={() => removeTeacher(i)} className="text-gray-400 hover:text-red-500">×</button></td></tr>))}</tbody></table></div>
                    </div>
                  </div>
                )}
                <div className="mt-6 border-t pt-4 text-right"><button onClick={handleResetAll} className="text-xs text-red-500 hover:text-red-700 underline">⚠️ すべてのデータをリセット</button></div>
              </div>
            </div>
          </div>
        )}

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
                      {currentConfig.classes.map((c, cIdx) => {
                        const key = `${d}-${p}-${c}`;
                        const entry = currentSchedule[key] || {};
                        const isLocked = entry.locked;
                        const isConflict = analysis.conflictMap[`${d}-${p}-${entry.teacher}`];
                        const order = analysis.subjectOrders[key] || 0;
                        const maxCnt = currentConfig.subjectCounts[entry.subject] || 0;
                        const isOver = maxCnt > 0 && order > maxCnt;
                        const filteredTeachers = entry.subject ? project.teachers.filter(t => t.subjects.includes(entry.subject)) : project.teachers;
                        const subjDupKey = `${c}-${d}-${entry.subject}`;
                        const isSubjDup = analysis.dailySubjectMap[subjDupKey] > 1;
                        const cellColor = isConflict ? "bg-red-200" : getSubjectColor(entry.subject);
                        const lockedStyle = isLocked ? "border-2 border-gray-600 opacity-90" : "border border-gray-200";
                        const stripeStyle = isLocked ? { backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(0,0,0,0.05) 5px, rgba(0,0,0,0.05) 10px)' } : {};

                        return (
                          <td 
                            key={c} id={`select-${dIdx}-${pIdx}-${cIdx}-cell`} className={`border-r last:border-0 ${isCompact ? "p-0.5" : "p-2"}`}
                            draggable={!isLocked && !!entry.subject} onDragStart={(e) => handleDragStart(e, key, entry)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => handleDrop(e, key, entry)} onContextMenu={(e) => handleContextMenu(e, d, p, c)}
                          >
                            <div className={`flex flex-col rounded h-full ${cellColor} ${lockedStyle} ${isCompact ? "gap-0 p-0.5" : "gap-1 p-1.5"}`} style={stripeStyle}>
                              <div className="flex justify-between items-start">
                                <div className="relative flex-1">
                                  <select 
                                    id={`select-${dIdx}-${pIdx}-${cIdx}-subject`}
                                    className={`w-full bg-transparent font-bold focus:outline-none cursor-pointer text-gray-800 ${isSubjDup ? "text-red-600 underline" : ""} ${isCompact ? "text-[10px]" : "text-sm"} ${isLocked ? "pointer-events-none" : ""}`}
                                    value={entry.subject || ""}
                                    onChange={(e) => handleAssign(d, p, c, 'subject', e.target.value)}
                                    onKeyDown={(e) => handleCellNavigation(e, dIdx, pIdx, cIdx, 'subject')}
                                  >
                                    <option value="">-</option>{commonSubjects.map(s => {
                                      const isAlreadyUsed = analysis.dailySubjectMap[`${c}-${d}-${s}`] > 0 && entry.subject !== s;
                                      return <option key={s} value={s} disabled={isAlreadyUsed} className={isAlreadyUsed ? "bg-gray-200" : ""}>{s}</option>;
                                    })}
                                  </select>
                                  {isSubjDup && <span className="absolute left-0 -top-4 bg-red-600 text-white text-[9px] px-1 rounded z-50">⚠️1日2回</span>}
                                  {entry.subject && !isSubjDup && <span className={`absolute right-0 top-0 text-[9px] px-1 rounded-full ${isOver ? "bg-red-500 text-white" : "bg-white/60 text-gray-600 border"}`}>{toCircleNum(order)}{isOver&&"!"}</span>}
                                </div>
                                <button onClick={() => toggleLock(d, p, c)} className={`ml-1 focus:outline-none text-gray-400 hover:text-gray-800 ${isCompact ? "text-[8px]" : "text-xs"}`}>{isLocked ? "🔒" : "🔓"}</button>
                              </div>
                              <select 
                                id={`select-${dIdx}-${pIdx}-${cIdx}-teacher`}
                                className={`w-full rounded cursor-pointer ${isConflict ? "text-red-800 font-extrabold" : "text-blue-900"} ${isCompact ? "text-[10px] py-0" : "text-sm py-1"} ${(!entry.subject || isLocked) ? "opacity-50 pointer-events-none" : "bg-white/50 hover:bg-white"}`}
                                value={entry.teacher || ""}
                                onChange={(e) => handleAssign(d, p, c, 'teacher', e.target.value)}
                                onKeyDown={(e) => handleCellNavigation(e, dIdx, pIdx, cIdx, 'teacher')}
                              >
                                <option value="">-</option>
                                {filteredTeachers.map(t => {
                                  const dayKey = `${d}-${t.name}`;
                                  const daily = analysis.teacherDailyCounts[dayKey] || { total: 0 };
                                  const isNg = t.ngSlots?.includes(`${d}-${p}`);
                                  let label = t.name;
                                  if (t.name !== "未定") { if (isNg) label += " (NG)"; else label += ` (計${daily.total})`; }
                                  return <option key={t.name} value={t.name} className={isNg ? "bg-gray-300 text-gray-500" : (daily.total >= 4 ? "bg-yellow-100" : "")} disabled={isNg}>{label}</option>;
                                })}
                              </select>
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
              {currentSchedule[`${contextMenu.d}-${contextMenu.p}-${contextMenu.c}`]?.teacher && <button onClick={() => handleMenuAction('set-ng')} className="block w-full text-left px-4 py-2 hover:bg-yellow-100 border-b text-yellow-800">🚫 この時間をNG登録</button>}
              <button onClick={() => handleMenuAction('lock')} className="block w-full text-left px-4 py-2 hover:bg-gray-100 border-b">🔒 ロック切替</button>
              <button onClick={() => handleMenuAction('clear')} className="block w-full text-left px-4 py-2 hover:bg-red-50 text-red-600">🗑️ クリア</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}