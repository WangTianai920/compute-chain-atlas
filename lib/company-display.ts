export type CompanyMappingLike = {
  code: string;
  sectorId: number;
  sectorSlug: string;
  sectorName: string;
  sectorShortName: string;
  role: "core" | "candidate";
};

export type CompanySectorBadge = Pick<CompanyMappingLike, "sectorId" | "sectorSlug" | "sectorName" | "sectorShortName" | "role">;
export type MergedCompany<T extends CompanyMappingLike> = T & { sectors: CompanySectorBadge[] };

// The market API intentionally returns one row per company-sector mapping so
// sector statistics remain accurate. The overview table is company-oriented,
// therefore it merges those rows at the display boundary.
export function mergeCompanyMappings<T extends CompanyMappingLike>(mappings: T[]): MergedCompany<T>[] {
  const byCode = new Map<string, MergedCompany<T>>();
  for (const mapping of mappings) {
    const sector = {
      sectorId: mapping.sectorId,
      sectorSlug: mapping.sectorSlug,
      sectorName: mapping.sectorName,
      sectorShortName: mapping.sectorShortName,
      role: mapping.role,
    };
    const current = byCode.get(mapping.code);
    if (!current) {
      byCode.set(mapping.code, { ...mapping, sectors: [sector] });
      continue;
    }
    if (!current.sectors.some(item => item.sectorId === sector.sectorId)) current.sectors.push(sector);
  }
  return [...byCode.values()];
}

export function balanceSectorRows<T>(items: T[], maxPerRow = 3): T[][] {
  if (items.length <= 2) return items.length ? [items] : [];
  const rowCount = Math.max(2, Math.ceil(items.length / maxPerRow));
  const baseSize = Math.floor(items.length / rowCount);
  const fullerRows = items.length % rowCount;
  const rows: T[][] = [];
  let cursor = 0;
  for (let index = 0; index < rowCount; index += 1) {
    // Allocate any remainder to the bottom rows so odd counts form 1+2,
    // 2+3, or 2+2+3 instead of leaving the last row visually sparse.
    const size = baseSize + (index >= rowCount - fullerRows ? 1 : 0);
    rows.push(items.slice(cursor, cursor + size));
    cursor += size;
  }
  return rows;
}

export function summarizeSectorMappings<T extends { role: "core" | "candidate" }>(items: T[], visibleCount = 1) {
  const limit = Math.max(0, Math.floor(visibleCount));
  const prioritized = items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const roleDifference = Number(right.item.role === "core") - Number(left.item.role === "core");
      return roleDifference || left.index - right.index;
    })
    .map(({ item }) => item);
  return { visible: prioritized.slice(0, limit), hiddenCount: Math.max(0, items.length - limit) };
}
