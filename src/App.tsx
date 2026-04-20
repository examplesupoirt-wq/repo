import React, { useEffect, useRef, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Settings, 
  Target, 
  Zap, 
  RotateCcw, 
  ChevronRight, 
  HelpCircle,
  Eye,
  EyeOff,
  Maximize2
} from 'lucide-react';
import { 
  Vector2D, 
  Piece, 
  BOARD_SIZE, 
  POCKETS, 
  STRIKER_RADIUS, 
  COIN_RADIUS, 
  ShotPrediction,
  COIN_MASS,
  STRIKER_MASS
} from './types';
import { 
  predictFullShot, 
  distance, 
  normalize, 
  subtract, 
  add, 
  multiply 
} from './physics';

const INITIAL_PIECES: Piece[] = [
  // Queen
  { id: 'queen', type: 'queen', position: { x: BOARD_SIZE / 2, y: BOARD_SIZE / 2 }, radius: COIN_RADIUS, mass: COIN_MASS, isPocketed: false },
  // White Pieces (simplified hexagonal-ish layout)
  ...[0, 60, 120, 180, 240, 300].map((angle, i) => ({
    id: `white-${i}`,
    type: 'white' as const,
    position: {
      x: BOARD_SIZE / 2 + Math.cos((angle * Math.PI) / 180) * COIN_RADIUS * 2.2,
      y: BOARD_SIZE / 2 + Math.sin((angle * Math.PI) / 180) * COIN_RADIUS * 2.2,
    },
    radius: COIN_RADIUS,
    mass: COIN_MASS,
    isPocketed: false,
  })),
  // Black Pieces
  ...[30, 90, 150, 210, 270, 330].map((angle, i) => ({
    id: `black-${i}`,
    type: 'black' as const,
    position: {
      x: BOARD_SIZE / 2 + Math.cos((angle * Math.PI) / 180) * COIN_RADIUS * 4.4,
      y: BOARD_SIZE / 2 + Math.sin((angle * Math.PI) / 180) * COIN_RADIUS * 4.4,
    },
    radius: COIN_RADIUS,
    mass: COIN_MASS,
    isPocketed: false,
  })),
  // Striker
  { id: 'striker', type: 'striker', position: { x: BOARD_SIZE / 2, y: BOARD_SIZE - 100 }, radius: STRIKER_RADIUS, mass: STRIKER_MASS, isPocketed: false },
];

