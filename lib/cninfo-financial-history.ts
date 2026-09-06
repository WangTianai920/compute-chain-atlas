// Manually checked against the quarterly tables in the original CNINFO PDFs.
// Amounts are CNY, not ten-thousand CNY. Preserve the document's revenue label.
export const cninfoFinancialHistory = [
  {
    code: "688652", name: "京仪装备", year: 2023, page: 9,
    url: "https://dataclouds.cninfo.com.cn/shgonggao/2024/2024-04-24/7555c713017511ef8d7ffa163e26e5de.pdf",
    publishedAt: "2024-04-24", verifiedAt: "2026-08-31",
    quarters: [
      { revenue: 181034898.78, parentNetProfit: 24171417.81, operatingCashFlow: -92625837.07 },
      { revenue: 249074545.69, parentNetProfit: 53991475.36, operatingCashFlow: 157119359.54 },
      { revenue: 174060121.84, parentNetProfit: 38622018.14, operatingCashFlow: 13931510.66 },
      { revenue: 138113582.34, parentNetProfit: 2350579.05, operatingCashFlow: -37335605.34 },
    ],
  },
  {
    code: "688702", name: "盛科通信", year: 2023, page: 11,
    url: "https://dataclouds.cninfo.com.cn/shgonggao/2024/2024-04-25/076cbd19022d11efa859fa163e26e5de.pdf",
    publishedAt: "2024-04-25", verifiedAt: "2026-08-31",
    quarters: [
      { revenue: 294348855.60, parentNetProfit: 15668688.19, operatingCashFlow: 198381038.28 },
      { revenue: 349008559.21, parentNetProfit: 19789353.03, operatingCashFlow: -16636279.82 },
      { revenue: 233933075.90, parentNetProfit: 8029371.02, operatingCashFlow: -259417110.30 },
      { revenue: 160125514.34, parentNetProfit: -63018192.43, operatingCashFlow: -185598120.50 },
    ],
  },
] as const;
