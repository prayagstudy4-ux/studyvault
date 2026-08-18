import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ControlBar from "./components/ControlBar";
import PlanetPanel from "./components/PlanetPanel";
import SolarSystemCanvas from "./components/SolarSystemCanvas";
import { IconInfo, IconOrbit } from "./components/icons";
import { ALL_BODIES, DEFAULT_SPEED, rateLabel } from "./data/planets";

export default function App() {
  const reducedMotion = useMemo(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  );

  const [playing, setPlaying] = useState(!reducedMotion);
  const [daysPerSecond, setDaysPerSecond] = useState(DEFAULT_SPEED);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [hasSelected, setHasSelected] = useState(false);
  const [simDays, setSimDays] = useState(0);
  const closeTimer = useRef<number>(0);

  const selected = useMemo(
    () => ALL_BODIES.find((b) => b.id === selectedId) ?? null,
    [selectedId]
  );

  const handleSelect = useCallback((id: string | null) => {
    window.clearTimeout(closeTimer.current);
    if (id) {
      setSelectedId(id);
      setPanelOpen(true);
      setHasSelected(true);
    } else {
      setPanelOpen(false);
      closeTimer.current = window.setTimeout(() => setSelectedId(null), 320);
    }
  }, []);

  const handleNavigate = useCallback(
    (dir: 1 | -1) => {
      const idx = ALL_BODIES.findIndex((b) => b.id === selectedId);
      const next = ALL_BODIES[(idx + dir + ALL_BODIES.length) % ALL_BODIES.length];
      handleSelect(next.id);
    },
    [selectedId, handleSelect]
  );

  const handleTick = useCallback((d: number) => setSimDays(d), []);

  /* keyboard: space = play/pause, esc = close, arrows = cycle bodies */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "BUTTON" || tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.code === "Space") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === "Escape") {
        handleSelect(null);
      } else if (e.key === "ArrowRight") {
        handleNavigate(1);
      } else if (e.key === "ArrowLeft") {
        handleNavigate(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(closeTimer.current);
    };
  }, [handleSelect, handleNavigate]);

  const years = Math.floor(simDays / 365.25);
  const days = Math.floor(simDays - years * 365.25);

  return (
    <div className="relative h-dvh w-full select-none overflow-hidden bg-space-950 font-body text-space-100">
      <SolarSystemCanvas
        playing={playing}
        daysPerSecond={daysPerSecond}
        selectedId={selectedId}
        panelOpen={panelOpen}
        reducedMotion={reducedMotion}
        onSelect={handleSelect}
        onTick={handleTick}
      />

      {/* title block */}
      <header className="pointer-events-none absolute left-4 top-4 z-10 max-w-[72%] sm:left-7 sm:top-6">
        <div className="anim-hud-in flex items-center gap-2.5">
          <IconOrbit className="anim-spin-slow h-7 w-7 shrink-0 text-solar-400" />
          <span className="font-display text-[10px] font-bold uppercase tracking-[0.3em] text-space-300">
            Interactive orrery
          </span>
        </div>
        <h1
          className="anim-hud-in mt-3 font-display text-[27px] font-black uppercase leading-[1.04] tracking-wide text-space-100 sm:text-4xl"
          style={{ animationDelay: "90ms" }}
        >
          Solar
          <br />
          <span className="text-solar-400">System</span>
        </h1>
        <p
          className="anim-hud-in mt-3 hidden max-w-[310px] text-[12.5px] leading-relaxed text-space-300 sm:block"
          style={{ animationDelay: "180ms" }}
        >
          One star, eight worlds — orbital periods in true ratio, distances compressed for the
          screen. Click any world to pull its dossier.
        </p>
      </header>

      {/* mission clock */}
      <div className="pointer-events-none absolute right-5 top-5 z-10 hidden text-right sm:block md:right-7 md:top-6">
        <div className="font-display text-xl font-bold tabular-nums tracking-wider text-solar-400 md:text-2xl">
          T+{years}Y&nbsp;{String(days).padStart(3, "0")}D
        </div>
        <div className="mt-1.5 flex items-center justify-end gap-2 text-[9px] font-semibold uppercase tracking-[0.22em] text-space-300">
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              playing ? "anim-blink bg-nebula-400" : "bg-solar-500"
            }`}
          />
          {playing ? "Simulation running" : "Paused"}
          <span className="text-space-500">·</span>
          <span>
            1s ≈ <span className="text-solar-400">{rateLabel(daysPerSecond)}</span>
          </span>
        </div>
      </div>

      {/* first-visit hint */}
      {!hasSelected && (
        <div className="pointer-events-none absolute bottom-[88px] left-1/2 z-10 -translate-x-1/2">
          <div
            className="anim-hud-in flex items-center gap-2.5 rounded-[3px] border border-space-700 bg-space-900/90 px-4 py-2.5"
            style={{ animationDelay: "600ms" }}
          >
            <IconInfo className="h-4 w-4 shrink-0 text-solar-400" />
            <span className="whitespace-nowrap text-[11.5px] text-space-200">
              Click a planet to inspect it
              <span className="mx-1.5 text-space-500">·</span>
              <kbd className="rounded-[3px] border border-space-600 bg-space-800 px-1.5 py-0.5 font-display text-[9px] font-semibold text-space-200">
                SPACE
              </kbd>{" "}
              to pause
            </span>
          </div>
        </div>
      )}

      <ControlBar
        playing={playing}
        onTogglePlay={() => setPlaying((p) => !p)}
        daysPerSecond={daysPerSecond}
        onSpeedChange={setDaysPerSecond}
        selectedId={selectedId}
        onSelect={(id) => handleSelect(id)}
      />

      <PlanetPanel
        body={selected}
        open={panelOpen}
        simDays={simDays}
        onClose={() => handleSelect(null)}
        onNavigate={handleNavigate}
      />
    </div>
  );
}
