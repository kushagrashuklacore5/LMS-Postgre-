import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  motion,
  useMotionValue,
  useTransform,
  animate,
  useReducedMotion,
  AnimatePresence,
} from 'framer-motion';
import { GraduationCap, Presentation, Landmark, ShieldCheck } from 'lucide-react';
import studentImg from '../../assets/student_reading.jpg';
import facultyImg from '../../assets/persona_faculty.jpg';
import uniImg from '../../assets/persona_university.jpg';
import adminImg from '../../assets/persona_admins.jpg';

export const PERSONAS = [
  {
    t: 'Students',
    s: 'Learn & Grow',
    d: 'Courses, AI tutor, results and credentials in one portal.',
    note: 'Students get one login for courses, AI help, results and certificates.',
    Icon: GraduationCap,
    img: studentImg,
    pos: '50% 62%',
  },
  {
    t: 'Faculty',
    s: 'Teach & Inspire',
    d: 'Plan classes, grade faster and see who needs help.',
    note: 'Faculty plan, teach and grade with live class insights.',
    Icon: Presentation,
    img: facultyImg,
  },
  {
    t: 'University',
    s: 'Manage & Scale',
    d: 'Admissions, logistics and finance across every campus.',
    note: 'Universities run admissions, logistics and finance from one place.',
    Icon: Landmark,
    img: uniImg,
  },
  {
    t: 'Admins',
    s: 'Control & Secure',
    d: 'Roles, SSO, audits and reports with full control.',
    note: 'Admins control roles, SSO and audits with full visibility.',
    Icon: ShieldCheck,
    img: adminImg,
  },
];

const N = 4;
const STEP = 90;
const BASE = 180;
// Redington measured sine in-out cubic-bezier
const SINE = [0.37, 0, 0.63, 1];
const wrap = (a) => ((a % 360) + 540) % 360 - 180;
const dist = (i, R) => Math.abs(wrap(BASE + i * STEP + R - 180));

