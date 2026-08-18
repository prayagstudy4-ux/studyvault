export interface CelestialBody {
  id: string;
  name: string;
  kind: "star" | "planet";
  classLabel: string;
  color: string;
  diameterKm: number;
  /** 0 for the Sun */
  distanceAU: number;
  distanceDisplay: string;
  periodDays: number;
  periodDisplay: string;
  rotationDisplay: string;
  moonsDisplay: string;
  tempDisplay: string;
  /** mean orbital velocity, km/s (null for the Sun) */
  velocityKms: number | null;
  /** starting orbital phase, in turns (0..1) */
  phase: number;
  description: string;
  fact: string;
  rings?: boolean;
  hasMoon?: boolean;
}

export const EARTH_DIAMETER_KM = 12756;
export const JUPITER_DIAMETER_KM = 142984;

export const SUN: CelestialBody = {
  id: "sun",
  name: "Sun",
  kind: "star",
  classLabel: "G2V yellow dwarf star",
  color: "#ffd061",
  diameterKm: 1392700,
  distanceAU: 0,
  distanceDisplay: "0 km · system anchor",
  periodDays: 0,
  periodDisplay: "≈230 Myr around the Milky Way",
  rotationDisplay: "~25 d (equator)",
  moonsDisplay: "8 planets in tow",
  tempDisplay: "5,505 °C surface",
  velocityKms: null,
  phase: 0,
  description:
    "The star that anchors the solar system — a 4.6-billion-year-old sphere of plasma holding 99.86% of the system's mass. Every world in this orrery moves in its grip.",
  fact: "About 1.3 million Earths could fit inside the Sun, and its light still needs 8 min 20 s to reach us.",
};

