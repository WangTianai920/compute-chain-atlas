import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import LanguageProvider from "./components/LanguageProvider";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const image = `${protocol}://${host}/og.png`;
  return {
    title: "A股算力产业链核心标的跟踪",
    description: "以细分市场份额和产业地位为基础，追踪算力产业链重点A股公司的行情变化、异动证据与相关新闻。",
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: { title: "A股算力产业链核心标的跟踪", description: "算力产业链重点上市公司监测。", type: "website", images: [{ url: image, width: 1200, height: 630, alt: "A股算力产业链核心标的跟踪" }] },
    twitter: { card: "summary_large_image", title: "A股算力产业链核心标的跟踪", description: "算力产业链重点上市公司监测。", images: [image] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN" suppressHydrationWarning><body><LanguageProvider>{children}</LanguageProvider></body></html>;
}
