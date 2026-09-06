import type { Metadata } from "next";
import AdminConsole from "../components/AdminConsole";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"标的管理｜A股算力产业链核心标的跟踪",robots:{index:false,follow:false}};
export default function AdminPage(){return <AdminConsole/>}