function OrbitNode({ i, R, W, active, onSelect, persona, hasMovedRef, onExplore }) {
  const Icon = persona.Icon;
  const H = (W * 300) / 360;
  const cx = 0.59 * W;
  const cy = 0.5 * H;
  const r = 0.29 * W;

  const isActive = active === i;

  // Center coordinates of this node along the circular orbit
  const centerX = useTransform(R, (rVal) => {
    const rad = ((BASE + i * STEP + rVal) * Math.PI) / 180;
    return cx + r * Math.cos(rad);
  });

  const centerY = useTransform(R, (rVal) => {
    const rad = ((BASE + i * STEP + rVal) * Math.PI) / 180;
    return cy + r * Math.sin(rad);
  });

  // Measured Redington growth: inactive = 20% of W, active = 34% of W
  const targetW = (isActive ? 0.34 : 0.20) * W;
  const targetH = (targetW * 78) / 70;

  const handleClick = (e) => {
    if (hasMovedRef.current) {
      e.preventDefault();
      return;
    }
    if (isActive) {
      onExplore?.(i, persona);
    } else {
      onSelect();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick(e);
    }
  };

  return (
    <motion.div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={isActive ? `${persona.t} - Click to explore` : persona.t}
      aria-current={isActive}
      animate={{
        width: targetW,
        height: targetH,
      }}
      transition={{
        duration: 0.35,
        ease: SINE,
      }}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        x: centerX,
        y: centerY,
        translateX: '-50%',
        translateY: '-50%',
        filter: isActive
          ? 'drop-shadow(0 14px 28px rgba(11, 21, 40, 0.26))'
          : 'drop-shadow(0 8px 18px rgba(15, 23, 42, 0.10))',
      }}
      className={`p-0 border-0 bg-transparent cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#B99652] focus-visible:outline-offset-2 select-none ${
        isActive ? 'z-20' : 'z-10'
      }`}
    >
      <div
        className="relative w-full h-full flex flex-col items-center justify-center text-center px-[12%] transition-all duration-300"
        style={{
          clipPath: 'url(#hexPointyRounded)',
          backdropFilter: isActive ? 'blur(8px)' : 'none',
          WebkitBackdropFilter: isActive ? 'blur(8px)' : 'none',
        }}
      >
        {/* Inactive White Layer */}
        <div
          className={`absolute inset-0 pointer-events-none transition-opacity duration-300 ${
            isActive ? 'opacity-0' : 'opacity-100 bg-white'
          }`}
        />
        {/* Active Navy Glass Layer */}
        <div
          className={`absolute inset-0 pointer-events-none transition-opacity duration-300 ${
            isActive
              ? 'opacity-100 bg-gradient-to-br from-[#1D528F]/90 to-[#0B1528]/95'
              : 'opacity-0'
          }`}
        />

        {/* Content (always strictly upright) */}
        <div className="relative flex flex-col items-center justify-center w-full">
          <Icon
            className={`transition-colors duration-200 stroke-[1.8] pointer-events-none ${
              isActive
                ? 'w-6 h-6 text-[#D4B577] mb-1'
                : 'w-4 h-4 text-[#1D528F] mb-0.5'
            }`}
          />
          <b
            className={`font-bold leading-tight transition-colors duration-200 pointer-events-none ${
              isActive ? 'text-white text-sm sm:text-base' : 'text-[#0F172A] text-xs sm:text-sm'
            }`}
          >
            {persona.t}
          </b>
          {!isActive && (
            <small className="text-[10px] text-[#475569] leading-tight mt-0.5 pointer-events-none">
              {persona.s}
            </small>
          )}

          {/* Active description and pill */}
          <div
            className={`grid justify-items-center overflow-hidden transition-all duration-300 ease-out ${
              isActive
                ? 'max-h-[140px] opacity-100 mt-1.5'
                : 'max-h-0 opacity-0 pointer-events-none'
            }`}
          >
            <span
              className="text-[#E2E8F0] leading-snug my-1 text-center pointer-events-none"
              style={{ fontSize: 'clamp(10px, 1.05vw, 12px)' }}
            >
              {persona.d}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onExplore?.(i, persona);
              }}
              className="inline-flex items-center justify-center border border-[#B99652] hover:border-[#D4B577] bg-transparent hover:bg-[#B99652] text-[#D4B577] hover:text-white font-semibold text-[10px] tracking-[0.5px] px-3.5 py-1 uppercase font-['Poppins'] shadow-xs mt-0.5 cursor-pointer transition-all duration-200 active:scale-95"
            >
              Explore
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function PersonaOrbit({ onChange, onExplore }) {
  const R = useMotionValue(0);
  const [active, setActive] = useState(0);
  const [W, setW] = useState(600);
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const reduce = useReducedMotion();
  const stageRef = useRef(null);
  const animRef = useRef(null);
  const dragState = useRef(null);
  const hasMovedRef = useRef(false);
  const activeRef = useRef(0);
  const isHoveredRef = useRef(false);
  const isDraggingRef = useRef(false);
  const isInViewRef = useRef(true);

  const isMobile = W < 520;

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const stopAnimation = useCallback(() => {
    if (animRef.current) {
      animRef.current.stop();
      animRef.current = null;
    }
  }, []);

  // Redington Motion: 0ms instant state change + 600ms wheel rotation via shortest path
  const activate = useCallback(
    (k) => {
      setActive(k);
      activeRef.current = k;
      onChange?.(k);
      stopAnimation();

      const currentR = R.get();
      const delta = wrap(-k * STEP - currentR);
      const targetR = currentR + delta;

      if (reduce) {
        R.set(targetR);
      } else {
        animRef.current = animate(R, targetR, {
          duration: 0.6, // 600 ms wheel rotation
          ease: SINE,
        });
      }
    },
    [R, onChange, reduce, stopAnimation]
  );

  // ResizeObserver for responsive stage width
  useEffect(() => {
    if (!stageRef.current) return;
    const updateW = () => {
      if (stageRef.current) {
        const clientW = stageRef.current.clientWidth;
        if (clientW > 0) setW(clientW);
      }
    };
    updateW();
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect && entry.contentRect.width > 0) {
          setW(entry.contentRect.width);
        }
      }
    });
    ro.observe(stageRef.current);
    return () => ro.disconnect();
  }, []);

  // IntersectionObserver for autoplay pause when off-screen
  useEffect(() => {
    if (!stageRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        isInViewRef.current = entry.isIntersecting;
      },
      { threshold: 0.1 }
    );
    observer.observe(stageRef.current);
    return () => observer.disconnect();
  }, []);

  // Drag interaction with snap
  const onPointerDown = (e) => {
    if (isMobile || reduce) return;
    stopAnimation();
    const rect = stageRef.current.getBoundingClientRect();
    const H = (W * 300) / 360;
    const stageCx = rect.left + 0.59 * W;
    const stageCy = rect.top + 0.5 * H;
    const initialAngle = Math.atan2(e.clientY - stageCy, e.clientX - stageCx);

    dragState.current = {
      stageCx,
      stageCy,
      lastAngle: initialAngle,
      startX: e.clientX,
      startY: e.clientY,
      pointerId: e.pointerId,
    };
    hasMovedRef.current = false;
  };

  useEffect(() => {
    const handlePointerMove = (e) => {
      if (!dragState.current) return;
      const { startX, startY, stageCx, stageCy, lastAngle } = dragState.current;
      const distMoved = Math.hypot(e.clientX - startX, e.clientY - startY);
      if (!hasMovedRef.current && distMoved < 6) return;

      if (!hasMovedRef.current) {
        hasMovedRef.current = true;
        setIsDragging(true);
        isDraggingRef.current = true;
        if (stageRef.current?.setPointerCapture && dragState.current.pointerId !== undefined) {
          try {
            stageRef.current.setPointerCapture(dragState.current.pointerId);
          } catch (_) {}
        }
      }

      const currentAngle = Math.atan2(e.clientY - stageCy, e.clientX - stageCx);
      const dDeg = wrap(((currentAngle - lastAngle) * 180) / Math.PI);
      R.set(R.get() + dDeg);
      dragState.current.lastAngle = currentAngle;

      const curR = R.get();
      let best = 0;
      let minD = Infinity;
      for (let i = 0; i < N; i++) {
        const d = dist(i, curR);
        if (d < minD) {
          minD = d;
          best = i;
        }
      }
      setActive(best);
      activeRef.current = best;
      onChange?.(best);
    };

    const handlePointerUp = () => {
      if (!dragState.current) return;
      const wasMoved = hasMovedRef.current;
      dragState.current = null;
      setIsDragging(false);
      isDraggingRef.current = false;

      if (wasMoved) {
        const curR = R.get();
        let best = 0;
        let minD = Infinity;
        for (let i = 0; i < N; i++) {
          const d = dist(i, curR);
          if (d < minD) {
            minD = d;
            best = i;
          }
        }
        setActive(best);
        activeRef.current = best;
        onChange?.(best);
        stopAnimation();

        const delta = wrap(-best * STEP - curR);
        const targetR = curR + delta;
        if (reduce) {
          R.set(targetR);
        } else {
          animRef.current = animate(R, targetR, {
            duration: 0.42,
            ease: SINE,
          });
        }
        setTimeout(() => {
          hasMovedRef.current = false;
        }, 50);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [W, isMobile, onChange, reduce, R, stopAnimation]);

  // Autoplay (5s cycle, pauses on hover, drag, hidden tab, or off-screen)
  useEffect(() => {
    if (reduce) return;
    const interval = setInterval(() => {
      if (
        !isHoveredRef.current &&
        !isDraggingRef.current &&
        isInViewRef.current &&
        !document.hidden
      ) {
        const next = (activeRef.current + 1) % N;
        activate(next);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [reduce, activate]);

  // Keyboard navigation (Arrow keys)
  const handleKeyDown = (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      activate((active + 1) % N);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      activate((active + N - 1) % N);
    }
  };

  return (
    <div
      ref={stageRef}
      tabIndex={0}
      role="region"
      aria-label="Personas. Click, drag or use arrow keys"
      onKeyDown={handleKeyDown}
      onPointerDown={onPointerDown}
      onPointerEnter={() => {
        setIsHovered(true);
        isHoveredRef.current = true;
      }}
      onPointerLeave={() => {
        setIsHovered(false);
        isHoveredRef.current = false;
      }}
      style={{ touchAction: 'pan-y' }}
      className="w-full relative focus:outline-none"
    >
      {isMobile ? (
        <div className="flex flex-col gap-3.5 w-full">
          {/* Mobile Photo with Redington slide-in */}
          <div
            className="relative w-full aspect-[1.15] overflow-hidden"
            style={{ filter: 'drop-shadow(0 20px 35px rgba(29, 82, 143, 0.16))' }}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={active}
                initial={{ x: -80, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.12 } }}
                transition={{
                  duration: 0.75,
                  ease: SINE,
                }}
                className="w-full h-full overflow-hidden bg-[#0B1528]"
                style={{ clipPath: 'url(#hexFlatRounded)' }}
              >
                <img
                  src={PERSONAS[active].img}
                  alt={PERSONAS[active].t}
                  style={{ objectPosition: PERSONAS[active].pos || 'center' }}
                  className="w-full h-full object-cover select-none pointer-events-none"
                />
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: 'linear-gradient(180deg, transparent 55%, rgba(11, 21, 40, 0.35))',
                  }}
                />
              </motion.div>
            </AnimatePresence>
          </div>

          {/* 4-column row of hex tabs */}
          <div className="grid grid-cols-4 gap-2">
            {PERSONAS.map((persona, i) => {
              const isActive = active === i;
              return (
                <button
                  key={persona.t}
                  type="button"
                  onClick={() => {
                    if (isActive) {
                      onExplore?.(i, persona);
                    } else {
                      activate(i);
                    }
                  }}
                  aria-label={isActive ? `${persona.t} - Explore` : persona.t}
                  aria-current={isActive}
                  className="relative w-full aspect-[70/78] border-0 bg-transparent p-0 cursor-pointer focus:outline-none"
                  style={{ filter: 'drop-shadow(0 6px 12px rgba(15, 23, 42, 0.10))' }}
                >
                  <div
                    className={`relative w-full h-full flex flex-col items-center justify-center text-center px-1 transition-colors duration-200 ${
                      isActive
                        ? 'bg-gradient-to-br from-[#1D528F] to-[#0B1528] text-white'
                        : 'bg-white text-[#0F172A] hover:bg-slate-50'
                    }`}
                    style={{ clipPath: 'url(#hexPointyRounded)' }}
                  >
                    <b
                      className={`text-[11px] font-bold leading-tight ${
                        isActive ? 'text-white' : 'text-[#0F172A]'
                      }`}
                    >
                      {persona.t}
                    </b>
                    <small
                      className={`text-[9px] leading-tight ${
                        isActive ? 'text-amber-300 font-semibold underline' : 'text-slate-500'
                      }`}
                    >
                      {isActive ? 'Explore →' : persona.s}
                    </small>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div
          className={`relative w-full max-w-[600px] aspect-[360/300] mx-auto select-none outline-none ${
            isDragging ? 'cursor-grabbing' : 'cursor-grab'
          }`}
        >
          {/* Faint decorative background hexagons */}
          <div
            className="absolute -left-[6%] top-[15%] w-[58%] h-[82%] bg-[#1d528f]/[0.035] pointer-events-none"
            style={{ clipPath: 'url(#hexFlatRounded)' }}
          />
          <div
            className="absolute left-[60%] -top-[4%] w-[44%] h-[104%] bg-[#1d528f]/[0.03] pointer-events-none"
            style={{ clipPath: 'url(#hexPointyRounded)' }}
          />

          {/* Big Hex Photo (Redington Motion: slides right 100px -> 0 and fades in over 950ms sine in-out) */}
          <div
            className="absolute -left-[3%] top-[9%] w-[72%] h-[82%] z-0"
            style={{ filter: 'drop-shadow(0 20px 35px rgba(29, 82, 143, 0.16))' }}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={active}
                initial={{ x: -100, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.12 } }}
                transition={{
                  duration: 0.95, // 950 ms slide-in, finishing ~350ms after 600ms wheel stop
                  ease: SINE,
                }}
                className="w-full h-full overflow-hidden bg-[#0B1528]"
                style={{ clipPath: 'url(#hexFlatRounded)' }}
              >
                <img
                  src={PERSONAS[active].img}
                  alt={PERSONAS[active].t}
                  style={{ objectPosition: PERSONAS[active].pos || 'center' }}
                  className="w-full h-full object-cover select-none pointer-events-none"
                />
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: 'linear-gradient(180deg, transparent 55%, rgba(11, 21, 40, 0.35))',
                  }}
                />
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Dashed guide circle */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-[1]" aria-hidden="true">
            <circle
              cx={0.59 * W}
              cy={0.5 * ((W * 300) / 360)}
              r={0.29 * W}
              fill="none"
              stroke="rgba(29, 82, 143, 0.16)"
              strokeWidth="1"
              strokeDasharray="4 6"
            />
          </svg>

          {/* 4 Nodes (Active node grows immediately to 34% W, inactive shrinks to 20% W, rotates in 600ms) */}
          {PERSONAS.map((persona, i) => (
            <OrbitNode
              key={persona.t}
              i={i}
              R={R}
              W={W}
              active={active}
              onSelect={() => activate(i)}
              persona={persona}
              hasMovedRef={hasMovedRef}
              onExplore={onExplore}
            />
          ))}

          {/* Hint */}
          <span className="absolute right-0 -bottom-7 font-['Poppins'] font-medium text-[11px] tracking-[0.6px] text-slate-400 select-none pointer-events-none">
            Click or drag the wheel
          </span>
        </div>
      )}
    </div>
  );
}