export const PLANETS: CelestialBody[] = [
  {
    id: "mercury",
    name: "Mercury",
    kind: "planet",
    classLabel: "Terrestrial planet",
    color: "#bfae9c",
    diameterKm: 4879,
    distanceAU: 0.39,
    distanceDisplay: "57.9M km · 0.39 AU",
    periodDays: 87.97,
    periodDisplay: "88 Earth days",
    rotationDisplay: "58.6 d",
    moonsDisplay: "0",
    tempDisplay: "−173 to 427 °C",
    velocityKms: 47.4,
    phase: 0.15,
    description:
      "The smallest planet and the closest to the Sun — a scorched, cratered ball of iron and rock. It races around the Sun in just 88 days, faster than any other world.",
    fact: "One solar day on Mercury (sunrise to sunrise) lasts 176 Earth days — twice as long as its entire year.",
  },
  {
    id: "venus",
    name: "Venus",
    kind: "planet",
    classLabel: "Terrestrial planet",
    color: "#efcb7c",
    diameterKm: 12104,
    distanceAU: 0.72,
    distanceDisplay: "108.2M km · 0.72 AU",
    periodDays: 224.7,
    periodDisplay: "224.7 Earth days",
    rotationDisplay: "243 d (retrograde)",
    moonsDisplay: "0",
    tempDisplay: "464 °C mean",
    velocityKms: 35.0,
    phase: 0.45,
    description:
      "Shrouded in thick clouds of sulfuric acid, Venus is the hottest planet in the solar system. A runaway greenhouse atmosphere presses down with 92× Earth's sea-level pressure.",
    fact: "Venus spins backwards, and so slowly that a single Venusian day outlasts its whole year.",
  },
  {
    id: "earth",
    name: "Earth",
    kind: "planet",
    classLabel: "Terrestrial planet",
    color: "#56a8e8",
    diameterKm: 12756,
    distanceAU: 1.0,
    distanceDisplay: "149.6M km · 1.00 AU",
    periodDays: 365.25,
    periodDisplay: "365.25 days",
    rotationDisplay: "23.9 h",
    moonsDisplay: "1",
    tempDisplay: "15 °C mean",
    velocityKms: 29.8,
    phase: 0.72,
    description:
      "Home — the only world known to harbor life. Liquid water covers 71% of its surface, and a large Moon steadies the axial tilt that gives Earth its seasons.",
    fact: "Earth is the densest planet in the solar system, and the only one not named after a deity.",
    hasMoon: true,
  },
  {
    id: "mars",
    name: "Mars",
    kind: "planet",
    classLabel: "Terrestrial planet",
    color: "#e2704a",
    diameterKm: 6792,
    distanceAU: 1.52,
    distanceDisplay: "227.9M km · 1.52 AU",
    periodDays: 686.98,
    periodDisplay: "687 Earth days",
    rotationDisplay: "24.6 h",
    moonsDisplay: "2",
    tempDisplay: "−63 °C mean",
    velocityKms: 24.1,
    phase: 0.05,
    description:
      "The red planet owes its rust color to iron-oxide dust. It hosts Olympus Mons, the tallest volcano, and Valles Marineris, the deepest canyon in the solar system.",
    fact: "Sunsets on Mars look blue — fine dust scatters red light away and leaves a cold glow around the Sun.",
  },
  {
    id: "jupiter",
    name: "Jupiter",
    kind: "planet",
    classLabel: "Gas giant",
    color: "#dca76f",
    diameterKm: 142984,
    distanceAU: 5.2,
    distanceDisplay: "778.5M km · 5.20 AU",
    periodDays: 4332.59,
    periodDisplay: "11.86 years (4,333 d)",
    rotationDisplay: "9.9 h",
    moonsDisplay: "95",
    tempDisplay: "−108 °C",
    velocityKms: 13.1,
    phase: 0.35,
    description:
      "A gas giant more massive than every other planet combined. Its Great Red Spot is a storm wider than Earth that has been raging for at least 190 years.",
    fact: "Jupiter's moon Ganymede is the largest moon in the solar system — bigger than the planet Mercury.",
  },
  {
    id: "saturn",
    name: "Saturn",
    kind: "planet",
    classLabel: "Gas giant",
    color: "#e9ce93",
    diameterKm: 120536,
    distanceAU: 9.58,
    distanceDisplay: "1.43B km · 9.58 AU",
    periodDays: 10759.22,
    periodDisplay: "29.4 years (10,759 d)",
    rotationDisplay: "10.7 h",
    moonsDisplay: "146",
    tempDisplay: "−139 °C",
    velocityKms: 9.7,
    phase: 0.62,
    description:
      "Famous for its brilliant rings of ice and rock, Saturn is the least dense planet in the solar system — it would float, given a big enough ocean.",
    fact: "Saturn's rings stretch 280,000 km across, yet in places they are only about 10 metres thick.",
    rings: true,
  },
  {
    id: "uranus",
    name: "Uranus",
    kind: "planet",
    classLabel: "Ice giant",
    color: "#93dadf",
    diameterKm: 51118,
    distanceAU: 19.19,
    distanceDisplay: "2.87B km · 19.19 AU",
    periodDays: 30688.5,
    periodDisplay: "84 years (30,688 d)",
    rotationDisplay: "17.2 h (retrograde)",
    moonsDisplay: "28",
    tempDisplay: "−197 °C",
    velocityKms: 6.8,
    phase: 0.85,
    description:
      "An ice giant knocked onto its side — Uranus rolls around the Sun at a 98° tilt, likely the aftermath of a colossal ancient impact.",
    fact: "Uranus was the first planet discovered with a telescope, by William Herschel in 1781.",
  },
  {
    id: "neptune",
    name: "Neptune",
    kind: "planet",
    classLabel: "Ice giant",
    color: "#5d7fe8",
    diameterKm: 49528,
    distanceAU: 30.07,
    distanceDisplay: "4.50B km · 30.07 AU",
    periodDays: 60182,
    periodDisplay: "164.8 years (60,182 d)",
    rotationDisplay: "16.1 h",
    moonsDisplay: "16",
    tempDisplay: "−201 °C",
    velocityKms: 5.4,
    phase: 0.28,
    description:
      "The most distant planet, whipped by the fastest winds ever recorded — over 2,000 km/h. Methane in its deep, frigid atmosphere gives it that vivid blue.",
    fact: "Between its discovery in 1846 and July 2011, Neptune had completed exactly one orbit of the Sun.",
  },
];

export const ALL_BODIES: CelestialBody[] = [SUN, ...PLANETS];

export interface SpeedOption {
  label: string;
  /** simulated Earth-days per real second */
  value: number;
}

export const SPEEDS: SpeedOption[] = [
  { label: "1 d/s", value: 1 },
  { label: "10 d/s", value: 10 },
  { label: "30 d/s", value: 30 },
  { label: "100 d/s", value: 100 },
  { label: "1 yr/s", value: 365 },
];

export const DEFAULT_SPEED = 30;

export function rateLabel(value: number): string {
  return value >= 365 ? "≈1 yr" : `${value} d`;
}
