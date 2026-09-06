import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CompanyDetail from "../../components/CompanyDetail";
import { getCompanyRecord } from "../../../lib/data";
export const dynamic="force-dynamic";
export async function generateMetadata({params}:{params:Promise<{code:string}>}):Promise<Metadata>{const{code}=await params;const c=await getCompanyRecord(code);if(!c)return{title:"未找到标的｜A股算力产业链核心标的跟踪",robots:{index:false}};const description=`${c.name}（${c.code}）算力产业地位、主营业务、近三年收入与归母净利润、实时行情及重要资讯。`;return{title:`${c.name} ${c.code}｜A股算力产业链核心标的跟踪`,description,openGraph:{title:`${c.name} ${c.code}｜A股算力产业链核心标的跟踪`,description,images:[]},twitter:{card:"summary",title:`${c.name} ${c.code}｜A股算力产业链核心标的跟踪`,description,images:[]}}}
export default async function CompanyPage({params}:{params:Promise<{code:string}>}){const{code}=await params;const company=await getCompanyRecord(code);if(!company)notFound();return <CompanyDetail initialCompany={company}/>}
