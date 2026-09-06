export type AnomalyQuote = {
  changePct: number | null;
  volumeRatio: number | null;
  turnover?: number | null;
  high?: number | null;
  low?: number | null;
  prevClose?: number | null;
  updatedAt?: string;
};

export type AnomalyCompany = {
  code: string;
  name: string;
  sectorId: number;
  sectorName: string;
  sectorShortName: string;
  quote: AnomalyQuote | null;
};

export type HistoricalVolatilityProfile = {
  median: number;
  robustSigma: number;
  sampleSize: number;
};

export type IndividualAnomalyAssessment = {
  kind: "price-volume" | "extreme-price" | "volume-shock";
  score: number;
  changePct: number;
  sectorId: number;
  sectorName: string;
  sectorShortName: string;
  sectorMedian: number;
  relativeMove: number;
  volumeRatio: number;
  amplitude: number;
  historicalZ: number | null;
};

export type SectorAnomaly = {
  sectorId: number;
  sectorName: string;
  sectorShortName: string;
  changePct: number;
  directionShare: number;
  memberCount: number;
  directionCount: number;
  score: number;
  facts: string;
};

export type MarketAnomalyResult<T extends AnomalyCompany> = {
  individuals: Array<{ company: T; assessment: IndividualAnomalyAssessment }>;
  sectors: SectorAnomaly[];
  candidateCount: number;
};

const MAX_SIGNALS = 15;
const OPENING_OBSERVATION_END = 9 * 60 + 45;

export function detectMarketAnomalies<T extends AnomalyCompany>(
  entries: T[],
  historicalProfiles: Record<string, HistoricalVolatilityProfile> = {},
  options: { limit?: number } = {},
): MarketAnomalyResult<T> {
  const signalLimit = options.limit ?? MAX_SIGNALS;
  const sectorBaselines = buildSectorBaselines(entries);
  const sectors = buildSectorAnomalies(sectorBaselines, signalLimit);
  const grouped = groupCompanies(entries);
  const candidates = grouped
    .map(({ company, sectorIds }) => {
      const assessment = assessCompany(company, sectorIds, sectorBaselines, historicalProfiles[company.code]);
      return assessment ? { company, assessment } : null;
    })
    .filter((item): item is { company: T; assessment: IndividualAnomalyAssessment } => Boolean(item))
    .sort((a, b) => b.assessment.score - a.assessment.score);
  const individualLimit = Math.max(0, signalLimit - sectors.length);
  return { individuals: candidates.slice(0, individualLimit), sectors, candidateCount: candidates.length };
}

export function findHistoryCandidateCodes<T extends AnomalyCompany>(entries: T[], limit = 20) {
  const sectorBaselines = buildSectorBaselines(entries);
  return groupCompanies(entries)
    .map(({ company, sectorIds }) => {
      const quote = company.quote;
      const changePct = quote?.changePct;
      if (changePct == null) return null;
      const comparison = closestSector(changePct, sectorIds, sectorBaselines);
      if (!comparison || Math.abs(changePct) < 4 || Math.abs(comparison.relativeMove) < 4) return null;
      return { code: company.code, priority: Math.abs(comparison.relativeMove) * 2 + Math.abs(changePct) };
    })
    .filter((item): item is { code: string; priority: number } => Boolean(item))
    .sort((a, b) => b.priority - a.priority)
    .slice(0, limit)
    .map((item) => item.code);
}

export function buildHistoricalVolatilityProfile(changePcts: number[]): HistoricalVolatilityProfile | null {
  const values = changePcts.filter(Number.isFinite).slice(-20);
  if (values.length < 10) return null;
  const center = median(values);
  const mad = median(values.map((value) => Math.abs(value - center)));
  return { median: center, robustSigma: Math.max(1, mad * 1.4826), sampleSize: values.length };
}

export function describeIndividualAnomaly(assessment: IndividualAnomalyAssessment, quote: AnomalyQuote) {
  const direction = assessment.changePct >= 0 ? "上涨" : "下跌";
  const relativeDirection = assessment.relativeMove >= 0 ? "高于" : "低于";
  const facts = [
    `股价${direction}${Math.abs(assessment.changePct).toFixed(2)}%`,
    `${relativeDirection}${assessment.sectorShortName}中位数${Math.abs(assessment.relativeMove).toFixed(2)}个百分点`,
  ];
  if (assessment.volumeRatio >= 2) facts.push(`量比${assessment.volumeRatio.toFixed(2)}`);
  if (assessment.amplitude >= 6) facts.push(`日内振幅${assessment.amplitude.toFixed(2)}%`);
  if ((assessment.historicalZ ?? 0) >= 2.5) facts.push(`超过近20日常态波动${assessment.historicalZ?.toFixed(1)}倍`);
  if ((quote.turnover ?? 0) >= 5) facts.push(`换手率${quote.turnover?.toFixed(2)}%`);
  return facts.join("；");
}

type SectorBaseline<T extends AnomalyCompany> = {
  sectorId: number;
  sectorName: string;
  sectorShortName: string;
  median: number;
  members: T[];
};

