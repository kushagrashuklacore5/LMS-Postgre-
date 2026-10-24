import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight } from "lucide-react";

import solStudent from "../assets/sol_student.jpg";
import solMentor from "../assets/sol_mentor.jpg";
import solAdmin from "../assets/sol_admin.jpg";
import solStorekeeper from "../assets/sol_storekeeper.jpg";
import solAccountant from "../assets/sol_accountant.jpg";

const solutions = [
  {
    id: "student",
    label: "Student Portal",
    image: solStudent,
    title: "Student Learning Portal",
    description:
      "Self-paced courses, real-time progress tracking, assignment submissions, and auto-generated verifiable completion certificates.",
    href: "#showcase",
  },
  {
    id: "mentor",
    label: "Mentor / Faculty",
    image: solMentor,
    title: "Mentor & Faculty Suite",
    description:
      "Build courses, manage classrooms, track individual performance analytics, and broadcast live announcements to students.",
    href: "#showcase",
  },
  {
    id: "admin",
    label: "Administration",
    image: solAdmin,
    title: "Enterprise Administration",
    description:
      "Approve applications, manage user roles, enforce security policies, and export operational audit logs.",
    href: "#showcase",
  },
  {
    id: "storekeeper",
    label: "Campus Inventory",
    image: solStorekeeper,
    title: "Campus Inventory & Labs",
    description:
      "Digital equipment requisitions, real-time lab inventory, barcode asset management, and automated low-stock alerts.",
    href: "#features",
  },
  {
    id: "accountant",
    label: "Finance & Fees",
    image: solAccountant,
    title: "Finance & Fee Management",
    description:
      "Tuition fee collection, real-time payment dashboards, automated invoice generation, and comprehensive financial reporting.",
    href: "#features",
  },
];

/* ─── SVG-based satellite hex ─── */
function SatHex({ sol, active, onSelect, w = 160, h = 178, style = {} }) {
  const isActive = active === sol.id;
  const pts = `${w * 0.25},0 ${w * 0.75},0 ${w},${h * 0.5} ${w * 0.75},${h} ${w * 0.25},${h} 0,${h * 0.5}`;
  return (
    <div
      onClick={() => onSelect(sol.id)}
      style={{ position: "absolute", width: w, height: h, cursor: "pointer", userSelect: "none", zIndex: 3, ...style }}
    >
      <svg width={w} height={h} style={{ position: "absolute", inset: 0 }}>
        <polygon
          points={pts}
          fill={isActive ? "rgba(245,158,11,0.10)" : "rgba(255,255,255,0.72)"}
          stroke={isActive ? "#F59E0B" : "#CBD5E1"}
          strokeWidth={isActive ? 2 : 1.5}
          style={{ transition: "all 0.35s" }}
        />
      </svg>
      <div
        style={{
          position: "absolute", inset: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 13, fontWeight: 700, textAlign: "center", padding: "0 18px",
          color: isActive ? "#F59E0B" : "#64748B",
          lineHeight: 1.4,
          transition: "color 0.35s",
        }}
      >
        {sol.label}
      </div>
    </div>
  );
}

