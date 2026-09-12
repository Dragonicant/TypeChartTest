import React, { useState, useMemo } from "react";

// ============================================================
// DATA — pulled from the real game data, not approximated.
// Each class's own 3 affinities form a closed triangle among
// themselves, AND each affinity has exactly one cross-class
// target it beats. That symmetry is what makes the nested-
// triangle layout below possible.
// ============================================================
const CLASSES = {
  Magic: { affinities: ["Water", "Fire", "Nature"], beatsClass: "Melee" },
  Melee: { affinities: ["Slash", "Stab", "Smash"], beatsClass: "Ranged" },
  Ranged: { affinities: ["Bow", "HeavyCrossbow", "LightCrossbow"], beatsClass: "Magic" },
};

// What beats each class -- the inverse of CLASSES[x].beatsClass, derived the same way WEAKNESS
// is derived from BEATS below, so it can't drift out of sync with the source of truth either.
const CLASS_WEAKNESS = {};
for (const [attacker, data] of Object.entries(CLASSES)) {
  CLASS_WEAKNESS[data.beatsClass] = attacker;
}

// Each affinity's one in-class target (completes its class's own triangle) and one cross-class target.
const BEATS = {
  Water: { inClass: "Fire", crossClass: "Slash" },
  Fire: { inClass: "Nature", crossClass: "Stab" },
  Nature: { inClass: "Water", crossClass: "Smash" },
  Slash: { inClass: "Stab", crossClass: "HeavyCrossbow" },
  Stab: { inClass: "Smash", crossClass: "LightCrossbow" },
  Smash: { inClass: "Slash", crossClass: "Bow" },
  Bow: { inClass: "HeavyCrossbow", crossClass: "Nature" },
  HeavyCrossbow: { inClass: "LightCrossbow", crossClass: "Water" },
  LightCrossbow: { inClass: "Bow", crossClass: "Fire" },
};

// What beats each affinity -- the inverse of BEATS, derived rather than hand-written so it can
// never drift out of sync with it. Genuinely distinct from BEATS, not just BEATS read backwards:
// e.g. Water beats {Fire, Slash} but is itself beaten by {Nature, HeavyCrossbow} -- four
// different affinities, confirmed before writing this rather than assumed.
const WEAKNESS = {};
for (const [attacker, targets] of Object.entries(BEATS)) {
  WEAKNESS[targets.inClass] = { ...WEAKNESS[targets.inClass], inClass: attacker };
  WEAKNESS[targets.crossClass] = { ...WEAKNESS[targets.crossClass], crossClass: attacker };
}

const DEFAULT_AFFINITY_COLOR = {
  Water: "#38BDF8", Fire: "#FFD23C", Nature: "#34D399",
  Slash: "#F87171", Stab: "#FB923C", Smash: "#FF6EC7",
  Bow: "#B5E23C", HeavyCrossbow: "#64748B", LightCrossbow: "#C4B5FD",
};
const WARK_COLOR = "#94A3B8";
// Hue sampled directly from the reference screenshot's book icons, not eyeballed. Melee needed a
// second look: the image actually has two distinct reds -- a muted dark one (RGB 53,25,32,
// appearing on 3 of the 4 red books) and a genuinely brighter one (RGB 150,45,51, on the axe
// icon specifically). Re-sampled from the correct bright book, then brightened all three for
// text legibility and verified with real perceptual distance (CIELAB Delta-E) against every
// affinity color, the UI's amber accent, and each other. Now editable live via the color pickers
// below -- these are just the defaults the "Reset" button returns to.
const DEFAULT_CLASS_COLORS = { Melee: "#F42531", Magic: "#A345F7", Ranged: "#76C6A7" };

const affinityOfClass = (cls) => CLASSES[cls]?.affinities || [];
const classOfAffinity = (aff) => Object.keys(CLASSES).find((c) => CLASSES[c].affinities.includes(aff));

const CLASS_ANGLES = { Magic: -90, Melee: 30, Ranged: 150 }; // degrees, 0 = right, going clockwise
const AFF_ANGLES = [-90, 30, 150]; // same 3 relative angles inside every cluster, so the small
// triangles read as the same shape as the big one, just at a different scale.

function polar(cx, cy, r, deg) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(x1, y1, x2, y2, bend = 22, r1 = 0, r2 = 0) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const cx = mx + nx * bend, cy = my + ny * bend;

  // Trim each endpoint to the edge of its own circle, moving toward the control point rather
  // than toward the other node's center -- that's the curve's real tangent direction at each
  // end, so the trim lands correctly even on a heavily bent arc, not just a straight line.
  function trimToward(px, py, r) {
    if (!r) return { x: px, y: py };
    const tdx = cx - px, tdy = cy - py;
    const tlen = Math.hypot(tdx, tdy) || 1;
    return { x: px + (tdx / tlen) * r, y: py + (tdy / tlen) * r };
  }
  const start = trimToward(x1, y1, r1);
  const end = trimToward(x2, y2, r2);
  return `M ${start.x} ${start.y} Q ${cx} ${cy} ${end.x} ${end.y}`;
}