function buildSectorBaselines<T extends AnomalyCompany>(entries: T[]) {
  const sectors = new Map<number, Map<string, T>>();
  for (const entry of entries) {
    if (entry.quote?.changePct == null) continue;
    const members = sectors.get(entry.sectorId) ?? new Map<string, T>();
    members.set(entry.code, entry);
    sectors.set(entry.sectorId, members);
  }
  return new Map<number, SectorBaseline<T>>([...sectors].map(([sectorId, memberMap]) => {
    const members = [...memberMap.values()];
    const first = members[0];
    return [sectorId, {
      sectorId,
      sectorName: first.sectorName,
      sectorShortName: first.sectorShortName,
      median: median(members.map((item) => item.quote?.changePct ?? 0)),
      members,
    }];
  }));
}

function buildSectorAnomalies<T extends AnomalyCompany>(baselines: Map<number, SectorBaseline<T>>, limit: number) {
  return [...baselines.values()]
    .map((sector): SectorAnomaly | null => {
      if (sector.members.length < 3 || Math.abs(sector.median) < 5) return null;
      const direction = sector.median >= 0 ? 1 : -1;
      const directionCount = sector.members.filter((member) => (member.quote?.changePct ?? 0) * direction > 0).length;
      const directionShare = directionCount / sector.members.length;
      if (directionShare < 0.6) return null;
      const directionLabel = direction > 0 ? "上涨" : "下跌";
      return {
        sectorId: sector.sectorId,
        sectorName: sector.sectorName,
        sectorShortName: sector.sectorShortName,
        changePct: sector.median,
        directionShare,
        memberCount: sector.members.length,
        directionCount,
        score: Math.abs(sector.median) * 2 + directionShare * 5,
        facts: `${sector.sectorName}中位数${directionLabel}${Math.abs(sector.median).toFixed(2)}%；${directionCount}/${sector.members.length}家公司同方向`,
      };
    })
    .filter((item): item is SectorAnomaly => Boolean(item))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function assessCompany<T extends AnomalyCompany>(
  company: T,
  sectorIds: number[],
  baselines: Map<number, SectorBaseline<T>>,
  historicalProfile?: HistoricalVolatilityProfile,
): IndividualAnomalyAssessment | null {
  const quote = company.quote;
  const changePct = quote?.changePct;
  if (!quote || changePct == null) return null;
  const comparison = closestSector(changePct, sectorIds, baselines);
  if (!comparison) return null;
  const absChange = Math.abs(changePct);
  const absRelative = Math.abs(comparison.relativeMove);
  const volumeRatio = quote.volumeRatio ?? 0;
  const amplitude = intradayAmplitude(quote);
  const historicalZ = historicalProfile
    ? Math.abs(changePct - historicalProfile.median) / historicalProfile.robustSigma
    : null;
  const openingObservation = isOpeningObservation(quote.updatedAt);
  const extremePrice = absChange >= 7 && absRelative >= 5;
  const priceVolume = !openingObservation
    && absChange >= 4
    && absRelative >= 4
    && (volumeRatio >= 2 || amplitude >= 6 || (historicalZ ?? 0) >= 2.5);
  const volumeShock = !openingObservation
    && volumeRatio >= 4
    && amplitude >= 6
    && absRelative >= 2;
  if (!extremePrice && !priceVolume && !volumeShock) return null;
  const kind = extremePrice ? "extreme-price" : volumeShock ? "volume-shock" : "price-volume";
  const score = absRelative * 2 + absChange + Math.min(volumeRatio, 6) * 1.5 + amplitude + Math.min(historicalZ ?? 0, 5);
  return {
    kind,
    score,
    changePct,
    sectorId: comparison.baseline.sectorId,
    sectorName: comparison.baseline.sectorName,
    sectorShortName: comparison.baseline.sectorShortName,
    sectorMedian: comparison.baseline.median,
    relativeMove: comparison.relativeMove,
    volumeRatio,
    amplitude,
    historicalZ,
  };
}

function closestSector<T extends AnomalyCompany>(changePct: number, sectorIds: number[], baselines: Map<number, SectorBaseline<T>>) {
  return sectorIds
    .map((sectorId) => {
      const baseline = baselines.get(sectorId);
      return baseline ? { baseline, relativeMove: changePct - baseline.median } : null;
    })
    .filter((item): item is { baseline: SectorBaseline<T>; relativeMove: number } => Boolean(item))
    .sort((a, b) => Math.abs(a.relativeMove) - Math.abs(b.relativeMove))[0] ?? null;
}

function groupCompanies<T extends AnomalyCompany>(entries: T[]) {
  const groups = new Map<string, { company: T; sectorIds: Set<number> }>();
  for (const entry of entries) {
    const current = groups.get(entry.code) ?? { company: entry, sectorIds: new Set<number>() };
    current.sectorIds.add(entry.sectorId);
    if (!current.company.quote && entry.quote) current.company = entry;
    groups.set(entry.code, current);
  }
  return [...groups.values()].map((item) => ({ company: item.company, sectorIds: [...item.sectorIds] }));
}

function intradayAmplitude(quote: AnomalyQuote) {
  if (quote.high == null || quote.low == null || !quote.prevClose) return 0;
  return ((quote.high - quote.low) / quote.prevClose) * 100;
}

function isOpeningObservation(updatedAt?: string) {
  if (!updatedAt) return false;
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return false;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: "hour" | "minute") => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const minutes = value("hour") * 60 + value("minute");
  return minutes >= 9 * 60 + 30 && minutes < OPENING_OBSERVATION_END;
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
