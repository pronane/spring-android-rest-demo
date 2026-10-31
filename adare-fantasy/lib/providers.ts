/**
 * Read-only access to the checked-in edition snapshot. The snapshot is written
 * by `npm run data:refresh` from Wikipedia, Wikidata and Open-Meteo, so the app
 * renders deterministically and works without network access.
 */
import snapshot from "@/data/snapshots/adare-2027.json";

export type Snapshot = typeof snapshot;

export const CONDITIONS_CODES: Record<number, string> = {
  0: "Clear",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Rime fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  71: "Light snow",
  80: "Showers",
  81: "Showers",
  82: "Violent showers",
  95: "Thunderstorm",
};

export function getSnapshot(): Snapshot {
  return snapshot;
}

export function conditionsSummary() {
  const { conditions } = snapshot;
  return {
    temperatureC: conditions.temperatureC,
    windKph: conditions.windKph,
    windDirection: conditions.windDirection,
    description: conditions.weatherCode != null ? CONDITIONS_CODES[conditions.weatherCode] ?? "Mixed" : "—",
    observedAt: conditions.observedAt,
    rainChance: conditions.daily?.precipitation_probability_max?.[0] ?? null,
    fetchedAt: snapshot.fetchedAt,
    sources: snapshot.sources,
  };
}

export function compass(degrees: number | null): string {
  if (degrees == null) return "—";
  const points = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return points[Math.round(degrees / 22.5) % 16];
}

export function isStale(maxDays = 14): boolean {
  const age = Date.now() - new Date(snapshot.fetchedAt).getTime();
  return age > maxDays * 86_400_000;
}
