import type { Metadata } from "next";
import HomeDashboard from "../components/HomeDashboard";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"异动雷达｜A股算力产业链核心标的跟踪",description:"追踪算力产业链重点A股公司的显著盘面异动与可核验相关文章。"};
export default function SignalsPage(){return <HomeDashboard view="signals"/>}
