'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Target, BrainCircuit, FileText, Send, MessageSquare, DollarSign, Award, Sun } from 'lucide-react';

// --- 1. 阶段数据 ---
const STAGES = [
  { id: 'plan', title: '职业规划', icon: Target, color: 'bg-orange-500', shadow: 'shadow-orange-500/30' },
  { id: 'review', title: '经历复盘', icon: BrainCircuit, color: 'bg-amber-500', shadow: 'shadow-amber-500/30' },
  { id: 'resume', title: '简历优化', icon: FileText, color: 'bg-rose-500', shadow: 'shadow-rose-500/30' },
  { id: 'apply', title: '投递策略', icon: Send, color: 'bg-red-500', shadow: 'shadow-red-500/30' },
  { id: 'interview', title: '模拟面试', icon: MessageSquare, color: 'bg-pink-500', shadow: 'shadow-pink-500/30' },
  { id: 'salary', title: '谈薪策略', icon: DollarSign, color: 'bg-yellow-500', shadow: 'shadow-yellow-500/30' },
  { id: 'offer', title: 'Offer选择', icon: Award, color: 'bg-lime-500', shadow: 'shadow-lime-500/30' },
];

// --- 2. 火柴人教练组件 (修复 TypeScript 类型报错) ---
const StickFigureCoach = ({ 
  x, 
  y, 
  isMoving, 
  facing, 
  onClick 
}: { 
  x: string; 
  y: string; 
  isMoving: boolean; 
  facing: 'left' | 'right';
  onClick: () => void 
}) => {
  const [action, setAction] = useState('idle');
  const [isThinking, setIsThinking] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const actions = ['wave', 'cap', 'point'];
    const randomAction = actions[Math.floor(Math.random() * actions.length)];
    setAction(randomAction);
    onClick();
    setTimeout(() => setAction('idle'), 1500);
  };

  useEffect(() => {
    if (isMoving || action !== 'idle') {
      setIsThinking(false);
      return;
    }
    const timeout = setTimeout(() => {
      setIsThinking(true);
      setTimeout(() => setIsThinking(false), 2500);
    }, Math.random() * 3000 + 3000);
    return () => clearTimeout(timeout);
  }, [isMoving, action, isThinking]);

  // --- 动画变体 ---
  
  // 🔥 核心修复点：给 ease 加上 "as const"
  const walkTransition = { 
    repeat: Infinity, 
    repeatType: "reverse" as const, 
    duration: 0.3, 
    ease: "linear" as const  // <--- 这里的 as const 是必须的
  };

  const sideThighAnim = {
    left: { rotate: [-25, 20], transition: walkTransition },
    right: { rotate: [20, -25], transition: walkTransition }
  };
  const sideCalfAnim = {
    walk: { rotate: [0, 45, 0], transition: walkTransition }
  };
  const sideArmAnim = {
    left: { rotate: [15, -15], transition: walkTransition },
    right: { rotate: [-15, 15], transition: walkTransition }
  };
  const leftArmVariants = {
    crossedLeft: { d: "M 0,0 L 5,15 L 20,15", transition: { duration: 0.3 } }
  };
  const rightArmVariants = {
    crossedRight: { d: "M 0,0 L -5,15 L 15,15", rotate: 0, transition: { duration: 0.3 } },
    thinking: { d: "M 0,0 L 15,5 L 5,-15", rotate: 0, transition: { duration: 0.5, ease: "easeInOut" } },
    wave: { d: "M 0,0 L 15,-15", rotate: [0, -20, 20, 0], transition: { rotate: { repeat: 3, duration: 0.4 } } },
    cap: { d: "M 0,0 L 15,-20", rotate: 0, transition: { duration: 0.3 } },
    point: { d: "M 0,0 L 25,-10", rotate: 0, transition: { duration: 0.3 } }
  };

  return (
    <motion.div
      className="absolute w-24 h-32 z-50 pointer-events-auto cursor-pointer"
      style={{ left: x, top: y }}
      initial={false}
      animate={{ left: x, top: y, y: isMoving ? -4 : 0 }}
      transition={{ 
        default: { type: "spring", stiffness: 50, damping: 15 },
        y: { type: "tween", duration: 0.2, repeat: isMoving ? Infinity : 0, repeatType: "reverse" }
      }} 
      onClick={handleClick}
    >
      <AnimatePresence>
        {(action !== 'idle' || isThinking) && (
            <motion.div 
                initial={{ opacity: 0, y: 10, scale: 0 }}
                animate={{ opacity: 1, y: -50, scale: 1 }}
                exit={{ opacity: 0 }}
                className="absolute -top-5 left-8 bg-white text-stone-800 text-xs font-bold px-4 py-2 rounded-xl whitespace-nowrap shadow-xl border border-stone-200 z-50"
            >
                <div style={{ transform: facing === 'left' ? 'rotateY(180deg)' : 'none' }}>
                    {action === 'wave' && "Hi! 跟我一起向上!"}
                    {action === 'cap' && "调整状态，出发!"}
                    {action === 'point' && "顶峰就在那里!"}
                    {isThinking && action === 'idle' && "Hmm...下一步怎么走?"}
                </div>
                <div className="absolute top-full left-3 -mt-1 border-4 border-transparent border-t-white"></div>
            </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        className="w-full h-full"
        animate={{ rotateY: facing === 'left' ? 180 : 0 }}
        transition={{ type: "spring", stiffness: 60, damping: 15 }}
      >
        <svg viewBox="0 0 100 160" className="w-full h-full overflow-visible drop-shadow-md">
            <g stroke="#292524" fill="none"> 
                {isMoving && (
                <g>
                    <motion.g initial={{ x: 50, y: 90 }} animate="left" variants={sideThighAnim} style={{ originY: 0 }}>
                        <line x1="0" y1="0" x2="0" y2="25" strokeWidth="4" strokeLinecap="round" />
                        <motion.g initial={{ x: 0, y: 25 }} animate="walk" variants={sideCalfAnim} style={{ originY: 0 }}>
                            <line x1="0" y1="0" x2="0" y2="28" strokeWidth="4" strokeLinecap="round" />
                        </motion.g>
                    </motion.g>
                    <line x1="50" y1="45" x2="50" y2="90" strokeWidth="4" strokeLinecap="round" />
                    <motion.g initial={{ x: 50, y: 90 }} animate="right" variants={sideThighAnim} style={{ originY: 0 }}>
                        <line x1="0" y1="0" x2="0" y2="25" strokeWidth="4" strokeLinecap="round" />
                        <motion.g initial={{ x: 0, y: 25 }} animate="walk" variants={sideCalfAnim} style={{ originY: 0 }} transition={{ delay: 0.2 }}>
                            <line x1="0" y1="0" x2="0" y2="28" strokeWidth="4" strokeLinecap="round" />
                        </motion.g>
                    </motion.g>
                    <circle cx="50" cy="30" r="14" fill="white" strokeWidth="3.5" />
                    <path d="M 35,22 Q 50,10 65,22 Z" fill="#EF4444" stroke="#EF4444" strokeWidth="4" strokeLinejoin="round" />
                    <path d="M 60,22 L 78,24" stroke="#EF4444" strokeWidth="5" strokeLinecap="round" />
                    <motion.g initial={{ x: 50, y: 55 }} animate="left" variants={sideArmAnim} style={{ originY: 0 }}>
                        <line x1="0" y1="0" x2="0" y2="28" strokeWidth="4" strokeLinecap="round" />
                    </motion.g>
                    <motion.g initial={{ x: 50, y: 55 }} animate="right" variants={sideArmAnim} style={{ originY: 0 }}>
                        <line x1="0" y1="0" x2="0" y2="28" strokeWidth="4" strokeLinecap="round" />
                    </motion.g>
                </g>
                )}

                {!isMoving && (
                <g>
                    <line x1="50" y1="90" x2="42" y2="140" strokeWidth="4" strokeLinecap="round" />
                    <line x1="50" y1="90" x2="58" y2="140" strokeWidth="4" strokeLinecap="round" />
                    <line x1="50" y1="45" x2="50" y2="90" strokeWidth="4" strokeLinecap="round" />
                    <circle cx="50" cy="30" r="14" fill="white" strokeWidth="3.5" />
                    <motion.g animate={action === 'cap' ? { y: -5 } : { y: 0 }}>
                        <path d="M 36,20 Q 50,8 64,20 Z" fill="#EF4444" stroke="#EF4444" strokeWidth="4" strokeLinejoin="round" />
                        <path d="M 34,20 Q 50,26 66,20" fill="none" stroke="#EF4444" strokeWidth="4" strokeLinecap="round" />
                    </motion.g>
                    <motion.g initial={{ x: 50, y: 55 }} animate="crossedLeft" variants={leftArmVariants} style={{ originY: 0 }}>
                        <motion.path strokeWidth="4" strokeLinecap="round" variants={leftArmVariants} />
                    </motion.g>
                    <motion.g 
                        initial={{ x: 50, y: 55 }}
                        animate={action !== 'idle' ? action : (isThinking ? "thinking" : "crossedRight")}
                        style={{ originY: 0 }}
                    >
                        <motion.path strokeWidth="4" strokeLinecap="round" variants={rightArmVariants} />
                        {isThinking && action === 'idle' && <motion.circle cx="5" cy="-15" r="3" fill="#292524" initial={{ scale: 0 }} animate={{ scale: 1 }} stroke="none" />}
                        {action === 'point' && <motion.circle cx="25" cy="-10" r="4" fill="#F59E0B" stroke="none" />}
                    </motion.g>
                </g>
                )}
            </g>
        </svg>
      </motion.div>
    </motion.div>
  );
};

// --- 3. 主页面 ---
export default function FlowPage() {
  const router = useRouter();
  const [targetIndex, setTargetIndex] = useState(0);
  const [isCoachMoving, setIsCoachMoving] = useState(false);
  // 新增：记录当前朝向
  const [facing, setFacing] = useState<'right' | 'left'>('right');
  
  const positions = useMemo(() => {
    return STAGES.map((_, index) => {
      const progress = index / (STAGES.length - 1);
      const x = 10 + progress * 75; 
      const y = 75 - progress * 60; 
      return { x, y };
    });
  }, []);

  // 处理鼠标悬停逻辑
  const handleMouseEnter = (index: number) => {
    // 如果目标在当前位置左边/下边，则向左转
    if (index < targetIndex) {
        setFacing('left');
    } 
    // 如果目标在当前位置右边/上边，则向右转
    else if (index > targetIndex) {
        setFacing('right');
    }
    
    setTargetIndex(index);
  };

  useEffect(() => {
    setIsCoachMoving(true);
    const timer = setTimeout(() => {
      setIsCoachMoving(false);
    }, 600); 
    return () => clearTimeout(timer);
  }, [targetIndex]);

  const handleStageClick = () => {
    router.push('/chat');
  };

  return (
    <div className="h-screen w-full bg-gradient-to-br from-amber-50 via-orange-50 to-rose-100 relative overflow-hidden font-sans select-none text-stone-800">
      
      {/* 装饰: 晨光 */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-orange-400/20 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-rose-400/10 rounded-full blur-[80px] pointer-events-none"></div>

      {/* 连接路径 */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
         <defs>
            <linearGradient id="warmPathGradient" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#D97706" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#EF4444" stopOpacity="0.6" />
            </linearGradient>
         </defs>
         <path 
            d={`M ${positions.map(p => `${p.x}% ${p.y}%`).join(' L ')}`}
            fill="none"
            stroke="url(#warmPathGradient)"
            strokeWidth="3"
            strokeDasharray="8 8"
            className="drop-shadow-sm"
         />
      </svg>

      {/* 标题 */}
      <div className="absolute top-10 left-10 z-20">
         <h1 className="text-4xl font-bold text-stone-800 mb-2 flex items-center gap-3 tracking-tight">
            <Sun className="text-orange-500 fill-orange-500" />
            职业进阶 · 晨曦之旅
         </h1>
         <p className="text-stone-500 font-medium">跟随 AI 教练，每一步都是向上的风景。</p>
      </div>

      {/* 渲染台阶 */}
      <div className="absolute inset-0 z-30 w-full h-full">
         {STAGES.map((stage, index) => {
            const pos = positions[index];
            const isActive = index === targetIndex;
            
            return (
               <motion.div
                  key={stage.id}
                  className="absolute"
                  style={{ 
                    left: `${pos.x}%`, 
                    top: `${pos.y}%`,
                    marginLeft: '-60px', 
                    marginTop: '-40px'
                  }}
                  onMouseEnter={() => handleMouseEnter(index)} // 使用新的处理函数
                  onClick={handleStageClick}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: index * 0.1 }}
               >
                  {/* 台阶实体 */}
                  <div className={`
                     group relative w-32 h-16 rounded-xl flex items-center justify-center cursor-pointer transition-all duration-300
                     ${isActive 
                        ? 'bg-white scale-110 -translate-y-2 ring-2 ring-orange-200' 
                        : 'bg-white/60 hover:bg-white'
                     }
                     border border-stone-200/50 backdrop-blur-sm shadow-xl ${isActive ? stage.shadow : 'shadow-stone-200'}
                  `}>
                     <div className={`transition-colors duration-300 ${isActive ? stage.color.replace('bg-', 'text-') : 'text-stone-400 group-hover:text-stone-600'}`}>
                         <stage.icon size={24} />
                     </div>
                     <div className={`absolute -top-3 -left-3 w-6 h-6 rounded-full border border-white text-xs flex items-center justify-center font-bold shadow-sm transition-colors ${isActive ? 'bg-orange-500 text-white' : 'bg-stone-200 text-stone-500'}`}>
                        {index + 1}
                     </div>
                     {isActive && <div className={`absolute -bottom-6 w-16 h-1 rounded-full ${stage.color} blur-md opacity-40`}></div>}
                  </div>
                  <div className={`absolute top-20 w-32 text-center transition-all duration-300 ${isActive ? 'opacity-100 translate-y-0' : 'opacity-60 translate-y-2'}`}>
                     <p className={`font-bold text-sm ${isActive ? 'text-stone-800' : 'text-stone-500'}`}>{stage.title}</p>
                  </div>
               </motion.div>
            );
         })}
      </div>

      {/* 5. 火柴人教练 */}
      <StickFigureCoach 
         x={`calc(${positions[targetIndex].x}% - 25px)`} 
         y={`calc(${positions[targetIndex].y}% - 120px)`} 
         isMoving={isCoachMoving}
         facing={facing} // 传入朝向
         onClick={() => console.log("Coach clicked!")}
      />

    </div>
  );
}