import { useEffect, useRef } from "react";
import { PLANETS, SUN, type CelestialBody } from "../data/planets";
import { mix, rgba } from "../lib/color";

const TAU = Math.PI * 2;

interface Props {
  playing: boolean;
  daysPerSecond: number;
  selectedId: string | null;
  panelOpen: boolean;
  reducedMotion: boolean;
  onSelect: (id: string) => void;
  onTick: (simDays: number) => void;
}

interface Star {
  x: number;
  y: number;
  r: number;
  a: number;
  tw: number;
  ph: number;
  tint: string;
}

interface Comet {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface PlanetPoint {
  body: CelestialBody;
  r: number;
  ang: number;
  x: number;
  y: number;
  dr: number;
}

const STAR_TINTS = ["#cdd8f2", "#cdd8f2", "#cdd8f2", "#ffe3b8", "#a8e6e0"];

export default function SolarSystemCanvas(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0;
    let h = 0;
    let stars: Star[] = [];
    let bg: HTMLCanvasElement | null = null;
    let simDays = 0;
    let last = performance.now();
    let lastEmit = 0;
    let raf = 0;
    let hoverId: string | null = null;
    let cx = 0;
    let cy = 0;
    let comet: Comet | null = null;
    let cometTimer = 7;
    const time0 = performance.now();
    const hitPositions: { id: string; x: number; y: number; r: number }[] = [];

    /* ------------------------------------------------ layout helpers */
    const layout = () => {
      const minDim = Math.min(w, h);
      const sunR = Math.min(30, Math.max(15, minDim * 0.036));
      const avail = Math.max(60, minDim / 2 - 26 - sunR - 12);
      const k = avail / Math.pow(30.07, 0.42);
      const scale = Math.min(1.15, Math.max(0.72, minDim / 900));
      return { sunR, k, scale };
    };

    const orbitRadius = (au: number, sunR: number, k: number) =>
      sunR + 12 + Math.pow(au, 0.42) * k;

    const displayRadius = (diameterKm: number, scale: number) =>
      (3.1 + Math.log(diameterKm / 4200) * 2.05) * scale;

    /* ------------------------------------------------ background */
    const makeStars = () => {
      const count = Math.min(720, Math.max(220, Math.round((w * h) / 2400)));
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 0.35 + Math.random() * 0.95 + (Math.random() < 0.06 ? 0.7 : 0),
        a: 0.22 + Math.random() * 0.6,
        tw: 0.5 + Math.random() * 1.8,
        ph: Math.random() * TAU,
        tint: STAR_TINTS[Math.floor(Math.random() * STAR_TINTS.length)],
      }));
    };

    const makeBg = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      bg = document.createElement("canvas");
      bg.width = Math.max(1, Math.round(w * dpr));
      bg.height = Math.max(1, Math.round(h * dpr));
      const b = bg.getContext("2d");
      if (!b) return;
      b.scale(dpr, dpr);

      b.fillStyle = "#030611";
      b.fillRect(0, 0, w, h);

      const blob = (x: number, y: number, r: number, color: string) => {
        const g = b.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, color);
        g.addColorStop(1, "rgba(3,6,17,0)");
        b.fillStyle = g;
        b.fillRect(0, 0, w, h);
      };
      blob(w * 0.78, h * 0.14, Math.max(w, h) * 0.5, "rgba(62,164,154,0.10)");
      blob(w * 0.1, h * 0.82, Math.max(w, h) * 0.45, "rgba(70,105,196,0.11)");
      blob(w * 0.88, h * 0.9, Math.max(w, h) * 0.38, "rgba(217,138,43,0.06)");
      blob(w * 0.4, h * 0.4, Math.max(w, h) * 0.3, "rgba(38,66,140,0.08)");

      const vg = b.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.72);
      vg.addColorStop(0, "rgba(3,6,17,0)");
      vg.addColorStop(1, "rgba(2,4,12,0.55)");
      b.fillStyle = vg;
      b.fillRect(0, 0, w, h);
    };

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      w = Math.max(300, rect.width);
      h = Math.max(300, rect.height);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (cx === 0) {
        cx = w / 2;
        cy = h / 2;
      }
      makeStars();
      makeBg();
    };

    /* ------------------------------------------------ drawing */
    const drawLabel = (text: string, x: number, y: number, color: string) => {
      ctx.font = "700 10px 'Orbitron', 'Space Grotesk', sans-serif";
      const tw = ctx.measureText(text).width;
      const bw = tw + 16;
      const bh = 20;
      const bx = Math.min(Math.max(x - bw / 2, 6), w - bw - 6);
      const by = Math.max(y - bh, 6);
      ctx.fillStyle = "rgba(5,9,20,0.9)";
      ctx.strokeStyle = rgba(color, 0.55);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.rect(bx, by, bw, bh);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#e9edf8";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, bx + bw / 2, by + bh / 2 + 0.5);
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const p = propsRef.current;
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const t = (now - time0) / 1000;

      if (p.playing) simDays += dt * p.daysPerSecond;

      // ease the system leftward when the dossier panel opens
      const targetX = w / 2 - (p.panelOpen ? Math.min(w * 0.13, 165) : 0);
      cx += (targetX - cx) * 0.07;
      cy += (h / 2 - cy) * 0.07;

      ctx.clearRect(0, 0, w, h);
      if (bg) ctx.drawImage(bg, 0, 0, w, h);

      // starfield
      for (const s of stars) {
        const tw = p.reducedMotion ? 1 : 0.62 + 0.38 * Math.sin(t * s.tw + s.ph);
        ctx.globalAlpha = s.a * tw;
        ctx.fillStyle = s.tint;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      const { sunR, k, scale } = layout();

      // planet positions for this frame
      const pts: PlanetPoint[] = PLANETS.map((body) => {
        const r = orbitRadius(body.distanceAU, sunR, k);
        const ang = body.phase * TAU + TAU * (simDays / body.periodDays);
        return {
          body,
          r,
          ang,
          x: cx + Math.cos(ang) * r,
          y: cy + Math.sin(ang) * r,
          dr: displayRadius(body.diameterKm, scale),
        };
      });

      // hit targets (planets + sun)
      hitPositions.length = 0;
      hitPositions.push({ id: SUN.id, x: cx, y: cy, r: sunR });
      for (const pt of pts) hitPositions.push({ id: pt.body.id, x: pt.x, y: pt.y, r: pt.dr });

      // orbit paths
      for (const pt of pts) {
        const sel = p.selectedId === pt.body.id;
        const hov = hoverId === pt.body.id;
        ctx.beginPath();
        ctx.arc(cx, cy, pt.r, 0, TAU);
        if (sel) {
          ctx.strokeStyle = "rgba(245,184,61,0.55)";
          ctx.lineWidth = 1.3;
          if (!p.reducedMotion) {
            ctx.setLineDash([3, 7]);
            ctx.lineDashOffset = -t * 16;
          }
        } else {
          ctx.strokeStyle = hov ? "rgba(150,170,215,0.4)" : "rgba(120,140,190,0.15)";
          ctx.lineWidth = 1;
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // beam from sun to selected planet
      const selPt = pts.find((pt) => pt.body.id === p.selectedId);
      if (selPt) {
        ctx.strokeStyle = rgba(selPt.body.color, 0.25);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(selPt.x, selPt.y);
        ctx.stroke();
      }

      // motion trails
      for (const pt of pts) {
        const span = 0.55;
        const segs = 14;
        ctx.lineWidth = Math.min(3, Math.max(1.2, pt.dr * 0.42));
        for (let i = 0; i < segs; i++) {
          const a1 = pt.ang - (span * (i + 1)) / segs;
          const a2 = pt.ang - (span * i) / segs;
          ctx.strokeStyle = rgba(pt.body.color, 0.26 * (1 - i / segs));
          ctx.beginPath();
          ctx.arc(cx, cy, pt.r, a1, a2);
          ctx.stroke();
        }
      }

      // sun glow + core
      const pulse = p.reducedMotion ? 1 : 1 + Math.sin(t * 1.7) * 0.06;
      const glowR = sunR * 5.4 * pulse;
      const g = ctx.createRadialGradient(cx, cy, sunR * 0.4, cx, cy, glowR);
      g.addColorStop(0, "rgba(255,208,97,0.32)");
      g.addColorStop(0.35, "rgba(245,158,27,0.11)");
      g.addColorStop(1, "rgba(245,158,27,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, glowR, 0, TAU);
      ctx.fill();

      const core = ctx.createRadialGradient(cx - sunR * 0.28, cy - sunR * 0.28, sunR * 0.1, cx, cy, sunR);
      core.addColorStop(0, "#fff7dd");
      core.addColorStop(0.45, "#ffd061");
      core.addColorStop(1, "#ef8d1e");
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(cx, cy, sunR, 0, TAU);
      ctx.fill();

      // planets
      for (const pt of pts) {
        const hov = hoverId === pt.body.id;
        const sel = p.selectedId === pt.body.id;
        const dr = pt.dr * (hov && !sel ? 1.22 : 1);

        // saturn rings (back pass)
        if (pt.body.rings) {
          ctx.save();
          ctx.translate(pt.x, pt.y);
          ctx.rotate(-0.45);
          ctx.strokeStyle = rgba(pt.body.color, 0.32);
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.ellipse(0, 0, dr * 2.0, dr * 0.6, 0, 0, TAU);
          ctx.stroke();
          ctx.restore();
        }

        const grad = ctx.createRadialGradient(pt.x - dr * 0.38, pt.y - dr * 0.38, dr * 0.12, pt.x, pt.y, dr);
        grad.addColorStop(0, mix(pt.body.color, 255, 0.55));
        grad.addColorStop(0.45, pt.body.color);
        grad.addColorStop(1, mix(pt.body.color, 0, 0.5));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, dr, 0, TAU);
        ctx.fill();

        // saturn rings (front pass)
        if (pt.body.rings) {
          ctx.save();
          ctx.translate(pt.x, pt.y);
          ctx.rotate(-0.45);
          ctx.strokeStyle = rgba(pt.body.color, 0.85);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(0, 0, dr * 2.0, dr * 0.6, 0, 0, Math.PI);
          ctx.stroke();
          ctx.strokeStyle = rgba(pt.body.color, 0.4);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(0, 0, dr * 1.62, dr * 0.46, 0, 0, Math.PI);
          ctx.stroke();
          ctx.restore();
        }

        // Earth's moon
        if (pt.body.hasMoon) {
          const ma = TAU * (simDays / 27.32);
          const mx = pt.x + Math.cos(ma) * (dr + 6.5);
          const my = pt.y + Math.sin(ma) * (dr + 6.5) * 0.55;
          ctx.fillStyle = "#cfd8ea";
          ctx.beginPath();
          ctx.arc(mx, my, Math.max(1.4, 1.7 * scale), 0, TAU);
          ctx.fill();
        }

        // hover / selection rings
        if (hov && !sel) {
          ctx.strokeStyle = "rgba(233,237,248,0.7)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, dr + 5, 0, TAU);
          ctx.stroke();
        }
        if (sel) {
          ctx.strokeStyle = "rgba(255,208,97,0.9)";
          ctx.lineWidth = 1.4;
          if (!p.reducedMotion) {
            ctx.setLineDash([4, 5]);
            ctx.lineDashOffset = -t * 18;
          }
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, dr + 7, 0, TAU);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        if (hov || sel) drawLabel(pt.body.name.toUpperCase(), pt.x, pt.y - dr - 11, pt.body.color);
      }

      // sun hover / selection ring + label
      const sunHov = hoverId === SUN.id;
      const sunSel = p.selectedId === SUN.id;
      if (sunHov || sunSel) {
        ctx.strokeStyle = sunSel ? "rgba(255,208,97,0.9)" : "rgba(233,237,248,0.7)";
        ctx.lineWidth = sunSel ? 1.4 : 1;
        if (sunSel && !p.reducedMotion) {
          ctx.setLineDash([4, 5]);
          ctx.lineDashOffset = -t * 18;
        }
        ctx.beginPath();
        ctx.arc(cx, cy, sunR + 7, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
        drawLabel("SUN", cx, cy - sunR - 11, SUN.color);
      }

      // ambient comet
      if (!p.reducedMotion) {
        cometTimer -= dt;
        if (!comet && cometTimer <= 0) {
          const fromLeft = Math.random() > 0.5;
          comet = {
            x: fromLeft ? -40 : w + 40,
            y: h * (0.08 + Math.random() * 0.45),
            vx: (fromLeft ? 1 : -1) * (170 + Math.random() * 150),
            vy: 55 + Math.random() * 70,
          };
          cometTimer = 15 + Math.random() * 14;
        }
      }
      if (comet) {
        comet.x += comet.vx * dt;
        comet.y += comet.vy * dt;
        const tx = comet.x - comet.vx * 0.5;
        const ty = comet.y - comet.vy * 0.5;
        const cg = ctx.createLinearGradient(comet.x, comet.y, tx, ty);
        cg.addColorStop(0, "rgba(190,225,255,0.6)");
        cg.addColorStop(1, "rgba(190,225,255,0)");
        ctx.strokeStyle = cg;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(comet.x, comet.y);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.fillStyle = "rgba(236,248,255,0.95)";
        ctx.beginPath();
        ctx.arc(comet.x, comet.y, 2.1, 0, TAU);
        ctx.fill();
        if (comet.x < -90 || comet.x > w + 90 || comet.y > h + 90) comet = null;
      }

      // throttled clock emission
      if (now - lastEmit > 120) {
        lastEmit = now;
        p.onTick(simDays);
      }
    };

    /* ------------------------------------------------ interaction */
    const pick = (x: number, y: number): string | null => {
      let best: string | null = null;
      let bd = Infinity;
      for (const pos of hitPositions) {
        const threshold = Math.max(pos.r + 7, 15);
        const d = Math.hypot(x - pos.x, y - pos.y);
        if (d <= threshold && d < bd) {
          bd = d;
          best = pos.id;
        }
      }
      return best;
    };

    const toLocal = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const onMove = (e: PointerEvent) => {
      const { x, y } = toLocal(e);
      hoverId = pick(x, y);
      canvas.style.cursor = hoverId ? "pointer" : "default";
    };
    const onLeave = () => {
      hoverId = null;
      canvas.style.cursor = "default";
    };
    const onClick = (e: PointerEvent) => {
      const { x, y } = toLocal(e);
      const id = pick(x, y);
      if (id) propsRef.current.onSelect(id);
    };

    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("pointerup", onClick);

    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("pointerup", onClick);
    };
  }, []);

  return (
    <div ref={wrapRef} className="absolute inset-0">
      <canvas ref={canvasRef} role="img" aria-label="Animated map of the solar system with the Sun and eight orbiting planets" />
    </div>
  );
}
