import {
  EARTH_DIAMETER_KM,
  JUPITER_DIAMETER_KM,
  SUN,
  type CelestialBody,
} from "../data/planets";
import { rgba } from "../lib/color";
import { IconChevronLeft, IconChevronRight, IconClose } from "./icons";

interface Props {
  body: CelestialBody | null;
  open: boolean;
  simDays: number;
  onClose: () => void;
  onNavigate: (dir: 1 | -1) => void;
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-space-900 p-3">
      <div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-space-400">{label}</div>
      <div
        className={`mt-1 font-display text-[13px] font-bold leading-snug ${
          accent ? "text-solar-400" : "text-space-100"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

export default function PlanetPanel({ body, open, simDays, onClose, onNavigate }: Props) {
  if (!body) return null;

  const isStar = body.kind === "star";
  const turns = isStar ? 0 : body.phase + simDays / body.periodDays;
  const progress = isStar ? 0 : (turns % 1) * 100;
  const laps = isStar ? 0 : Math.floor(turns);
  const sizePct = isStar
    ? 100
    : Math.max(4, Math.sqrt(body.diameterKm / JUPITER_DIAMETER_KM) * 100);
  const earthRatio = body.diameterKm / EARTH_DIAMETER_KM;

  return (
    <aside
      aria-hidden={!open}
      className={`absolute inset-y-0 right-0 z-30 w-full transition-transform duration-300 ease-[cubic-bezier(0.22,0.9,0.3,1)] sm:w-[392px] ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
    >
      <div className="flex h-full flex-col border-l border-space-700 bg-space-900/[0.98]">
        {/* header */}
        <div
          className="relative border-b border-space-700 p-5"
          style={{ background: `linear-gradient(118deg, ${rgba(body.color, 0.16)} 0%, rgba(6,11,28,0) 58%)` }}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.24em] text-space-300">
                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: body.color }} />
                {body.classLabel}
              </div>
              <h2 className="mt-2 font-display text-3xl font-black uppercase leading-none tracking-wide text-space-100">
                {body.name}
              </h2>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onNavigate(-1)}
                aria-label="Previous body"
                className="flex h-8 w-8 items-center justify-center rounded-[3px] border border-space-700 text-space-300 transition-colors hover:border-space-500 hover:text-space-100"
              >
                <IconChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onNavigate(1)}
                aria-label="Next body"
                className="flex h-8 w-8 items-center justify-center rounded-[3px] border border-space-700 text-space-300 transition-colors hover:border-space-500 hover:text-space-100"
              >
                <IconChevronRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close panel"
                className="ml-1 flex h-8 w-8 items-center justify-center rounded-[3px] border border-space-700 text-space-300 transition-colors hover:border-solar-500 hover:text-solar-400"
              >
                <IconClose className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* body */}
        <div className="scroll-slim flex-1 overflow-y-auto p-5">
          <p className="text-[13.5px] leading-relaxed text-space-200">{body.description}</p>

          <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-[3px] border border-space-700 bg-space-700">
            <Stat
              label="Diameter"
              value={`${body.diameterKm.toLocaleString("en-US")} km`}
            />
            <Stat label="Mean temp" value={body.tempDisplay} />
            <Stat label="Distance from Sun" value={isStar ? "—" : body.distanceDisplay} accent={!isStar} />
            <Stat label="Orbital period" value={body.periodDisplay} accent />
            <Stat label="Day length" value={body.rotationDisplay} />
            <Stat label="Moons" value={body.moonsDisplay} />
          </div>

          {/* size comparison */}
          <div className="mt-5">
            <div className="flex items-baseline justify-between">
              <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-space-400">
                Diameter vs Jupiter
              </span>
              <span className="font-display text-[11px] font-bold text-space-200">
                {isStar ? "9.7×" : `${(body.diameterKm / JUPITER_DIAMETER_KM).toFixed(2)}×`}
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-[2px] bg-space-800">
              <div
                className="h-full rounded-[2px] transition-all duration-500"
                style={{ width: `${sizePct}%`, background: body.color, boxShadow: `0 0 10px ${rgba(body.color, 0.7)}` }}
              />
            </div>
            <div className="mt-1.5 text-[11px] text-space-400">
              {isStar
                ? "≈ 109× Earth's diameter"
                : `≈ ${earthRatio >= 1 ? earthRatio.toFixed(1) : earthRatio.toFixed(2)}× Earth's diameter`}
            </div>
          </div>

          {/* live orbit progress */}
          {!isStar && (
            <div className="mt-5 rounded-[3px] border border-space-700 bg-space-850 p-3.5">
              <div className="flex items-baseline justify-between">
                <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-space-400">
                  Orbital progress · live
                </span>
                <span className="font-display text-[11px] font-bold tabular-nums text-solar-400">
                  {progress.toFixed(1)}%
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-[2px] bg-space-800">
                <div
                  className="h-full rounded-[2px] bg-solar-500 transition-[width] duration-150 ease-linear"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-space-400">
                <span>
                  {laps > 0 ? `${laps.toLocaleString("en-US")} full ${laps === 1 ? "lap" : "laps"} · ` : ""}
                  {body.periodDisplay}
                </span>
                {body.velocityKms !== null && (
                  <span className="font-display font-semibold text-space-300">{body.velocityKms} km/s</span>
                )}
              </div>
            </div>
          )}

          {/* field note */}
          <div className="mt-5 border-l-2 border-solar-500 bg-solar-500/[0.05] py-3 pl-4 pr-3">
            <div className="text-[9px] font-semibold uppercase tracking-[0.24em] text-solar-500">Field note</div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-space-200">{body.fact}</p>
          </div>
        </div>

        <div className="border-t border-space-700 px-5 py-2.5 text-[9.5px] uppercase tracking-[0.2em] text-space-500">
          Source · NASA planetary fact sheet
        </div>
      </div>
    </aside>
  );
}
