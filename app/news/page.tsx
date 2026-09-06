import type { Metadata } from "next";
import HomeDashboard from "../components/HomeDashboard";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"产业资讯｜A股算力产业链核心标的跟踪",description:"近三日算力产业链相关公开财经资讯与原文入口。"};
export default function NewsPage(){return <HomeDashboard view="news"/>}