function Slider({ label, value, onChange, min, max, step = 1 }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.76rem", color: "#94a3b8", marginBottom: 3 }}>
        <span>{label}</span>
        <span style={{ color: "#e2e8f0", fontVariantNumeric: "tabular-nums" }}>{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%" }}
      />
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <p style={{ fontSize: "0.72rem", color: "#64748b", margin: "16px 0 10px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
      {children}
    </p>
  );
}

// Every tunable value's default, in one place, so "Reset" can return to it exactly and so each
// slider's starting point is defined only once rather than duplicated between useState calls
// and a separate reset handler.
const DEFAULTS = {
  nodeSize: 56,
  clusterR: 275,
  nodeR: 125,
  classArrowBendRatio: 0.28, // multiplied by clusterR -- see the note further down on why this scales rather than staying fixed
  inClassBend: 10,
  crossClassBendRatio: 0.13, // multiplied by the actual distance between the two connected points -- see the note near its usage for why this can't be a fixed absolute number
  classLabelClearance: 28,
  arrowClearance: 4,
  fontScaleRatio: 0.24,
  nodeStrokeWidth: 1.5,
  activeStrokeWidth: 3,
  dimmedOpacity: 0.3,
  svgMaxWidth: 1120,
  warkScaleMult: 2.8,
  warkPeakWidth: 0.9,
  warkPeakHeight: 0.9,
  warkDipBend: 0.45,
  warkSideBend: 1.1,
  warkBottomDist: 1.3,
  warkStrokeWidth: 2,
  warkOpacity: 0.85,
};

// Human-readable labels for the delta report, matching each slider's own UI text exactly so the
// report reads the same way the panel does.
const SLIDER_LABELS = {
  nodeSize: "Circle size",
  clusterR: "Cluster spacing (from center)",
  nodeR: "Affinity spacing (within a cluster)",
  svgMaxWidth: "Diagram display size",
  classArrowBendRatio: "Class arrow bend (x cluster spacing)",
  inClassBend: "In-class arrow bend",
  crossClassBendRatio: "Cross-class arrow bend (x distance)",
  classLabelClearance: "Class label clearance",
  arrowClearance: "Arrowhead clearance",
  fontScaleRatio: "Affinity label font scale",
  nodeStrokeWidth: "Node border width",
  activeStrokeWidth: "Active border width",
  dimmedOpacity: "Dimmed opacity",
  warkScaleMult: "Wark badge scale",
  warkPeakWidth: "Wark badge peak width",
  warkPeakHeight: "Wark badge peak height",
  warkDipBend: "Wark badge dip bend",
  warkSideBend: "Wark badge side sweep bend",
  warkBottomDist: "Wark badge bottom point distance",
  warkStrokeWidth: "Wark badge stroke width",
  warkOpacity: "Wark badge opacity",
};

export default function TypeChart() {
  const [hovered, setHovered] = useState(null);
  const [selected, setSelected] = useState(null);
  // Class-level relationships only show on class hover now, not affinity hover -- separate
  // state from the affinity/Wark hover above rather than overloading it.
  const [hoveredClass, setHoveredClass] = useState(null);
  const [selectedClass, setSelectedClass] = useState(null);
  const activeClass = hoveredClass || selectedClass;
  // While a class is being hovered/selected, suppress the affinity display rather than let both
  // render at once (confusing: a stale affinity selection sitting underneath a class hover with
  // no visual relationship to it). This only affects what's SHOWN, not the underlying state --
  // clicking Water then mousing over a class and back off it still finds Water selected,
  // because `selected` itself was never touched, just the rendering priority.
  const active = activeClass ? null : (hovered || selected);

  const [nodeSize, setNodeSize] = useState(DEFAULTS.nodeSize);
  const [clusterR, setClusterR] = useState(DEFAULTS.clusterR);
  const [nodeR, setNodeR] = useState(DEFAULTS.nodeR);
  const [classArrowBendRatio, setClassArrowBendRatio] = useState(DEFAULTS.classArrowBendRatio);
  const [inClassBend, setInClassBend] = useState(DEFAULTS.inClassBend);
  const [crossClassBendRatio, setCrossClassBendRatio] = useState(DEFAULTS.crossClassBendRatio);
  const [classLabelClearance, setClassLabelClearance] = useState(DEFAULTS.classLabelClearance);
  const [arrowClearance, setArrowClearance] = useState(DEFAULTS.arrowClearance);
  const [fontScaleRatio, setFontScaleRatio] = useState(DEFAULTS.fontScaleRatio);
  const [nodeStrokeWidth, setNodeStrokeWidth] = useState(DEFAULTS.nodeStrokeWidth);
  const [activeStrokeWidth, setActiveStrokeWidth] = useState(DEFAULTS.activeStrokeWidth);
  const [dimmedOpacity, setDimmedOpacity] = useState(DEFAULTS.dimmedOpacity);
  const [svgMaxWidth, setSvgMaxWidth] = useState(DEFAULTS.svgMaxWidth);
  const [warkScaleMult, setWarkScaleMult] = useState(DEFAULTS.warkScaleMult);
  const [warkPeakWidth, setWarkPeakWidth] = useState(DEFAULTS.warkPeakWidth);
  const [warkPeakHeight, setWarkPeakHeight] = useState(DEFAULTS.warkPeakHeight);
  const [warkDipBend, setWarkDipBend] = useState(DEFAULTS.warkDipBend);
  const [warkSideBend, setWarkSideBend] = useState(DEFAULTS.warkSideBend);
  const [warkBottomDist, setWarkBottomDist] = useState(DEFAULTS.warkBottomDist);
  const [warkStrokeWidth, setWarkStrokeWidth] = useState(DEFAULTS.warkStrokeWidth);
  const [warkOpacity, setWarkOpacity] = useState(DEFAULTS.warkOpacity);
  const [classColors, setClassColors] = useState(DEFAULT_CLASS_COLORS);
  const [affinityColors, setAffinityColors] = useState(DEFAULT_AFFINITY_COLOR);

  function resetToDefaults() {
    setNodeSize(DEFAULTS.nodeSize);
    setClusterR(DEFAULTS.clusterR);
    setNodeR(DEFAULTS.nodeR);
    setClassArrowBendRatio(DEFAULTS.classArrowBendRatio);
    setInClassBend(DEFAULTS.inClassBend);
    setCrossClassBendRatio(DEFAULTS.crossClassBendRatio);
    setClassLabelClearance(DEFAULTS.classLabelClearance);
    setArrowClearance(DEFAULTS.arrowClearance);
    setFontScaleRatio(DEFAULTS.fontScaleRatio);
    setNodeStrokeWidth(DEFAULTS.nodeStrokeWidth);
    setActiveStrokeWidth(DEFAULTS.activeStrokeWidth);
    setDimmedOpacity(DEFAULTS.dimmedOpacity);
    setSvgMaxWidth(DEFAULTS.svgMaxWidth);
    setWarkScaleMult(DEFAULTS.warkScaleMult);
    setWarkPeakWidth(DEFAULTS.warkPeakWidth);
    setWarkPeakHeight(DEFAULTS.warkPeakHeight);
    setWarkDipBend(DEFAULTS.warkDipBend);
    setWarkSideBend(DEFAULTS.warkSideBend);
    setWarkBottomDist(DEFAULTS.warkBottomDist);
    setWarkStrokeWidth(DEFAULTS.warkStrokeWidth);
    setWarkOpacity(DEFAULTS.warkOpacity);
    setClassColors(DEFAULT_CLASS_COLORS);
    setAffinityColors(DEFAULT_AFFINITY_COLOR);
  }

  // Compares every current value against its default and packages only what's actually
  // different into a downloadable file -- not a full settings dump, specifically the delta, so
  // reading it back later tells you exactly what was customized without having to diff it
  // against the defaults yourself.
  function downloadDeltaReport() {
    const current = {
      nodeSize, clusterR, nodeR, classArrowBendRatio, inClassBend, crossClassBendRatio,
      classLabelClearance, arrowClearance, fontScaleRatio, nodeStrokeWidth,
      activeStrokeWidth, dimmedOpacity, svgMaxWidth, warkScaleMult, warkPeakWidth,
      warkPeakHeight, warkDipBend, warkSideBend, warkBottomDist, warkStrokeWidth, warkOpacity,
    };

    const changedSliders = {};
    for (const key of Object.keys(DEFAULTS)) {
      const def = DEFAULTS[key], cur = current[key];
      if (Math.abs(def - cur) > 1e-9) {
        changedSliders[SLIDER_LABELS[key] || key] = { default: def, current: cur };
      }
    }

    const changedClassColors = {};
    for (const cls of Object.keys(DEFAULT_CLASS_COLORS)) {
      if (classColors[cls].toLowerCase() !== DEFAULT_CLASS_COLORS[cls].toLowerCase()) {
        changedClassColors[cls] = { default: DEFAULT_CLASS_COLORS[cls], current: classColors[cls] };
      }
    }

    const changedAffinityColors = {};
    for (const aff of Object.keys(DEFAULT_AFFINITY_COLOR)) {
      if (affinityColors[aff].toLowerCase() !== DEFAULT_AFFINITY_COLOR[aff].toLowerCase()) {
        changedAffinityColors[aff] = { default: DEFAULT_AFFINITY_COLOR[aff], current: affinityColors[aff] };
      }
    }

    const totalChanges = Object.keys(changedSliders).length + Object.keys(changedClassColors).length + Object.keys(changedAffinityColors).length;

    const report = {
      generatedAt: new Date().toISOString(),
      totalChanges,
      sliders: changedSliders,
      classColors: changedClassColors,
      affinityColors: changedAffinityColors,
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `typechart-settings-delta-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // The dashed ring should sit exactly on the outer edge of the 3 affinity circles it
  // surrounds -- a node's own center is nodeR from the cluster center, and its farthest point
  // is another nodeSize past that, so nodeR + nodeSize (not an arbitrary fraction of it) is the
  // true edge. This way the ring always tracks both sliders correctly instead of approximating.
  const clusterBoundaryR = nodeR + nodeSize;

  // Curving these inward (not outward) is what lets a class arrow dodge the affinity nodes
  // sitting between two clusters. Scales with clusterR rather than a fixed pixel amount so the
  // dodge still clears at every slider setting.
  const classArrowBend = clusterR * classArrowBendRatio;
  // The SVG's internal coordinate system sizes itself to whatever the current sliders need, with
  // a little margin, so nothing clips at the extremes -- separate from svgMaxWidth below, which
  // only controls the on-screen DISPLAY size, not this internal layout math.
  const maxExtent = clusterR + nodeR + nodeSize + 24;
  const view = maxExtent * 2;
  const center = view / 2;

  function clusterCenter(cls) {
    return polar(center, center, clusterR, CLASS_ANGLES[cls]);
  }
  function affinityPos(cls) {
    const c = clusterCenter(cls);
    return affinityOfClass(cls).map((aff, i) => ({ aff, ...polar(c.x, c.y, nodeR, AFF_ANGLES[i]) }));
  }
  const allNodes = useMemo(
    () => Object.keys(CLASSES).flatMap((cls) => affinityPos(cls)),
    [clusterR, nodeR, view]
  );
  const nodeLookup = useMemo(() => Object.fromEntries(allNodes.map((n) => [n.aff, n])), [allNodes]);

  const relationships = useMemo(() => {
    if (!active || active === "Wark") return null;
    return BEATS[active];
  }, [active]);
  const weaknesses = useMemo(() => {
    if (!active || active === "Wark") return null;
    return WEAKNESS[active];
  }, [active]);

  return (
    <div style={{ background: "#020617", minHeight: "100vh", padding: "32px 16px", fontFamily: "ui-sans-serif, system-ui, sans-serif", color: "#e2e8f0" }}>
      {/* Resets the page-level defaults this component can't otherwise control: browsers apply a
          default margin to <body> (commonly 8px), which -- combined with this wrapper's 100vh
          height -- pushes the total page size just past the viewport, causing an unwanted
          scrollbar and leaving that default margin visible as a pale border around everything.
          Scoped here (not left to whatever page embeds this) so the fix travels with the
          component instead of depending on an external wrapper to remember it. */}
      <style>{`
        html, body { margin: 0; padding: 0; background: #020617; }
        * { box-sizing: border-box; }
      `}</style>
      <div style={{ maxWidth: 1520, margin: "0 auto" }}>
        <div style={{ display: "flex", gap: 28, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ width: "100%", maxWidth: svgMaxWidth, flexShrink: 0 }}>
            <h1 style={{ fontSize: "1.4rem", fontWeight: 600, color: "#fbbf24", marginBottom: 4, textAlign: "center" }}>Choose your fighter</h1>
            <p style={{ color: "#94a3b8", fontSize: "0.9rem", marginBottom: 24, textAlign: "center" }}>
              Three classes form a type triangle. Each is composed of three affinities with specific
              targets. Wark sits apart with no weaknesses or strengths.
            </p>
            <svg viewBox={`0 0 ${view} ${view}`} style={{ width: "100%" }}>
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="#475569" />
              </marker>
              <marker id="arrowStrength" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="#22C55E" />
              </marker>
              <marker id="arrowWeakness" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="#ef4444" />
              </marker>
            </defs>

            {/* Class-level cycle: Magic -> Melee -> Ranged -> Magic, always visible -- the big
                rule. Only responds to CLASS hover/select now, not affinity hover -- green for
                the class this one beats (its own outgoing arrow), red for the class that beats
                it (the incoming arrow, its weakness). */}
            {Object.entries(CLASSES).map(([cls, data]) => {
              const from = clusterCenter(cls), to = clusterCenter(data.beatsClass);
              const isStrengthLink = activeClass === cls;
              const isWeaknessLink = activeClass && data.beatsClass === activeClass;
              const highlighted = isStrengthLink || isWeaknessLink;
              const stroke = isWeaknessLink ? "#ef4444" : isStrengthLink ? "#22C55E" : "#334155";
              const marker = isWeaknessLink ? "url(#arrowWeakness)" : isStrengthLink ? "url(#arrowStrength)" : "url(#arrow)";
              return (
                <path
                  key={cls}
                  d={arcPath(from.x, from.y, to.x, to.y, classArrowBend, classLabelClearance, classLabelClearance + arrowClearance)}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={highlighted ? 2.5 : 1.5}
                  markerEnd={marker}
                  opacity={activeClass && !highlighted ? dimmedOpacity - 0.05 : 1}
                />
              );
            })}

            {/* Class cluster labels + boundary hint -- the label sits at the cluster's own center,
                inside the dashed ring, not out past it. Both the text and the dashed ring use the
                class's own color. This group is a hover/click target for the class-level
                relationships above -- affinity hover no longer touches these at all. */}
            {Object.keys(CLASSES).map((cls) => {
              const c = clusterCenter(cls);
              const dimmed = activeClass && activeClass !== cls;
              return (
                <g
                  key={cls}
                  opacity={dimmed ? dimmedOpacity + 0.05 : 1}
                  onMouseEnter={() => setHoveredClass(cls)}
                  onMouseLeave={() => setHoveredClass(null)}
                  onClick={() => setSelectedClass(selectedClass === cls ? null : cls)}
                  style={{ cursor: "pointer" }}
                >
                  <circle cx={c.x} cy={c.y} r={clusterBoundaryR} fill="none" stroke={classColors[cls]} strokeWidth={1} strokeDasharray="3 5" opacity={0.4} />
                  <text x={c.x} y={c.y + 5} textAnchor="middle" fontSize="15" fontWeight="600" fill={classColors[cls]}>{cls}</text>
                </g>
              );
            })}

            {/* Each class's own internal triangle (in-class beats), same shape as the big one,
                smaller scale. An arrow is red when it points INTO the active affinity (that
                source affinity beats it -- a weakness), amber when it's the active affinity's
                own outgoing strength. */}
            {Object.keys(CLASSES).map((cls) =>
              affinityPos(cls).map((n) => {
                const target = nodeLookup[BEATS[n.aff].inClass];
                const isActiveLink = active === n.aff;
                const isWeaknessLink = weaknesses && weaknesses.inClass === n.aff;
                const highlighted = isActiveLink || isWeaknessLink;
                const stroke = isWeaknessLink ? "#ef4444" : isActiveLink ? "#22C55E" : "#334155";
                const marker = isWeaknessLink ? "url(#arrowWeakness)" : isActiveLink ? "url(#arrowStrength)" : "url(#arrow)";
                return (
                  <path
                    key={n.aff + "-in"}
                    d={arcPath(n.x, n.y, target.x, target.y, inClassBend, nodeSize, nodeSize + arrowClearance)}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={highlighted ? 2.5 : 1.2}
                    markerEnd={marker}
                    opacity={active && !highlighted ? dimmedOpacity - 0.1 : 0.8}
                  />
                );
              })
            )}

            {/* Cross-class beats -- only drawn for the active affinity, to keep the resting state
                legible. The bend is computed from the ratio x the actual distance between these
                two specific points, not a fixed number -- the 9 cross-class pairs sit between
                259 and 693 units apart depending on which affinity is active (a 2.7x spread), so
                a single absolute bend looked proportionally very different pair to pair. A ratio
                self-adjusts to whichever pair is currently showing instead of needing 9
                individually-tuned values. */}
            {relationships && (() => {
              const p1 = nodeLookup[active], p2 = nodeLookup[relationships.crossClass];
              const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
              return (
                <path
                  d={arcPath(p1.x, p1.y, p2.x, p2.y, crossClassBendRatio * dist, nodeSize, nodeSize + arrowClearance)}
                  fill="none"
                  stroke="#22C55E"
                  strokeWidth={2.5}
                  strokeDasharray="1 0"
                  markerEnd="url(#arrowStrength)"
                />
              );
            })()}

            {/* Cross-class weakness -- the affinity that beats the active one, drawn the same way
                as the strength arrow above but in red and pointing the other direction. */}
            {weaknesses && weaknesses.crossClass && (() => {
              const p1 = nodeLookup[weaknesses.crossClass], p2 = nodeLookup[active];
              const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
              return (
                <path
                  d={arcPath(p1.x, p1.y, p2.x, p2.y, crossClassBendRatio * dist, nodeSize, nodeSize + arrowClearance)}
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth={2.5}
                  strokeDasharray="1 0"
                  markerEnd="url(#arrowWeakness)"
                />
              );
            })()}

            {/* Wark's badge -- only on hover/select. Built from 4 quadratic Bezier curves: two
                small "cup" curves forming a scalloped top (left peak -> dip -> tooth peak -> dip
                -> right peak, all three peaks at the same height), then two big outward-bulging
                curves sweeping down the sides to a single shared bottom point. */}
            {active === "Wark" && (() => {
              const S = nodeSize * warkScaleMult;
              function bulgeControl(p0, p1, bend) {
                const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
                const dx = p1[0] - p0[0], dy = p1[1] - p0[1], len = Math.hypot(dx, dy) || 1;
                return [mx + (-dy / len) * bend, my + (dx / len) * bend];
              }
              const leftPeak = [center - S * warkPeakWidth, center - S * warkPeakHeight];
              const toothPeak = [center, center - S * warkPeakHeight];
              const rightPeak = [center + S * warkPeakWidth, center - S * warkPeakHeight];
              const bottomPoint = [center, center + S * warkBottomDist];
              const c1 = bulgeControl(leftPeak, toothPeak, S * warkDipBend);
              const c2 = bulgeControl(toothPeak, rightPeak, S * warkDipBend);
              const c3 = bulgeControl(rightPeak, bottomPoint, -S * warkSideBend);
              const c4 = bulgeControl(bottomPoint, leftPeak, -S * warkSideBend);
              const shieldPath = `M ${leftPeak[0]} ${leftPeak[1]} Q ${c1[0]} ${c1[1]} ${toothPeak[0]} ${toothPeak[1]} Q ${c2[0]} ${c2[1]} ${rightPeak[0]} ${rightPeak[1]} Q ${c3[0]} ${c3[1]} ${bottomPoint[0]} ${bottomPoint[1]} Q ${c4[0]} ${c4[1]} ${leftPeak[0]} ${leftPeak[1]} Z`;
              return <path d={shieldPath} fill="none" stroke="#fbbf24" strokeWidth={warkStrokeWidth} opacity={warkOpacity} />;
            })()}

            {/* Wark -- dead center, deliberately disconnected: no arrows in or out */}
            <g
              onMouseEnter={() => setHovered("Wark")}
              onMouseLeave={() => setHovered(null)}
              onClick={() => setSelected(selected === "Wark" ? null : "Wark")}
              style={{ cursor: "pointer" }}
              opacity={active && active !== "Wark" ? dimmedOpacity : 1}
            >
              <circle cx={center} cy={center} r={nodeSize + 6} fill="none" stroke={WARK_COLOR} strokeWidth={1} strokeDasharray="2 4" />
              <circle cx={center} cy={center} r={nodeSize} fill="#0f172a" stroke={WARK_COLOR} strokeWidth={selected === "Wark" ? activeStrokeWidth : nodeStrokeWidth + 0.5} />
              <text x={center} y={center + 5} textAnchor="middle" fontSize="13" fontWeight="600" fill={WARK_COLOR}>Wark</text>
            </g>

            {/* Affinity nodes */}
            {allNodes.map((n) => {
              const color = affinityColors[n.aff];
              const isActive = active === n.aff;
              const isRelated = relationships && (n.aff === relationships.inClass || n.aff === relationships.crossClass);
              const dimmed = active && !isActive && !isRelated;
              // Text scales with the circle it's inside rather than staying a fixed size, with a
              // floor so it doesn't go illegible at the smallest end of the Circle size slider.
              const fontSize = Math.max(7, nodeSize * fontScaleRatio);
              return (
                <g
                  key={n.aff}
                  onMouseEnter={() => setHovered(n.aff)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => setSelected(selected === n.aff ? null : n.aff)}
                  style={{ cursor: "pointer" }}
                  opacity={dimmed ? dimmedOpacity : 1}
                >
                  <circle cx={n.x} cy={n.y} r={nodeSize} fill="#0f172a" stroke={color} strokeWidth={isActive || selected === n.aff ? activeStrokeWidth : nodeStrokeWidth} />
                  <text x={n.x} y={n.y + fontSize * 0.38} textAnchor="middle" fontSize={fontSize} fontWeight="600" fill={color}>{n.aff.length > 8 ? n.aff.replace("Crossbow", " Xbow") : n.aff}</text>
                </g>
              );
            })}
          </svg>
          </div>

          <div style={{ flex: 1, minWidth: 240, display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 10, padding: 18, minHeight: 220 }}>
              {!active && (
                <p style={{ color: "#94a3b8", fontSize: "0.88rem", lineHeight: 1.6 }}>
                  Hover any type to see what it's strong against. Click one to lock it in as your pick.
                </p>
              )}
              {active === "Wark" && (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <span style={{ width: 12, height: 12, borderRadius: "50%", background: WARK_COLOR }} />
                    <h2 style={{ fontSize: "1.05rem", fontWeight: 600, margin: 0 }}>Wark</h2>
                  </div>
                  <p style={{ color: "#cbd5e1", fontSize: "0.88rem", lineHeight: 1.6 }}>
                    Wark has no weaknesses and no resistances, disconnected from the affinity web.
                  </p>
                </>
              )}
              {active && active !== "Wark" && (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <span style={{ width: 12, height: 12, borderRadius: "50%", background: affinityColors[active] }} />
                    <h2 style={{ fontSize: "1.05rem", fontWeight: 600, margin: 0 }}>{active}</h2>
                    <span style={{ fontSize: "0.75rem", color: "#64748b" }}>{classOfAffinity(active)}</span>
                  </div>
                  <p style={{ color: "#cbd5e1", fontSize: "0.88rem", lineHeight: 1.6, marginBottom: 10 }}>
                    Strong against <strong style={{ color: affinityColors[BEATS[active].inClass] }}>{BEATS[active].inClass}</strong> and{" "}
                    <strong style={{ color: affinityColors[BEATS[active].crossClass] }}>{BEATS[active].crossClass}</strong>, dealing
                    double damage and taking half damage.
                  </p>
                  <p style={{ color: "#cbd5e1", fontSize: "0.88rem", lineHeight: 1.6, marginBottom: 10 }}>
                    Weak against <strong style={{ color: affinityColors[weaknesses.inClass] }}>{weaknesses.inClass}</strong> and{" "}
                    <strong style={{ color: affinityColors[weaknesses.crossClass] }}>{weaknesses.crossClass}</strong>, taking
                    double damage and dealing half damage.
                  </p>
                  <p style={{ color: "#cbd5e1", fontSize: "0.8rem", lineHeight: 1.5 }}>
                    As a <strong style={{ color: classColors[classOfAffinity(active)] }}>{classOfAffinity(active)}</strong> fighter,{" "}
                    <strong style={{ color: affinityColors[active] }}>{active}</strong> deals 25% more to
                    any <strong style={{ color: classColors[CLASSES[classOfAffinity(active)].beatsClass] }}>{CLASSES[classOfAffinity(active)].beatsClass}</strong> fighter
                    and takes 25% more damage from any{" "}
                    <strong style={{ color: classColors[CLASS_WEAKNESS[classOfAffinity(active)]] }}>{CLASS_WEAKNESS[classOfAffinity(active)]}</strong> fighter.
                  </p>
                </>
              )}
              {selected && (
                <button
                  onClick={() => setSelected(null)}
                  style={{ marginTop: 16, background: "none", border: "1px solid #475569", color: "#94a3b8", borderRadius: 6, padding: "6px 12px", fontSize: "0.78rem", cursor: "pointer" }}
                >
                  Clear selection
                </button>
              )}
            </div>

            <div style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 10, padding: 18, maxHeight: 640, overflowY: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <p style={{ fontSize: "0.72rem", color: "#64748b", margin: 0, textTransform: "uppercase", letterSpacing: "0.04em" }}>Layout (temporary, for tuning)</p>
                <button
                  onClick={resetToDefaults}
                  style={{ background: "none", border: "1px solid #475569", color: "#fbbf24", borderRadius: 6, padding: "4px 10px", fontSize: "0.72rem", cursor: "pointer" }}
                >
                  Reset to defaults
                </button>
              </div>

              <SectionLabel>Class colors</SectionLabel>
              {Object.keys(CLASSES).map((cls) => (
                <div key={cls} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <input
                    type="color"
                    value={classColors[cls]}
                    onChange={(e) => setClassColors({ ...classColors, [cls]: e.target.value })}
                    style={{ width: 32, height: 28, padding: 0, border: "1px solid #334155", borderRadius: 4, background: "none", cursor: "pointer" }}
                  />
                  <span style={{ fontSize: "0.82rem", color: "#cbd5e1", flex: 1 }}>{cls}</span>
                  <span style={{ fontSize: "0.72rem", color: "#64748b", fontVariantNumeric: "tabular-nums" }}>{classColors[cls].toUpperCase()}</span>
                </div>
              ))}

              <SectionLabel>Affinity colors</SectionLabel>
              {Object.keys(CLASSES).map((cls) => (
                <div key={cls} style={{ marginBottom: 6 }}>
                  <p style={{ fontSize: "0.68rem", color: "#475569", margin: "4px 0" }}>{cls}</p>
                  {affinityOfClass(cls).map((aff) => (
                    <div key={aff} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                      <input
                        type="color"
                        value={affinityColors[aff]}
                        onChange={(e) => setAffinityColors({ ...affinityColors, [aff]: e.target.value })}
                        style={{ width: 32, height: 28, padding: 0, border: "1px solid #334155", borderRadius: 4, background: "none", cursor: "pointer" }}
                      />
                      <span style={{ fontSize: "0.82rem", color: "#cbd5e1", flex: 1 }}>{aff}</span>
                      <span style={{ fontSize: "0.72rem", color: "#64748b", fontVariantNumeric: "tabular-nums" }}>{affinityColors[aff].toUpperCase()}</span>
                    </div>
                  ))}
                </div>
              ))}

              <SectionLabel>Positions</SectionLabel>
              <Slider label="Circle size" value={nodeSize} onChange={setNodeSize} min={20} max={70} />
              <Slider label="Cluster spacing (from center)" value={clusterR} onChange={setClusterR} min={100} max={320} />
              <Slider label="Affinity spacing (within a cluster)" value={nodeR} onChange={setNodeR} min={30} max={130} />
              <Slider label="Diagram display size" value={svgMaxWidth} onChange={setSvgMaxWidth} min={600} max={2000} step={20} />

              <SectionLabel>Arrows</SectionLabel>
              <Slider label="Class arrow bend (× cluster spacing)" value={classArrowBendRatio} onChange={setClassArrowBendRatio} min={0.05} max={0.6} step={0.01} />
              <Slider label="In-class arrow bend" value={inClassBend} onChange={setInClassBend} min={0} max={40} />
              <Slider label="Cross-class arrow bend (x distance)" value={crossClassBendRatio} onChange={setCrossClassBendRatio} min={0.02} max={0.35} step={0.01} />
              <Slider label="Class label clearance" value={classLabelClearance} onChange={setClassLabelClearance} min={10} max={60} />
              <Slider label="Arrowhead clearance" value={arrowClearance} onChange={setArrowClearance} min={0} max={15} />

              <SectionLabel>Style</SectionLabel>
              <Slider label="Affinity label font scale" value={fontScaleRatio} onChange={setFontScaleRatio} min={0.1} max={0.4} step={0.01} />
              <Slider label="Node border width" value={nodeStrokeWidth} onChange={setNodeStrokeWidth} min={0.5} max={4} step={0.5} />
              <Slider label="Active border width" value={activeStrokeWidth} onChange={setActiveStrokeWidth} min={1} max={6} step={0.5} />
              <Slider label="Dimmed opacity" value={dimmedOpacity} onChange={setDimmedOpacity} min={0.05} max={0.6} step={0.05} />

              <SectionLabel>Wark badge</SectionLabel>
              <Slider label="Badge scale" value={warkScaleMult} onChange={setWarkScaleMult} min={1.5} max={4} step={0.1} />
              <Slider label="Peak width" value={warkPeakWidth} onChange={setWarkPeakWidth} min={0.4} max={1.3} step={0.05} />
              <Slider label="Peak height" value={warkPeakHeight} onChange={setWarkPeakHeight} min={0.5} max={1.3} step={0.05} />
              <Slider label="Dip bend" value={warkDipBend} onChange={setWarkDipBend} min={0.1} max={1.0} step={0.05} />
              <Slider label="Side sweep bend" value={warkSideBend} onChange={setWarkSideBend} min={0.3} max={2.0} step={0.05} />
              <Slider label="Bottom point distance" value={warkBottomDist} onChange={setWarkBottomDist} min={0.8} max={2.0} step={0.05} />
              <Slider label="Badge stroke width" value={warkStrokeWidth} onChange={setWarkStrokeWidth} min={0.5} max={5} step={0.5} />
              <Slider label="Badge opacity" value={warkOpacity} onChange={setWarkOpacity} min={0.1} max={1} step={0.05} />

              <button
                onClick={downloadDeltaReport}
                style={{ width: "100%", marginTop: 18, background: "#1e293b", border: "1px solid #475569", color: "#e2e8f0", borderRadius: 6, padding: "9px", fontSize: "0.8rem", cursor: "pointer" }}
              >
                Download settings delta
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
