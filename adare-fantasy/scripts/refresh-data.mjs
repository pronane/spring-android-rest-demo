#!/usr/bin/env node
/**
 * Refreshes the checked-in edition snapshot from free, key-less sources.
 *
 *   node scripts/refresh-data.mjs
 *
 * Sources
 *  - Wikipedia REST summary  (CC BY-SA)  → edition extract
 *  - Wikidata entity JSON    (CC0)       → label, description, sitelink
 *  - Open-Meteo forecast     (CC BY 4.0) → conditions at the venue
 *
 * The app itself never calls these at request time: it reads the snapshot, so
 * builds are deterministic and work offline. Run this on a schedule (or before
 * a deploy) to keep facts and conditions fresh.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

const EDITIONS = [
  {
    id: "adare-2027",
    wikidata: "Q136488386",
    wikipedia: "2027_Ryder_Cup",
    coords: { lat: 52.5636, lon: -8.7894 },
  },
];

const OUT_DIR = path.join(process.cwd(), "data", "snapshots");

async function getJson(url) {
  const res = await fetch(url, {
    headers: { "user-agent": "twenty-eight-fantasy/0.2 (data refresh)" },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

async function buildEdition(edition) {
  const [summary, entity, weather] = await Promise.all([
    getJson(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${edition.wikipedia}`,
    ),
    getJson(`https://www.wikidata.org/wiki/Special:EntityData/${edition.wikidata}.json`),
    getJson(
      `https://api.open-meteo.com/v1/forecast?latitude=${edition.coords.lat}&longitude=${edition.coords.lon}` +
        `&current=temperature_2m,wind_speed_10m,wind_direction_10m,weather_code` +
        `&daily=wind_speed_10m_max,precipitation_probability_max&timezone=Europe%2FDublin&forecast_days=3`,
    ),
  ]);

  const wikidata = entity.entities[edition.wikidata];

  return {
    editionId: edition.id,
    fetchedAt: new Date().toISOString(),
    sources: [
      {
        name: "Wikipedia",
        license: "CC BY-SA 4.0",
        url: `https://en.wikipedia.org/wiki/${edition.wikipedia}`,
      },
      {
        name: "Wikidata",
        license: "CC0",
        url: `https://www.wikidata.org/wiki/${edition.wikidata}`,
      },
      {
        name: "Open-Meteo",
        license: "CC BY 4.0",
        url: "https://open-meteo.com/",
      },
    ],
    wikipedia: {
      title: summary.title,
      extract: summary.extract,
      description: summary.description,
      contentUrl: summary.content_urls?.desktop?.page ?? null,
    },
    wikidata: {
      label: wikidata?.labels?.en?.value ?? null,
      description: wikidata?.descriptions?.en?.value ?? null,
      sitelink: wikidata?.sitelinks?.enwiki?.title ?? null,
      entity: edition.wikidata,
    },
    conditions: {
      timezone: experiment(weather.timezone),
      observedAt: weather.current?.time ?? null,
      temperatureC: weather.current?.temperature_2m ?? null,
      windKph: weather.current?.wind_speed_10m ?? null,
      windDirection: weather.current?.wind_direction_10m ?? null,
      weatherCode: weather.current?.weather_code ?? null,
      daily: weather.daily ?? null,
    },
  };
}

function experiment(value) {
  return value ?? "Europe/Dublin";
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  for (const edition of EDITIONS) {
    const snapshot = await buildEdition(edition);
    const file = path.join(OUT_DIR, `${edition.id}.json`);
    await fs.writeFile(file, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    console.log(
      `✓ ${edition.id} → ${path.relative(process.cwd(), file)} ` +
        `(${snapshot.conditions.temperatureC}°C, ${snapshot.conditions.windKph} km/h)`,
    );
  }
}

main().catch((error) => {
  console.error("Data refresh failed:", error.message);
  process.exitCode = 1;
});
