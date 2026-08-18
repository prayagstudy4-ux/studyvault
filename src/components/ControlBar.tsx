import { PLANETS, SPEEDS, SUN } from "../data/planets";
import { IconPause, IconPlay } from "./icons";

interface Props {
  playing: boolean;
  onTogglePlay: () => void;
  daysPerSecond: number;
  onSpeedChange: (v: number) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const ROSTER = [SUN, ...PLANETS];

export default function ControlBar({
  playing,
  onTogglePlay,
  daysPerSecond,
  onSpeedChange,
  selectedId,
  onSelect,
}: Props) {
  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-20">
      <div className="border-t border-space-700 bg-space-900/[0.96] px-3 py-3 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-3">
          {/* transport */}
          <div className="flex items-center gap-3.5">
            <button
              type="button"
              onClick={onTogglePlay}
              aria-label={playing ? "Pause simulation" : "Play simulation"}
              className="frame-corners flex h-10 w-10 items-center justify-center rounded-[3px] bg-solar-500 text-[#201500] transition-all duration-150 hover:bg-solar-400 active:translate-y-px"
            >
              {playing ? <IconPause className="h-4.5 w-4.5" /> : <IconPlay className="h-4.5 w-4.5 translate-x-[1px]" />}
            </button>

            <div>
              <div className="mb-1 text-[9px] font-semibold uppercase tracking-[0.22em] text-space-400">
                Time warp
              </div>
              <div className="flex items-center gap-1">
                {SPEEDS.map((s) => {
                  const active = s.value === daysPerSecond;
                  return (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => onSpeedChange(s.value)}
                      aria-pressed={active}
                      className={`rounded-[3px] border px-1.5 py-1 font-display text-[9.5px] font-semibold tracking-wider transition-colors duration-150 sm:px-2 ${
                        active
                          ? "border-solar-500 bg-solar-500/10 text-solar-300"
                          : "border-space-700 text-space-300 hover:border-space-500 hover:text-space-100"
                      }`}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="hidden h-9 w-px bg-space-700 sm:block" />

          {/* roster */}
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            <span className="mr-1 hidden text-[9px] font-semibold uppercase tracking-[0.22em] text-space-400 lg:inline">
              Roster
            </span>
            {ROSTER.map((body) => {
              const active = body.id === selectedId;
              return (
                <button
                  key={body.id}
                  type="button"
                  onClick={() => onSelect(body.id)}
                  aria-pressed={active}
                  className={`group flex items-center gap-1.5 rounded-[3px] border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] transition-all duration-150 ${
                    active
                      ? "border-solar-500 bg-space-800 text-space-100"
                      : "border-space-700 text-space-300 hover:-translate-y-px hover:border-space-500 hover:text-space-100"
                  }`}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full transition-shadow duration-150 group-hover:shadow-[0_0_8px_currentColor]"
                    style={{ background: body.color, color: body.color }}
                  />
                  <span className="hidden md:inline">{body.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
