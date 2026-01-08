import React, { useState, useMemo, useRef } from 'react';

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
  ]
};

// ★色分け設定 (v11新機能)
const SUBJECT_COLORS = {
  "英語": "bg-red-100",   // ピンク系
  "数学": "bg-blue-100",  // 青系
  "国語": "bg-yellow-100",// 黄色系
  "理科": "bg-green-100", // 緑系
  "社会": "bg-purple-100" // 紫系
};

const toCircleNum = (num) => {
  const circles = ["0", "①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩", "⑪", "⑫", "⑬", "⑭", "⑮", "⑯", "⑰", "⑱", "⑲", "⑳"];
  return circles[num] || `(${num})`;
};

export default function ScheduleApp() {
  const [schedule, setSchedule] = useState({});
  const [config, setConfig] = useState(INITIAL_CONFIG);
  const [showConfig, setShowConfig] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [editingNgIndex, setEditingNgIndex] = useState(null);
  const [generatedPatterns, setGeneratedPatterns] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const fileInputRef = useRef(null);

  // --- 操作関数 ---
  const handleAssign = (date, period, className, type, value) => {
    const key = `${date}-${period}-${className}`;
    if (type === 'subject') {
      setSchedule(prev => ({ ...prev, [key]: { subject: value, teacher: "" } }));
    } else {
      setSchedule(prev => ({ ...prev, [key]: { ...prev[key], [type]: value } }));
    }
  };

  const handleListConfigChange = (key, valueString) => {
    const newArray = valueString.split(',').map(s => s.trim()).filter(s => s !== "");
    setConfig(prev => ({ ...prev, [key]: newArray }));
  };

  const handleSubjectCountChange = (subject, count) => {
    setConfig(prev => ({
      ...prev,
      subjectCounts: { ...prev.subjectCounts, [subject]: parseInt(count) || 0 }
    }));
  };

  const addTeacher = () => {
    const name = prompt("新しい講師の名前を入力してください:");
    if (name) {
      setConfig(prev => ({ ...prev, teachers: [...prev.teachers, { name, subjects: [], ngSlots: [], ngClasses: [] }] }));
    }
  };

  const toggleTeacherSubject = (teacherIndex, subject) => {
    setConfig(prev => {
      const newTeachers = [...prev.teachers];
      const t = newTeachers[teacherIndex];
      if (t.subjects.includes(subject)) t.subjects = t.subjects.filter(s => s !== subject);
      else t.subjects = [...t.subjects, subject];
      return { ...prev, teachers: newTeachers };
    });
  };

  const toggleTeacherNgClass = (teacherIndex, cls) => {
    setConfig(prev => {
      const newTeachers = [...prev.teachers];
      const t = newTeachers[teacherIndex];
      if (!t.ngClasses) t.ngClasses = [];
      if (t.ngClasses.includes(cls)) t.ngClasses = t.ngClasses.filter(c => c !== cls);
      else t.ngClasses = [...t.ngClasses, cls];
      return { ...prev, teachers: newTeachers };
    });
  };

  const toggleTeacherNg = (teacherIndex, date, period) => {
    const key = `${date}-${period}`;
    setConfig(prev => {
      const newTeachers = [...prev.teachers];
      const t = newTeachers[teacherIndex];
      if (!t.ngSlots) t.ngSlots = [];
      if (t.ngSlots.includes(key)) t.ngSlots = t.ngSlots.filter(k => k !== key);
      else t.ngSlots = [...t.ngSlots, key];
      return { ...prev, teachers: newTeachers };
    });
  };

  const removeTeacher = (index) => {
    if (window.confirm("この講師を削除しますか？")) {
      setConfig(prev => ({ ...prev, teachers: prev.teachers.filter((_, i) => i !== index) }));
      if (editingNgIndex === index) setEditingNgIndex(null);
    }
  };

  // --- 分析ロジック ---
  const analyzeSchedule = (currentSchedule) => {
    const conflictMap = {}; 
    const subjectOrders = {};
    const dailySubjectMap = {};

    const sortedKeys = [];
    config.dates.forEach(date => {
      config.periods.forEach(period => {
        config.classes.forEach(cls => {
          sortedKeys.push({ date, period, cls, key: `${date}-${period}-${cls}` });
        });
      });
    });

    config.classes.forEach(cls => {
      const counts = {};
      sortedKeys.filter(k => k.cls === cls).forEach(({ date, period, key }) => {
        const entry = currentSchedule[key];
        if (!entry || !entry.subject) return;
        counts[entry.subject] = (counts[entry.subject] || 0) + 1;
        subjectOrders[key] = counts[entry.subject];
        const dailyKey = `${cls}-${date}-${entry.subject}`;
        dailySubjectMap[dailyKey] = (dailySubjectMap[dailyKey] || 0) + 1;
      });
    });

    config.dates.forEach(date => {
      config.periods.forEach(period => {
        const teacherCounts = {};
        config.classes.forEach(cls => {
          const key = `${date}-${period}-${cls}`;
          const teacher = currentSchedule[key]?.teacher;
          if (teacher && teacher !== "未定") {
             teacherCounts[teacher] = (teacherCounts[teacher] || 0) + 1;
          }
        });
        Object.keys(teacherCounts).forEach(t => {
          if (teacherCounts[t] > 1) conflictMap[`${date}-${period}-${t}`] = true;
        });
      });
    });

    return { conflictMap, subjectOrders, dailySubjectMap };
  };

  const analysis = useMemo(() => analyzeSchedule(schedule), [schedule, config]);

  const SummaryTable = ({ targetSchedule }) => {
    const summary = {};
    config.classes.forEach(cls => {
      summary[cls] = {};
      config.subjects.forEach(subj => summary[cls][subj] = {});
    });

    Object.keys(targetSchedule).forEach(key => {
      const entry = targetSchedule[key];
      if (entry && entry.subject && entry.teacher) {
        const cls = config.classes.find(c => key.includes(c));
        if (cls && summary[cls][entry.subject]) {
          const t = entry.teacher;
          summary[cls][entry.subject][t] = (summary[cls][entry.subject][t] || 0) + 1;
        }
      }
    });

    return (
      <div className="overflow-x-auto border border-gray-300 rounded shadow-sm bg-white p-2">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-100 border-b">
              <th className="p-2 border-r w-20">クラス</th>
              {config.subjects.map(s => <th key={s} className="p-2 border-r">{s}</th>)}
            </tr>
          </thead>
          <tbody>
            {config.classes.map(cls => (
              <tr key={cls} className="border-b">
                <td className="p-2 font-bold bg-gray-50 border-r">{cls}</td>
                {config.subjects.map(subj => {
                  const teachers = summary[cls][subj];
                  const list = Object.entries(teachers).map(([t, c]) => `${t}×${c}`);
                  return (
                    <td key={subj} className="p-2 border-r align-top">
                      {list.length > 0 ? (
                        <div className="flex flex-col gap-1">
                          {list.map(item => <span key={item} className="bg-blue-50 px-1 rounded text-blue-800">{item}</span>)}
                        </div>
                      ) : <span className="text-gray-300">-</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const generateSchedule = () => {
    setIsGenerating(true);
    setTimeout(() => {
      const solutions = [];
      const slots = [];
      
      config.dates.forEach(date => {
        config.periods.forEach(period => {
          config.classes.forEach(cls => {
            const key = `${date}-${period}-${cls}`;
            if (!schedule[key] || !schedule[key].subject || !schedule[key].teacher) {
              slots.push({ key, date, period, cls });
            }
          });
        });
      });

      const currentCounts = {};
      config.classes.forEach(cls => {
        currentCounts[cls] = {};
        config.subjects.forEach(s => currentCounts[cls][s] = 0);
      });
      Object.keys(schedule).forEach(k => {
        const entry = schedule[k];
        if (entry && entry.subject) {
          const cls = config.classes.find(cl => k.includes(cl)); 
          if(cls) currentCounts[cls][entry.subject] = (currentCounts[cls][entry.subject] || 0) + 1;
        }
      });

      let iterationCount = 0;
      const MAX_ITERATIONS = 5000000; 

      const solve = (index, tempSchedule, tempCounts) => {
        iterationCount++;
        if (iterationCount > MAX_ITERATIONS) return;
        if (solutions.length >= 3) return;

        if (index >= slots.length) {
          solutions.push(JSON.parse(JSON.stringify(tempSchedule)));
          return;
        }

        const slot = slots[index];
        const { date, period, cls, key } = slot;
        
        const sortedSubjects = [...config.subjects].sort((a, b) => {
          const maxA = config.subjectCounts[a] || 0;
          const maxB = config.subjectCounts[b] || 0;
          const remA = maxA - (tempCounts[cls][a] || 0);
          const remB = maxB - (tempCounts[cls][b] || 0);
          return remB - remA; 
        });

        for (const subject of sortedSubjects) {
          if (iterationCount > MAX_ITERATIONS) return;

          const maxCount = config.subjectCounts[subject] || 0;
          if ((tempCounts[cls][subject] || 0) >= maxCount) continue;

          let isDailyDup = false;
          config.periods.forEach(p => {
             const checkKey = `${date}-${p}-${cls}`;
             if (tempSchedule[checkKey]?.subject === subject) isDailyDup = true;
          });
          if (isDailyDup) continue;

          const validTeachers = config.teachers.filter(t => {
            if (!t.subjects.includes(subject)) return false;
            if (t.ngClasses && t.ngClasses.includes(cls)) return false; 
            if (t.ngSlots && t.ngSlots.includes(`${date}-${period}`)) return false;
            return true;
          });
          
          const shuffledTeachers = [...validTeachers].sort(() => Math.random() - 0.5);

          for (const teacherObj of shuffledTeachers) {
             const teacher = teacherObj.name;
             let isTeacherDup = false;
             config.classes.forEach(c => {
               if (c !== cls) {
                 const otherKey = `${date}-${period}-${c}`;
                 if (tempSchedule[otherKey]?.teacher === teacher) isTeacherDup = true;
               }
             });
             if (isTeacherDup) continue;

             tempSchedule[key] = { subject, teacher };
             tempCounts[cls][subject] = (tempCounts[cls][subject] || 0) + 1;

             solve(index + 1, tempSchedule, tempCounts);

             if (solutions.length >= 3) return;
             delete tempSchedule[key];
             tempCounts[cls][subject] -= 1;
          }
        }
      };

      solve(0, JSON.parse(JSON.stringify(schedule)), JSON.parse(JSON.stringify(currentCounts)));
      setGeneratedPatterns(solutions);
      setIsGenerating(false);

      if (iterationCount > MAX_ITERATIONS) {
        alert("計算回数が上限を超えました。");
      } else if (solutions.length === 0) {
        alert("条件を満たすパターンが見つかりませんでした。");
      }
    }, 100);
  };

  const applyPattern = (pattern) => {
    setSchedule(pattern);
    setGeneratedPatterns([]);
    alert("適用しました！");
  };

  const handleSaveJson = () => {
    const saveData = { version: 11, config, schedule };
    const blob = new Blob([JSON.stringify(saveData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `schedule_v11_${new Date().toISOString().slice(0,10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleLoadJson = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (data.config && data.schedule) {
          const patchedConfig = { ...data.config, subjectCounts: data.config.subjectCounts || INITIAL_CONFIG.subjectCounts };
          const patchedTeachers = patchedConfig.teachers.map(t => ({
             ...t, 
             ngSlots: t.ngSlots || [],
             ngClasses: t.ngClasses || [] 
          }));
          setConfig({ ...patchedConfig, teachers: patchedTeachers });
          setSchedule(data.schedule);
        } else { alert("データ形式エラー"); }
      } catch (error) { alert("読込エラー"); }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  return (
    <div className="p-4 bg-gray-50 min-h-screen font-sans">
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">冬期講習 時間割エディタ v11</h1>
          <p className="text-sm text-gray-600">科目別色分け機能搭載</p>
        </div>
        <div className="flex gap-2">
           <button onClick={() => setShowSummary(!showSummary)} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 shadow flex items-center gap-2">📊 集計</button>
           <button onClick={() => setShowConfig(!showConfig)} className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 shadow flex items-center gap-2">⚙️ 設定</button>
           <button onClick={generateSchedule} disabled={isGenerating} className={`px-4 py-2 text-white rounded shadow flex items-center gap-2 ${isGenerating ? "bg-purple-400 cursor-wait" : "bg-purple-600 hover:bg-purple-700"}`}>
             {isGenerating ? "計算中..." : "🧙‍♂️ 自動作成"}
           </button>
          <button onClick={() => fileInputRef.current.click()} className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 shadow">📂 開く</button>
          <input type="file" accept=".json" ref={fileInputRef} onChange={handleLoadJson} className="hidden" />
          <button onClick={handleSaveJson} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 shadow">💾 保存</button>
        </div>
      </div>

      {showSummary && (
        <div className="mb-6 animate-fade-in">
          <h2 className="font-bold text-lg text-indigo-900 mb-2">📊 現在の授業数カウント</h2>
          <SummaryTable targetSchedule={schedule} />
        </div>
      )}

      {generatedPatterns.length > 0 && (
        <div className="mb-6 p-4 bg-purple-50 border-2 border-purple-200 rounded-lg animate-fade-in">
          <h2 className="font-bold text-lg text-purple-900 mb-2">✨ 生成結果</h2>
          <div className="flex flex-col gap-4">
            {generatedPatterns.map((pattern, idx) => (
              <div key={idx} className="bg-white border border-purple-300 rounded p-4 shadow-sm">
                <div className="flex justify-between items-center mb-2">
                  <div className="font-bold text-lg text-purple-800">案 {idx + 1}</div>
                  <button onClick={() => applyPattern(pattern)} className="bg-purple-600 text-white px-4 py-1 rounded hover:bg-purple-700 shadow">この案を適用</button>
                </div>
                <SummaryTable targetSchedule={pattern} />
              </div>
            ))}
            <button onClick={() => setGeneratedPatterns([])} className="p-2 text-gray-500 hover:text-gray-700 underline text-center">キャンセル</button>
          </div>
        </div>
      )}

      {showConfig && (
        <div className="mb-6 p-4 bg-white border border-gray-300 rounded-lg shadow-sm">
          <h2 className="font-bold text-lg mb-4 text-gray-700">⚙️ マスタ設定</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-4">
              <div><label className="block text-xs font-bold text-gray-500 mb-1">日付</label><textarea className="w-full border p-2 rounded text-sm h-16" value={config.dates.join(", ")} onChange={(e) => handleListConfigChange('dates', e.target.value)} /></div>
              <div><label className="block text-xs font-bold text-gray-500 mb-1">時限</label><textarea className="w-full border p-2 rounded text-sm h-12" value={config.periods.join(", ")} onChange={(e) => handleListConfigChange('periods', e.target.value)} /></div>
              <div><label className="block text-xs font-bold text-gray-500 mb-1">クラス</label><textarea className="w-full border p-2 rounded text-sm h-12" value={config.classes.join(", ")} onChange={(e) => handleListConfigChange('classes', e.target.value)} /></div>
              <div className="border p-2 rounded bg-yellow-50">
                <label className="block text-xs font-bold text-gray-700 mb-2">📚 科目ごとの必要コマ数</label>
                <div className="grid grid-cols-2 gap-2">
                  {config.subjects.map(subj => (
                    <div key={subj} className="flex items-center justify-between bg-white p-1 rounded border">
                      <span className="text-xs font-bold">{subj}</span>
                      <input type="number" className="w-12 text-right border rounded px-1 text-sm" value={config.subjectCounts?.[subj] || 0} onChange={(e) => handleSubjectCountChange(subj, e.target.value)} />
                    </div>
                  ))}
                </div>
                 <div className="mt-2"><label className="block text-xs text-gray-500">科目リスト編集</label><textarea className="w-full border p-1 rounded text-xs h-8" value={config.subjects.join(", ")} onChange={(e) => handleListConfigChange('subjects', e.target.value)} /></div>
              </div>
            </div>

            <div className="md:col-span-2 border-l pl-4">
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-bold text-gray-700">👤 講師設定</label>
                <button onClick={addTeacher} className="text-xs bg-blue-500 text-white px-2 py-1 rounded hover:bg-blue-600">+ 講師追加</button>
              </div>
              <div className="overflow-y-auto max-h-[400px] border rounded bg-gray-50 p-2 mb-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="p-2 w-20">氏名</th>
                      <th className="p-2 w-40">担当可能科目</th>
                      <th className="p-2">NGクラス(行かない)</th>
                      <th className="p-2 w-20">NG時間</th>
                      <th className="p-2 w-10">削除</th>
                    </tr>
                  </thead>
                  <tbody>
                    {config.teachers.map((teacher, tIndex) => (
                      <tr key={tIndex} className={`border-b ${editingNgIndex === tIndex ? "bg-blue-50" : "bg-white"}`}>
                        <td className="p-2 font-bold">{teacher.name}</td>
                        <td className="p-2">
                          <div className="flex flex-wrap gap-2">
                            {config.subjects.map(subject => (
                              <label key={subject} className="flex items-center gap-1 cursor-pointer bg-gray-50 px-1 rounded border">
                                <input type="checkbox" checked={teacher.subjects.includes(subject)} onChange={() => toggleTeacherSubject(tIndex, subject)} />
                                <span className="text-xs">{subject}</span>
                              </label>
                            ))}
                          </div>
                        </td>
                        <td className="p-2">
                          <div className="flex flex-wrap gap-2">
                            {config.classes.map(cls => (
                              <label key={cls} className={`flex items-center gap-1 cursor-pointer px-1 rounded border ${teacher.ngClasses?.includes(cls) ? "bg-red-100 border-red-200 text-red-700" : "bg-white border-gray-200"}`}>
                                <input type="checkbox" checked={teacher.ngClasses?.includes(cls) || false} onChange={() => toggleTeacherNgClass(tIndex, cls)} />
                                <span className="text-xs">{cls}</span>
                              </label>
                            ))}
                          </div>
                        </td>
                        <td className="p-2 text-center">
                          <button onClick={() => setEditingNgIndex(editingNgIndex === tIndex ? null : tIndex)} className={`text-xs px-2 py-1 rounded border ${editingNgIndex === tIndex ? "bg-blue-600 text-white" : "bg-white"}`}>
                            {editingNgIndex === tIndex ? "設定中" : "NG時間"}
                          </button>
                        </td>
                        <td className="p-2 text-center"><button onClick={() => removeTeacher(tIndex)} className="text-red-500 hover:text-red-700">×</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {editingNgIndex !== null && config.teachers[editingNgIndex] && (
                <div className="bg-blue-50 border-2 border-blue-200 p-3 rounded-lg">
                  <h3 className="font-bold text-blue-800 mb-2">📅 {config.teachers[editingNgIndex].name}先生のNG時間設定</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse bg-white text-sm">
                      <thead>
                        <tr><th className="border p-2 bg-gray-100 w-20"></th>{config.periods.map(p => <th key={p} className="border p-2 bg-gray-100 font-normal">{p}</th>)}</tr>
                      </thead>
                      <tbody>
                        {config.dates.map(date => (
                          <tr key={date}>
                            <td className="border p-2 bg-gray-50 font-bold">{date}</td>
                            {config.periods.map(period => {
                              const key = `${date}-${period}`;
                              const isNg = config.teachers[editingNgIndex].ngSlots?.includes(key);
                              return <td key={key} onClick={() => toggleTeacherNg(editingNgIndex, date, period)} className={`border p-2 text-center cursor-pointer ${isNg ? "bg-red-100 text-red-600 font-bold" : "hover:bg-blue-50 text-gray-400"}`}>{isNg ? "NG" : "○"}</td>;
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      <div className="overflow-x-auto shadow-lg rounded-lg">
        <table className="border-collapse w-full bg-white text-sm text-left">
          <thead>
            <tr className="bg-gray-800 text-white">
              <th className="p-3 w-24 border-r border-gray-600">日付</th>
              <th className="p-3 w-24 border-r border-gray-600">時限</th>
              {config.classes.map(cls => <th key={cls} className="p-3 min-w-[150px] border-r border-gray-600 last:border-0">{cls}</th>)}
            </tr>
          </thead>
          <tbody>
            {config.dates.map(date => (
              config.periods.map((period, pIndex) => (
                <tr key={`${date}-${period}`} className="border-b hover:bg-gray-50">
                  {pIndex === 0 && <td rowSpan={config.periods.length} className="p-3 font-bold align-top bg-gray-100 border-r">{date}</td>}
                  <td className="p-3 border-r bg-gray-50 text-gray-700">{period}</td>
                  
                  {config.classes.map(cls => {
                    const key = `${date}-${period}-${cls}`;
                    const currentData = schedule[key] || {};
                    const currentSubject = currentData.subject || "";
                    const currentTeacher = currentData.teacher || "";
                    const isTeacherConflict = currentTeacher && analysis.conflictMap[`${date}-${period}-${currentTeacher}`];
                    const order = analysis.subjectOrders[key] || 0;
                    const maxCount = config.subjectCounts?.[currentSubject] || 0;
                    const isCountOver = maxCount > 0 && order > maxCount;
                    const filteredTeachers = currentSubject ? config.teachers.filter(t => t.subjects.includes(currentSubject)) : config.teachers;

                    // ★v11 色分けロジック
                    const subjectColor = SUBJECT_COLORS[currentSubject] || "bg-white"; // デフォルト白
                    const cellBgColor = isTeacherConflict ? "bg-red-200" : subjectColor; // エラー時は赤優先
                    const borderColor = isTeacherConflict ? "border-red-400 border-2" : "border-gray-200 border";

                    return (
                      <td key={cls} className={`p-2 border-r last:border-0`}>
                        {/* 背景色を適用するdiv */}
                        <div className={`flex flex-col gap-2 p-2 rounded ${borderColor} ${cellBgColor}`}>
                          <div className="relative">
                            <select 
                              className={`w-full font-medium focus:outline-none cursor-pointer appearance-none ${isCountOver ? "text-red-600 font-bold" : "text-gray-800"} bg-transparent`}
                              onChange={(e) => handleAssign(date, period, cls, 'subject', e.target.value)}
                              value={currentSubject}
                            >
                              <option value="" className="text-gray-400">- 科目 -</option>
                              {config.subjects.map(s => {
                                const isUsedToday = analysis.dailySubjectMap[`${cls}-${date}-${s}`] > 0;
                                const isSelf = currentSubject === s; 
                                const isDailyDup = isUsedToday && !isSelf;
                                return <option key={s} value={s} disabled={isDailyDup} className={isDailyDup ? "bg-gray-200 text-gray-400" : ""}>{s} {isDailyDup ? "(1日1回済)" : ""}</option>;
                              })}
                            </select>
                            {currentSubject && <div className={`absolute right-0 top-0 text-xs px-1 rounded pointer-events-none ${isCountOver ? "bg-red-500 text-white" : "bg-white/80 text-blue-800 border"}`}>{toCircleNum(order)} {isCountOver && "⚠"}</div>}
                          </div>
                          
                          <select 
                            className={`w-full p-1 rounded font-bold cursor-pointer ${isTeacherConflict ? "text-red-600 bg-red-100" : "text-blue-900 bg-white/50"} ${!currentSubject ? "opacity-50" : ""}`}
                            onChange={(e) => handleAssign(date, period, cls, 'teacher', e.target.value)}
                            value={currentTeacher}
                            disabled={!currentSubject}
                          >
                            <option value="">{currentSubject ? "- 講師 -" : "(科目未定)"}</option>
                            {filteredTeachers.map(t => {
                              const isNgSlot = t.ngSlots?.includes(`${date}-${period}`);
                              const isNgClass = t.ngClasses?.includes(cls);
                              
                              const isDisabled = isNgSlot || isNgClass;
                              const label = t.name + (isNgSlot ? "(NG時)" : "") + (isNgClass ? "(クラス外)" : "");

                              return <option key={t.name} value={t.name} disabled={isDisabled} className={isDisabled ? "text-gray-300 bg-gray-100" : ""}>{label}</option>;
                            })}
                          </select>
                          {isTeacherConflict && <div className="text-xs text-red-600 font-bold text-center bg-red-100 rounded">⚠️ 重複</div>}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}