'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { apiPost } from '@/lib/api';
import { 
  Target, BrainCircuit, FileText, Send, MessageSquare, 
  DollarSign, Award, Layout, Lock, CheckCircle, 
  ArrowLeft, ChevronRight, ChevronLeft, Send as SendIcon, 
  MoreHorizontal, GripVertical, PanelRightClose, PanelRightOpen, Sparkles
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';

// --- 1. 阶段配置 ---
const STAGES = [
  { id: 'career_planning', title: '1. 职业规划', icon: Target, color: 'text-blue-500', bg: 'bg-blue-50', desc: '确定职业方向与核心竞争力' },
  { id: 'project_review', title: '2. 经历复盘', icon: BrainCircuit, color: 'text-indigo-500', bg: 'bg-indigo-50', desc: '挖掘过往项目中的亮点' },
  { id: 'resume_optimization', title: '3. 简历优化', icon: FileText, color: 'text-purple-500', bg: 'bg-purple-50', desc: '基于目标岗位定制简历' },
  { id: 'application_strategy', title: '4. 投递策略', icon: Send, color: 'text-pink-500', bg: 'bg-pink-50', desc: '制定高效的渠道与话术' },
  { id: 'interview', title: '5. 面试辅导', icon: MessageSquare, color: 'text-rose-500', bg: 'bg-rose-50', desc: '模拟面试与问题拆解' },
  { id: 'salary_talk', title: '6. 谈薪策略', icon: DollarSign, color: 'text-orange-500', bg: 'bg-orange-50', desc: '争取最优的薪资回报' },
  { id: 'offer', title: '7. Offer选择', icon: Award, color: 'text-yellow-500', bg: 'bg-yellow-50', desc: '理性决策，落袋为安' },
];

export default function ChatPage() {
  // --- 状态管理 ---
  const [viewMode, setViewMode] = useState<'list' | 'chat'>('list');
  const [unlockedIndex, setUnlockedIndex] = useState(0);
  const [activeStageId, setActiveStageId] = useState(STAGES[0].id);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [whiteboard, setWhiteboard] = useState<any>({});

  // --- 拖拽与布局状态 ---
  const [leftWidth, setLeftWidth] = useState(60); // 左侧宽度百分比 (默认60%)
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(true); // 右侧白板是否展开
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // --- 滚动逻辑 ---
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  useEffect(() => {
    scrollToBottom();
  }, [messages, viewMode]);

  // --- 拖拽处理逻辑 ---
  const startResizing = useCallback(() => {
    setIsDragging(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsDragging(false);
  }, []);

  const resize = useCallback((mouseMoveEvent: MouseEvent) => {
    if (isDragging && containerRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect();
      // 计算鼠标相对于容器左侧的位置百分比
      let newLeftWidth = ((mouseMoveEvent.clientX - containerRect.left) / containerRect.width) * 100;
      
      // 限制最小和最大宽度 (例如：最小 30%，最大 85%)
      if (newLeftWidth < 30) newLeftWidth = 30;
      if (newLeftWidth > 85) newLeftWidth = 85;

      setLeftWidth(newLeftWidth);
      
      // 如果拖拽过程中如果不小心把右边拖得太小，可以自动吸附关闭（可选）
      // 这里我们保持手动控制
      if (!isRightPanelOpen) setIsRightPanelOpen(true); // 只要拖拽就自动打开
    }
  }, [isDragging, isRightPanelOpen]);

  useEffect(() => {
    window.addEventListener("mousemove", resize);
    window.addEventListener("mouseup", stopResizing);
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [resize, stopResizing]);

  // --- 交互逻辑 ---
  const enterStage = (index: number) => {
    if (index > unlockedIndex) return;
    const stage = STAGES[index];
    setActiveStageId(stage.id);
    setViewMode('chat');
    if (messages.length === 0) {
       setMessages([{ 
            role: 'assistant', 
            content: `你好！我是你的**${stage.title}**顾问。\n\n我们将基于上一阶段的结论继续深入。请告诉我你目前的想法。`,
            isUser: false 
        }]);
    }
  };

  const backToList = () => setViewMode('list');

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const userMsg = { role: 'user', content: input, isUser: true };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res: any = await apiPost('/chat', {
        message: userMsg.content,
        userStage: activeStageId,
        history: messages.map(m => ({ role: m.role, content: m.content })),
      });
      const aiMsg = { role: 'assistant', content: res.reply || '收到，正在分析...', isUser: false };
      setMessages(prev => [...prev, aiMsg]);
      if (res.structured) setWhiteboard(res.structured);
      if (res.shouldAdvance) handleCompleteStage();
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: '网络开小差了，请重试。', isUser: false }]);
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteStage = () => {
    const currentIndex = STAGES.findIndex(s => s.id === activeStageId);
    if (currentIndex < STAGES.length - 1 && currentIndex === unlockedIndex) {
        setUnlockedIndex(currentIndex + 1);
        alert(`🎉 恭喜！${STAGES[currentIndex].title} 已完成，下一阶段已解锁！`);
    }
  };

  // 切换白板显示/隐藏
  const toggleRightPanel = () => {
    if (isRightPanelOpen) {
        // 关闭时，记录之前的宽度可能更好，这里简化为直接关闭
        setIsRightPanelOpen(false);
    } else {
        // 打开时，恢复到之前的宽度，或者默认值
        setIsRightPanelOpen(true);
        if (leftWidth > 90) setLeftWidth(60); // 如果之前太宽，重置为 60%
    }
  };

  return (
    <div 
        ref={containerRef}
        className="flex h-screen w-screen bg-slate-100 overflow-hidden font-sans text-slate-900 relative select-none"
        // select-none 防止拖拽时选中文字
    >
      
      {/* =============================================
         左侧区域 (动态宽度)
         =============================================
      */}
      <div 
        className="flex flex-col bg-white relative transition-all duration-75 ease-out"
        style={{ width: isRightPanelOpen ? `${leftWidth}%` : '100%' }}
      >
        
        {/* 模式 A：阶段选择列表 */}
        {viewMode === 'list' && (
            <div className="flex-1 overflow-y-auto p-10 animate-in fade-in slide-in-from-left-4 duration-300">
                <div className="mb-8 max-w-2xl mx-auto">
                    <h1 className="text-2xl font-bold text-slate-800">求职进阶路线</h1>
                    <p className="text-slate-500 mt-2">请按顺序完成以下阶段，AI 将全程陪伴。</p>
                </div>

                <div className="space-y-4 max-w-2xl mx-auto">
                    {STAGES.map((stage, index) => {
                        const isLocked = index > unlockedIndex;
                        const isCompleted = index < unlockedIndex;
                        const isCurrent = index === unlockedIndex;

                        return (
                            <div 
                                key={stage.id}
                                onClick={() => enterStage(index)}
                                className={`
                                    relative flex items-center p-6 rounded-2xl border-2 transition-all duration-200
                                    ${isLocked ? 'border-slate-100 bg-slate-50 opacity-60 cursor-not-allowed grayscale' : 'cursor-pointer hover:shadow-lg hover:-translate-y-1'}
                                    ${isCurrent ? 'border-blue-500 bg-blue-50/30 ring-4 ring-blue-100' : ''}
                                    ${isCompleted ? 'border-green-200 bg-green-50/30' : ''}
                                    ${!isLocked && !isCurrent && !isCompleted ? 'border-slate-200 bg-white' : ''}
                                `}
                            >
                                <div className={`
                                    w-12 h-12 rounded-full flex items-center justify-center mr-6 shrink-0 font-bold text-lg
                                    ${isLocked ? 'bg-slate-200 text-slate-400' : ''}
                                    ${isCurrent ? 'bg-blue-600 text-white shadow-blue-300 shadow-md' : ''}
                                    ${isCompleted ? 'bg-green-500 text-white' : ''}
                                `}>
                                    {isLocked ? <Lock size={20} /> : isCompleted ? <CheckCircle size={24} /> : (index + 1)}
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center justify-between mb-1">
                                        <h3 className={`font-bold text-lg ${isLocked ? 'text-slate-400' : 'text-slate-800'}`}>{stage.title}</h3>
                                        {!isLocked && <ChevronRight className={`text-slate-300 ${isCurrent ? 'text-blue-500' : ''}`} />}
                                    </div>
                                    <p className="text-sm text-slate-500">{stage.desc}</p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        )}

        {/* 模式 B：聊天框 */}
        {viewMode === 'chat' && (
            <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-4 duration-300">
                {/* 顶栏 */}
                <div className="h-16 border-b border-slate-100 flex items-center justify-between px-6 bg-white/80 backdrop-blur-md sticky top-0 z-10">
                    <div className="flex items-center gap-4">
                        <button onClick={backToList} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors">
                            <ArrowLeft size={20} />
                        </button>
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${STAGES.find(s=>s.id===activeStageId)?.bg}`}>
                                {(() => {
                                    const Icon = STAGES.find(s=>s.id===activeStageId)?.icon || Target;
                                    return <Icon size={18} className={STAGES.find(s=>s.id===activeStageId)?.color} />;
                                })()}
                            </div>
                            <h2 className="font-bold text-slate-800">{STAGES.find(s=>s.id===activeStageId)?.title}</h2>
                        </div>
                    </div>
                    {/* 完成按钮 */}
                    {activeStageId === STAGES[unlockedIndex].id && (
                        <button 
                            onClick={() => { if(confirm('确认该阶段完成？')) { handleCompleteStage(); backToList(); }}}
                            className="text-xs font-medium text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full border border-blue-100 hover:bg-blue-100"
                        >
                            标记完成
                        </button>
                    )}
                </div>

                {/* 消息区 */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50">
                    {messages.map((msg, idx) => (
                        <div key={idx} className={`flex ${msg.isUser ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] rounded-2xl p-4 shadow-sm text-sm leading-relaxed ${msg.isUser ? 'bg-blue-600 text-white rounded-br-none' : 'bg-white text-slate-800 border border-slate-200 rounded-bl-none'}`}>
                                {msg.isUser ? msg.content : <ReactMarkdown>{msg.content}</ReactMarkdown>}
                            </div>
                        </div>
                    ))}
                    {loading && <div className="text-slate-400 text-sm ml-4 animate-pulse">AI 正在输入...</div>}
                    <div ref={messagesEndRef} />
                </div>

                {/* 输入区 */}
                <div className="p-5 bg-white border-t border-slate-100">
                    <div className="relative flex items-end gap-2 bg-slate-100 rounded-xl p-2 border border-slate-200 focus-within:ring-2 focus-within:ring-blue-100">
                        <textarea 
                            className="flex-1 bg-transparent border-0 focus:ring-0 resize-none max-h-32 min-h-[44px] py-2.5 px-2 text-slate-800 placeholder:text-slate-400"
                            placeholder="输入内容..." rows={1} value={input} onChange={e => setInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }}}
                        />
                        <button onClick={handleSend} disabled={!input.trim() || loading} className="p-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50">
                            <SendIcon size={18} />
                        </button>
                    </div>
                </div>
            </div>
        )}
      </div>

      {/* =============================================
         可拖拽分界线 (Resizer)
         =============================================
      */}
      <div
        className="relative w-4 bg-slate-100 border-l border-r border-slate-200 hover:bg-blue-50 transition-colors flex flex-col items-center justify-center z-30 group"
        style={{ cursor: 'col-resize' }}
        onMouseDown={startResizing}
      >
          {/* 装饰线条 */}
          <div className="h-8 flex flex-col gap-1 opacity-20 group-hover:opacity-100 transition-opacity">
              <div className="w-1 h-1 bg-slate-400 rounded-full"></div>
              <div className="w-1 h-1 bg-slate-400 rounded-full"></div>
              <div className="w-1 h-1 bg-slate-400 rounded-full"></div>
          </div>

          {/* 隐藏/展开 触发器按钮 
             (悬浮在分界线上，点击可快速折叠/展开右侧)
          */}
          <button 
             onMouseDown={(e) => e.stopPropagation()} // 防止触发拖拽
             onClick={toggleRightPanel}
             className="absolute top-1/2 -translate-y-1/2 w-6 h-12 bg-white border border-slate-200 rounded-full shadow-md flex items-center justify-center text-slate-400 hover:text-blue-600 hover:border-blue-200 z-40 transition-transform hover:scale-110 active:scale-95"
             title={isRightPanelOpen ? "折叠白板" : "展开白板"}
          >
             {isRightPanelOpen ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
      </div>

      {/* =============================================
         右侧区域 (动态宽度)
         =============================================
      */}
      <div 
        className={`bg-white flex flex-col z-20 shadow-[-10px_0_30px_-10px_rgba(0,0,0,0.05)] overflow-hidden transition-all duration-75 ease-out`}
        style={{ 
            width: isRightPanelOpen ? `${100 - leftWidth}%` : '0%',
            opacity: isRightPanelOpen ? 1 : 0
        }}
      >
        {/* 白板顶栏 */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-slate-100 bg-white/95 backdrop-blur min-w-[300px]">
            <span className="font-bold text-slate-700 flex items-center gap-2">
                <Layout className="text-purple-500" size={20} /> 
                全流程信息板
            </span>
            <button className="p-1.5 hover:bg-slate-100 rounded text-slate-400">
                <MoreHorizontal size={20} />
            </button>
        </div>
        
        {/* 白板内容区域 */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30 min-w-[300px]">
            <div className="space-y-6">
                {/* 进度卡片 */}
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex justify-between items-end mb-2">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">总进度</span>
                        <span className="text-2xl font-bold text-blue-600">{Math.round((unlockedIndex / 7) * 100)}%</span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${(unlockedIndex / 7) * 100}%` }} />
                    </div>
                </div>
                {/* 关键信息卡片 */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="bg-slate-50 px-5 py-3 border-b border-slate-100 flex justify-between items-center">
                        <h3 className="font-bold text-slate-700 text-sm">{STAGES[unlockedIndex].title} - 关键信息</h3>
                        <span className="text-[10px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">进行中</span>
                    </div>
                    <div className="p-5 min-h-[200px]">
                        {Object.keys(whiteboard).length > 0 ? (
                            <pre className="text-xs text-slate-600 whitespace-pre-wrap font-mono leading-relaxed">{JSON.stringify(whiteboard, null, 2)}</pre>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-40 text-slate-400 space-y-3">
                                <BrainCircuit size={32} className="opacity-20" />
                                <p className="text-xs">AI 正在收集信息...</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
      </div>

    </div>
  );
}