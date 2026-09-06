import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const sectors = sqliteTable("sectors", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull(), name: text("name").notNull(), shortName: text("short_name").notNull(),
  description: text("description").notNull().default(""), sortOrder: integer("sort_order").notNull().default(0),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
}, (table) => [uniqueIndex("idx_sectors_slug").on(table.slug), index("idx_sectors_sort_order").on(table.sortOrder)]);

export const companies = sqliteTable("companies", {
  id: integer("id").primaryKey({ autoIncrement: true }), code: text("code").notNull(), name: text("name").notNull(),
  exchange: text("exchange").notNull(), thesis: text("thesis").notNull().default(""),
  nameEn: text("name_en").notNull().default(""), thesisEn: text("thesis_en").notNull().default(""),
  enSourceUrl: text("en_source_url").notNull().default(""), enStatus: text("en_status").notNull().default("pending"),
  enUpdatedAt: text("en_updated_at"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("idx_companies_code").on(table.code), index("idx_companies_active").on(table.active)]);

export const companySectors = sqliteTable("company_sectors", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyId: integer("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  sectorId: integer("sector_id").notNull().references(() => sectors.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["core", "candidate"] }).notNull(), rationale: text("rationale").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("idx_company_sectors_unique").on(table.companyId, table.sectorId), index("idx_company_sectors_sector_role").on(table.sectorId, table.role)]);

export const runtimeSnapshots = sqliteTable("runtime_snapshots", {
  cacheKey: text("cache_key").primaryKey(),
  payload: text("payload").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