export default function HexSolutions() {
  const [active, setActive] = useState("student");
  const current = solutions.find((s) => s.id === active);

  /* auto-rotate */
  useEffect(() => {
    const ids = solutions.map((s) => s.id);
    const t = setInterval(
      () => setActive((p) => ids[(ids.indexOf(p) + 1) % ids.length]),
      5000
    );
    return () => clearInterval(t);
  }, []);

  /* ── Center hex dimensions ── */
  const CW = 420, CH = 470;
  /* clipPath via objectBoundingBox */
  const clipId = "c5HexClip";

  /* ── Layout canvas for desktop: 940 × 530 ── */
  /* Satellite positions (left, top, w, h) */
  const sats = [
    /* top    */ { sol: solutions[0], left: 500, top: 10,  w: 155, h: 173 },
    /* middle */ { sol: solutions[1], left: 620, top: 170, w: 175, h: 195 },
    /* bottom */ { sol: solutions[2], left: 500, top: 336, w: 155, h: 173 },
  ];

  /* SVG line endpoints (from center right edge to sat left edge) */
  /* Center hex right vertex = (CW, CH/2+centerTop) – we anchor center hex at top:30 */
  const centerTop = 30;
  const lines = [
    { x1: CW * 0.75, y1: centerTop + 0,          x2: sats[0].left,              y2: sats[0].top + sats[0].h * 0.5 },
    { x1: CW,        y1: centerTop + CH * 0.5,    x2: sats[1].left,              y2: sats[1].top + sats[1].h * 0.5 },
    { x1: CW * 0.75, y1: centerTop + CH,          x2: sats[2].left,              y2: sats[2].top + sats[2].h * 0.5 },
  ];

  return (
    <section
      id="solutions"
      style={{ background: "linear-gradient(160deg,#EDF0F6 0%,#E8EEF5 100%)", padding: "88px 0 72px" }}
    >
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 40px" }}>

        {/* ── Header ── */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          style={{ textAlign: "center", marginBottom: 64 }}
        >
          <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.26em", textTransform: "uppercase", color: "#F59E0B", marginBottom: 14 }}>
            Our Solutions
          </p>
          <h2 style={{ fontSize: 44, fontWeight: 800, color: "#0F172A", lineHeight: 1.18, margin: 0 }}>
            One Platform, Every Role.
          </h2>
          <p style={{ fontSize: 17, color: "#64748B", marginTop: 18, maxWidth: 520, marginLeft: "auto", marginRight: "auto" }}>
            Purpose-built portals for every stakeholder in your institution — from students to finance.
          </p>
        </motion.div>

        {/* ── Desktop layout ── */}
        <div className="hidden lg:flex" style={{ justifyContent: "center" }}>
          <div style={{ position: "relative", width: 940, height: 530 }}>

            {/* Invisible SVG clip def */}
            <svg width="0" height="0" style={{ position: "absolute" }}>
              <defs>
                <clipPath id={clipId} clipPathUnits="objectBoundingBox">
                  <polygon points="0.25,0 0.75,0 1,0.5 0.75,1 0.25,1 0,0.5" />
                </clipPath>
              </defs>
            </svg>

            {/* Connector lines */}
            <svg
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 1 }}
              overflow="visible"
            >
              {lines.map((l, i) => (
                <line
                  key={i}
                  x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
                  stroke="#CBD5E1" strokeWidth="1.5" strokeDasharray="6 5"
                />
              ))}
              {/* Small circle at junction points */}
              {lines.map((l, i) => (
                <circle key={"c" + i} cx={l.x2} cy={l.y2} r="3.5" fill="#CBD5E1" />
              ))}
            </svg>

            {/* ── CENTER HEXAGON ── */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7 }}
              style={{
                position: "absolute", left: 0, top: centerTop,
                width: CW, height: CH,
                clipPath: `url(#${clipId})`,
                zIndex: 2,
                overflow: "hidden",
              }}
            >
              {/* Image */}
              <AnimatePresence mode="wait">
                <motion.img
                  key={active + "_img"}
                  src={current.image}
                  alt={current.title}
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                  initial={{ opacity: 0, scale: 1.06 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5 }}
                />
              </AnimatePresence>

              {/* Dark overlay - bottom portion */}
              <div
                style={{
                  position: "absolute", inset: 0,
                  background: "linear-gradient(to top, rgba(11,21,40,0.98) 0%, rgba(11,21,40,0.72) 38%, rgba(11,21,40,0.08) 65%, transparent 100%)",
                }}
              />

              {/* Text content overlay */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={active + "_text"}
                  style={{
                    position: "absolute", bottom: 56, left: 32, right: 32,
                    textAlign: "center",
                  }}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.38, delay: 0.1 }}
                >
                  <h3 style={{ color: "#fff", fontWeight: 800, fontSize: 17, margin: "0 0 10px", lineHeight: 1.3 }}>
                    {current.title}
                  </h3>
                  <p style={{ color: "#94A3B8", fontSize: 12.5, lineHeight: 1.75, margin: "0 0 18px" }}>
                    {current.description}
                  </p>
                  <a
                    href={current.href}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 7,
                      padding: "9px 22px",
                      background: "transparent",
                      border: "1.5px solid rgba(255,255,255,0.55)",
                      borderRadius: 999,
                      color: "#fff", fontSize: 12, fontWeight: 700,
                      textDecoration: "none",
                      transition: "all 0.25s",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = "#F59E0B"; e.currentTarget.style.borderColor = "#F59E0B"; e.currentTarget.style.color = "#0B1528"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.55)"; e.currentTarget.style.color = "#fff"; }}
                  >
                    Explore More <ArrowRight size={13} />
                  </a>
                </motion.div>
              </AnimatePresence>
            </motion.div>

            {/* ── SATELLITE HEXES ── */}
            {sats.map(({ sol, left, top, w, h }) => (
              <SatHex
                key={sol.id}
                sol={sol}
                active={active}
                onSelect={setActive}
                w={w}
                h={h}
                style={{ left, top }}
              />
            ))}
          </div>
        </div>

        {/* ── MOBILE layout ── */}
        <div className="flex lg:hidden flex-col items-center gap-6">
          {/* Mobile center hex */}
          <div style={{ position: "relative", width: 280, height: 312 }}>
            <svg width="0" height="0" style={{ position: "absolute" }}>
              <defs>
                <clipPath id="c5HexClipMob" clipPathUnits="objectBoundingBox">
                  <polygon points="0.25,0 0.75,0 1,0.5 0.75,1 0.25,1 0,0.5" />
                </clipPath>
              </defs>
            </svg>
            <div
              style={{
                position: "absolute", inset: 0,
                clipPath: "url(#c5HexClipMob)",
                overflow: "hidden",
              }}
            >
              <AnimatePresence mode="wait">
                <motion.img
                  key={active + "_mob"}
                  src={current.image}
                  alt={current.title}
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4 }}
                />
              </AnimatePresence>
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(11,21,40,0.95) 0%, rgba(11,21,40,0.5) 50%, transparent 100%)" }} />
              <div style={{ position: "absolute", bottom: 30, left: 20, right: 20, textAlign: "center" }}>
                <h3 style={{ color: "#fff", fontWeight: 700, fontSize: 14, margin: "0 0 6px" }}>{current.title}</h3>
                <p style={{ color: "#94A3B8", fontSize: 11, lineHeight: 1.6, margin: 0 }}>{current.description}</p>
              </div>
            </div>
          </div>

          {/* Mobile pill nav */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
            {solutions.map((sol) => (
              <button
                key={sol.id}
                onClick={() => setActive(sol.id)}
                style={{
                  padding: "7px 16px", fontSize: 11, fontWeight: 700, cursor: "pointer",
                  borderRadius: 999,
                  background: active === sol.id ? "#F59E0B" : "rgba(255,255,255,0.7)",
                  color: active === sol.id ? "#0B1528" : "#64748B",
                  border: `1.5px solid ${active === sol.id ? "#F59E0B" : "#CBD5E1"}`,
                  transition: "all 0.3s",
                }}
              >
                {sol.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Nav dots + labels row (all 5 solutions) ── */}
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 28, marginTop: 52 }}>
          {solutions.map((sol) => (
            <button
              key={sol.id}
              onClick={() => setActive(sol.id)}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                background: "none", border: "none", cursor: "pointer", padding: 0,
              }}
            >
              <div
                style={{
                  width: active === sol.id ? 32 : 8,
                  height: 8, borderRadius: 4,
                  background: active === sol.id ? "#F59E0B" : "#CBD5E1",
                  transition: "all 0.4s ease",
                }}
              />
              <span style={{ fontSize: 11, fontWeight: 600, color: active === sol.id ? "#F59E0B" : "#94A3B8", transition: "color 0.3s" }}>
                {sol.label}
              </span>
            </button>
          ))}
        </div>

      </div>
    </section>
  );
}