export default function App() {
  const [pieces, setPieces] = useState<Piece[]>(INITIAL_PIECES);
  const [strikerAngle, setStrikerAngle] = useState(270); // Upwards
  const [strikerPower, setStrikerPower] = useState(50);
  const [strikerX, setStrikerX] = useState(BOARD_SIZE / 2);
  const [showPrediction, setShowPrediction] = useState(true);
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isServiceActive, setIsServiceActive] = useState(false);
  const [isOverlayMode, setIsOverlayMode] = useState(false);
  const [assistLevel, setAssistLevel] = useState<'basic' | 'advanced' | 'pro'>('pro');
  
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Update striker position state
  useEffect(() => {
    setPieces(prev => prev.map(p => {
      if (p.type === 'striker') {
        return { ...p, position: { x: strikerX, y: BOARD_SIZE - 100 } };
      }
      return p;
    }));
  }, [strikerX]);

  const maxWallBounces = useMemo(() => {
    switch (assistLevel) {
      case 'basic': return 0;
      case 'advanced': return 1;
      case 'pro': return 7;
      default: return 7;
    }
  }, [assistLevel]);

  const currentPrediction = useMemo(() => {
    if (!showPrediction) return null;
    const rad = (strikerAngle * Math.PI) / 180;
    const dir = { x: Math.cos(rad), y: Math.sin(rad) };
    const striker = pieces.find(p => p.type === 'striker')!;
    return predictFullShot(striker.position, dir, pieces, maxWallBounces);
  }, [pieces, strikerAngle, showPrediction, maxWallBounces]);

  // Scoring and Auto-Targeting
  const findBestShot = () => {
    let bestScore = -Infinity;
    let bestAngle = 270;
    
    // Scan angles
    for (let angle = 0; angle < 360; angle += 0.5) {
      const rad = (angle * Math.PI) / 180;
      const dir = { x: Math.cos(rad), y: Math.sin(rad) };
      const striker = pieces.find(p => p.type === 'striker')!;
      const pred = predictFullShot(striker.position, dir, pieces, maxWallBounces);
      
      if (pred.score > bestScore) {
        bestScore = pred.score;
        bestAngle = angle;
      }
    }
    setStrikerAngle(bestAngle);
  };

  const findBestPosition = () => {
    let bestOverallScore = -Infinity;
    let bestX = strikerX;
    let bestAngle = strikerAngle;

    // Scan X position in increments
    for (let x = 100; x <= BOARD_SIZE - 100; x += 15) {
      const tempStrikerPos = { x, y: BOARD_SIZE - 100 };
      
      // Validity check: Check if striker overlaps any piece at this X
      const isOverlap = pieces.some(p => p.type !== 'striker' && !p.isPocketed && distance(tempStrikerPos, p.position) < (STRIKER_RADIUS + p.radius));
      if (isOverlap) continue;

      const tempPieces = pieces.map(p => p.type === 'striker' ? { ...p, position: tempStrikerPos } : p);
      const striker = tempPieces.find(p => p.type === 'striker')!;
      
      // For each X, scan angles
      for (let angle = 0; angle < 360; angle += 1.5) {
        const rad = (angle * Math.PI) / 180;
        const dir = { x: Math.cos(rad), y: Math.sin(rad) };
        const pred = predictFullShot(striker.position, dir, tempPieces, maxWallBounces);
        
        if (pred.score > bestOverallScore) {
          bestOverallScore = pred.score;
          bestX = x;
          bestAngle = angle;
        }
      }
    }

    setStrikerX(bestX);
    setStrikerAngle(bestAngle);
  };

  const dragState = useRef<'angle' | 'position' | null>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * BOARD_SIZE;
    const y = ((e.clientY - rect.top) / rect.height) * BOARD_SIZE;

    const striker = pieces.find(p => p.type === 'striker')!;
    const distToStriker = distance({ x, y }, striker.position);

    if (distToStriker < striker.radius * 2) {
      dragState.current = 'position';
    } else {
      dragState.current = 'angle';
    }
    handleMouseMove(e);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragState.current && !e.shiftKey) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * BOARD_SIZE;
    const y = ((e.clientY - rect.top) / rect.height) * BOARD_SIZE;
    
    if (dragState.current === 'position' || (e.shiftKey && dragState.current === null)) {
      // Horizontal positioning on baseline
      const newX = Math.max(100, Math.min(BOARD_SIZE - 100, x));
      setStrikerX(newX);
    } else {
      // Angle adjustment
      const striker = pieces.find(p => p.type === 'striker')!;
      const dx = x - striker.position.x;
      const dy = y - striker.position.y;
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      setStrikerAngle(angle < 0 ? angle + 360 : angle);
    }
  };

  useEffect(() => {
    const onMouseUp = () => { dragState.current = null; };
    window.addEventListener('mouseup', onMouseUp);
    return () => window.removeEventListener('mouseup', onMouseUp);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

      const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (!isOverlayMode) {
        // Draw Board background
        ctx.fillStyle = '#0f172a'; // Deep slate
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Decorative corner patterns
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)';
        ctx.lineWidth = 2;
        [0, BOARD_SIZE].forEach(x => [0, BOARD_SIZE].forEach(y => {
          ctx.beginPath();
          ctx.arc(x, y, 100, 0, Math.PI * 2);
          ctx.stroke();
        }));

        // Draw baseline for striker
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 40;
        ctx.beginPath(); ctx.moveTo(100, BOARD_SIZE - 100); ctx.lineTo(BOARD_SIZE - 100, BOARD_SIZE - 100); ctx.stroke();
        
        // Draw pockets
        POCKETS.forEach(p => {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 40, 0, Math.PI * 2);
          ctx.fillStyle = '#020617';
          ctx.fill();
          ctx.strokeStyle = '#1e293b';
          ctx.lineWidth = 4;
          ctx.stroke();
        });
      }

      // Draw prediction if enabled
      if (currentPrediction && !isSimulating && (isServiceActive || !isOverlayMode)) {
        // Draw striker path with gradient/glow
        ctx.setLineDash([8, 4]);
        
        currentPrediction.reflectionLines.forEach((line, i) => {
          if (i === 0) {
            ctx.strokeStyle = isOverlayMode ? 'rgba(56, 189, 248, 1)' : 'rgba(56, 189, 248, 0.8)';
            ctx.shadowColor = 'rgba(56, 189, 248, 0.5)';
          } else if (i === 1) {
            ctx.strokeStyle = 'rgba(244, 63, 94, 0.9)'; // Vivid rose
            ctx.shadowColor = 'rgba(244, 63, 94, 0.5)';
            ctx.setLineDash([]); // Solid line for target coin
          } else {
            ctx.strokeStyle = 'rgba(251, 146, 60, 0.6)'; // Orange
            ctx.shadowColor = 'rgba(251, 146, 60, 0.3)';
            ctx.setLineDash([4, 2]);
          }
          
          ctx.beginPath();
          ctx.shadowBlur = 10;
          line.forEach((p, idx) => {
            if (idx === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
          });
          ctx.stroke();
          ctx.shadowBlur = 0;
        });
        ctx.setLineDash([]);

        // Ghost Ball at collision
        if (currentPrediction.collisionPoint) {
          ctx.beginPath();
          ctx.arc(currentPrediction.collisionPoint.x, currentPrediction.collisionPoint.y, STRIKER_RADIUS - 1, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
          ctx.setLineDash([2, 2]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // Draw pieces only in regular mode
      if (!isOverlayMode) {
        pieces.forEach(p => {
          if (p.isPocketed) return;
          
          ctx.beginPath();
          ctx.arc(p.position.x, p.position.y, p.radius, 0, Math.PI * 2);
          
          switch (p.type) {
            case 'striker': 
              ctx.fillStyle = '#f8fafc'; 
              ctx.shadowBlur = 15;
              ctx.shadowColor = 'rgba(56, 189, 248, 0.6)';
              break;
            case 'queen': ctx.fillStyle = '#f43f5e'; break;
            case 'white': ctx.fillStyle = '#f1f5f9'; break;
            case 'black': ctx.fillStyle = '#334155'; break;
          }
          ctx.fill();
          ctx.shadowBlur = 0;
          
          ctx.strokeStyle = 'rgba(0,0,0,0.3)';
          ctx.lineWidth = 1;
          ctx.stroke();
        });
      }
    };

    const animFrame = requestAnimationFrame(function loop() {
      draw();
      requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(animFrame);
  }, [pieces, currentPrediction, isSimulating, isOverlayMode, isServiceActive]);

  const toggleService = () => {
    if (!isServiceActive) {
      setIsServiceActive(true);
      setIsOverlayMode(true);
    } else {
      setIsServiceActive(false);
      setIsOverlayMode(false);
    }
  };

  const launchGame = () => {
    window.open('https://www.miniclip.com/games/carrom-disc-pool/en/', '_blank');
  };

  return (
    <div className={`min-h-screen font-sans selection:bg-sky-500/30 overflow-x-hidden transition-colors duration-500 ${isOverlayMode ? 'bg-transparent' : 'bg-[#020617] text-slate-200'}`}>
      {/* Header */}
      <AnimatePresence>
        {!isOverlayMode && (
          <motion.header 
            initial={{ y: -100 }}
            animate={{ y: 0 }}
            exit={{ y: -100 }}
            className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md px-8 py-4 flex items-center justify-between sticky top-0 z-50"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-sky-500 rounded-xl flex items-center justify-center shadow-lg shadow-sky-500/20">
                <Target className="text-white w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-white italic">BITAIM <span className="text-sky-400 not-italic">BOT PRO</span></h1>
                <p className="text-[10px] font-mono text-slate-500 uppercase tracking-[0.2em]">Android-Style Overlay Tool</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <button 
                onClick={launchGame}
                className="hidden md:flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-600 rounded-xl text-white font-bold text-xs shadow-lg shadow-orange-500/20 hover:scale-105 transition-transform"
              >
                LAUNCH GAME
              </button>
              <button 
                onClick={() => setShowPrediction(!showPrediction)}
                className={`p-2.5 rounded-xl transition-all ${showPrediction ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/20' : 'bg-slate-800 text-slate-400'}`}
              >
                {showPrediction ? <Eye size={18} /> : <EyeOff size={18} />}
              </button>
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      <main className={`container mx-auto py-12 px-6 flex flex-col xl:flex-row gap-12 items-center xl:items-start justify-center ${isOverlayMode ? 'pt-24' : ''}`}>
        {/* Floating Controls for Overlay Mode */}
        {isOverlayMode && (
          <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[100] flex gap-4 pointer-events-auto">
            <button 
              onClick={toggleService}
              className="px-6 py-3 bg-rose-500 text-white rounded-2xl font-bold text-sm shadow-xl shadow-rose-500/40 hover:bg-rose-400 transition-colors flex items-center gap-2"
            >
              <RotateCcw size={16} /> STOP SERVICE
            </button>
             <div className="px-6 py-3 bg-slate-900/60 backdrop-blur-sm rounded-2xl border border-slate-800/50 flex items-center gap-6 shadow-xl shadow-black/20">
               <button 
                 onClick={findBestPosition}
                 className="p-2 bg-indigo-500 text-white rounded-xl hover:bg-indigo-400 transition-colors shadow-lg shadow-indigo-500/30"
                 title="Auto Position Striker"
               >
                 <Maximize2 size={16} />
               </button>
               <div className="w-px h-8 bg-slate-700" />
               <div className="flex flex-col">
                  <span className="text-[10px] text-slate-400 font-mono tracking-widest uppercase">POSITION</span>
                  <input 
                    type="range"
                    min={100}
                    max={BOARD_SIZE - 100}
                    value={strikerX}
                    onChange={(e) => setStrikerX(Number(e.target.value))}
                    className="w-32 h-1 accent-sky-500 appearance-none bg-slate-800 rounded-full"
                  />
               </div>
               <div className="w-px h-8 bg-slate-700" />
               <div className="flex flex-col">
                  <span className="text-[10px] text-slate-400 font-mono tracking-widest uppercase">ANGLE</span>
                  <input 
                    type="range"
                    min={0}
                    max={360}
                    step={0.1}
                    value={strikerAngle}
                    onChange={(e) => setStrikerAngle(Number(e.target.value))}
                    className="w-32 h-1 accent-rose-500 appearance-none bg-slate-800 rounded-full"
                  />
               </div>
               <div className="w-px h-8 bg-slate-700" />
               <div className="flex gap-1 bg-slate-950/50 p-1 rounded-xl border border-slate-800">
                  {(['basic', 'advanced', 'pro'] as const).map((level) => (
                    <button
                      key={level}
                      onClick={() => setAssistLevel(level)}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${
                        assistLevel === level 
                          ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/20' 
                          : 'text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {level}
                    </button>
                  ))}
               </div>
            </div>
          </div>
        )}

        {/* Board Section */}
        <div className={`relative transition-all duration-700 ${isOverlayMode ? 'scale-110' : ''}`}>
          <div className={`absolute -inset-10 bg-gradient-to-tr from-sky-500/5 via-transparent to-rose-500/5 rounded-full blur-[100px] pointer-events-none transition-opacity duration-700 ${isOverlayMode ? 'opacity-0' : 'opacity-100'}`} />
          <div 
            className={`relative p-4 rounded-[40px] border transition-all duration-700 cursor-crosshair overflow-hidden group ${isOverlayMode ? 'bg-transparent border-transparent' : 'bg-[#1e293b] border-slate-700 shadow-[0_0_100px_rgba(0,0,0,0.5)]'}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
          >
            {!isOverlayMode && <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/dark-wood.png')] opacity-20 pointer-events-none" />}
            <canvas 
              ref={canvasRef}
              width={BOARD_SIZE}
              height={BOARD_SIZE}
              className={`rounded-[32px] transition-all duration-700 relative z-10 ${isOverlayMode ? 'opacity-100 shadow-none' : 'shadow-inner'}`}
              style={{ width: 'min(740px, 85vw)', height: 'min(740px, 85vw)' }}
            />
          </div>
        </div>

        {/* Controls Sidebar */}
        {!isOverlayMode && (
          <aside className="w-full xl:w-96 space-y-6">
            {/* Start Service Button */}
            <button 
              onClick={toggleService}
              className="w-full group relative overflow-hidden flex items-center justify-center gap-3 py-6 bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-[32px] transition-all shadow-2xl shadow-emerald-500/20 hover:scale-[1.02]"
            >
              <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
              <Zap className="animate-pulse" />
              <span className="text-lg font-black tracking-tight italic uppercase">START AIMING SERVICE</span>
            </button>

            {/* Main Controls Overlay settings placeholder */}
            <section className="bg-slate-900/80 border border-slate-700/50 rounded-2xl p-6 shadow-xl backdrop-blur-md">
              <div className="flex items-center gap-2 mb-6 text-sky-400">
                <Settings size={18} />
                <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-sky-400">Targeting Controls</h2>
              </div>
              
              <div className="space-y-8">
                {/* Aim Assist Level */}
                <div className="space-y-3">
                  <label className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">Aim Assist Level</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['basic', 'advanced', 'pro'] as const).map((level) => (
                      <button
                        key={level}
                        onClick={() => setAssistLevel(level)}
                        className={`py-2 rounded-xl text-[10px] font-bold uppercase border transition-all ${
                          assistLevel === level 
                            ? 'bg-sky-500 border-sky-400 text-white shadow-lg shadow-sky-500/20' 
                            : 'bg-slate-950/50 border-slate-800 text-slate-500 hover:border-slate-700'
                        }`}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Striker X Position */}
                <div className="space-y-4">
                  <div className="flex justify-between items-end">
                    <label className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">Striker Position (X)</label>
                    <span className="text-xs font-mono text-sky-400">{strikerX.toFixed(0)}px</span>
                  </div>
                  <input 
                    type="range"
                    min={100}
                    max={BOARD_SIZE - 100}
                    value={strikerX}
                    onChange={(e) => setStrikerX(Number(e.target.value))}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-500"
                  />
                </div>

                {/* Angle */}
                <div className="space-y-4">
                  <div className="flex justify-between items-end">
                    <label className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">Shot Angle</label>
                    <span className="text-xs font-mono text-rose-400">{strikerAngle.toFixed(1)}°</span>
                  </div>
                  <input 
                    type="range"
                    min={0}
                    max={360}
                    step={0.1}
                    value={strikerAngle}
                    onChange={(e) => setStrikerAngle(Number(e.target.value))}
                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-rose-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-10">
                <button 
                  onClick={findBestShot}
                  className="flex items-center justify-center gap-2 py-3 bg-sky-500 hover:bg-sky-400 text-white rounded-xl transition-all shadow-lg shadow-sky-500/20 text-xs font-bold"
                >
                  <Target size={14} />
                  AUTO BEST
                </button>
                <button 
                  onClick={() => setPieces(INITIAL_PIECES)}
                  className="flex items-center justify-center gap-2 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition-all text-xs font-bold"
                >
                  <RotateCcw size={14} />
                  RESET
                </button>
              </div>

              <button 
                onClick={findBestPosition}
                className="w-full mt-4 flex items-center justify-center gap-3 py-4 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-xl transition-all shadow-xl shadow-indigo-500/20 text-xs font-black italic uppercase"
              >
                <Maximize2 size={16} />
                AUTO POSITION STRIKER
              </button>
            </section>

            {/* Telemetry Panel */}
            <section className="bg-slate-900/80 border border-slate-700/50 rounded-2xl p-6 shadow-xl backdrop-blur-md">
              <div className="flex items-center gap-2 mb-6 text-rose-400">
                 <Settings size={18} />
                 <h2 className="text-xs font-mono font-bold uppercase tracking-widest text-rose-400">Telemetry</h2>
              </div>
              
              <div className="space-y-3 font-mono text-[10px]">
                <div className="flex justify-between p-3 bg-slate-950/50 rounded-lg border border-slate-800/50">
                  <span className="text-slate-500">REFLECTIONS</span>
                  <span className="text-sky-400">{currentPrediction?.reflectionLines.length || 0} Layers</span>
                </div>
                <div className="flex justify-between p-3 bg-slate-950/50 rounded-lg border border-slate-800/50">
                  <span className="text-slate-500">POCKET CHANCE</span>
                  <span className="text-rose-400">{currentPrediction?.pocketIndex !== undefined ? 'HIGH' : 'LOW'}</span>
                </div>
              </div>
            </section>
          </aside>
        )}
      </main>

      {/* Footer Info */}
      <footer className={`mt-auto border-t border-slate-800 py-8 text-center text-[10px] font-mono text-slate-500 uppercase tracking-[0.3em] transition-opacity duration-700 ${isOverlayMode ? 'opacity-0' : 'opacity-100'}`}>
        Engineered for precision targeting &middot; &copy; 2026 BitAim Systems
      </footer>
    </div>
  );
}
