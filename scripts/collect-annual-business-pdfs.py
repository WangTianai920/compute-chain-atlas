#!/usr/bin/env python3
"""Download the latest full annual reports and extract their core-business pages."""

from __future__ import annotations

import concurrent.futures
import json
import re
import time
import urllib.request
import urllib.parse
from pathlib import Path

from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "data/research/2026-08-31-cross-sector-review.json"
OVERRIDES = json.loads((ROOT / "data/research/2026-09-01-annual-disclosure-overrides.json").read_text())
LIST_CACHE = ROOT / "tmp/pdfs/annual-business-api-cache"
PDF_DIR = ROOT / "tmp/pdfs/annual-reports"
OUTPUT = ROOT / "docs/research/2026-09-01-annual-business-pdf-extracts.json"
PDF_DIR.mkdir(parents=True, exist_ok=True)


def is_full_annual_report(title: str) -> bool:
    if re.search(r"半年度|摘要|英文|审计报告|问询|回复|取消审核|H股公告", title):
        return False
    return bool(re.search(r"20\d{2}\s*年?年度报告(?:全文)?\s*(?:[（(](?:更正后|修订版)[）)])?\s*$", title))


def eastmoney_report(code: str):
    candidates = []
    for path in sorted(LIST_CACHE.glob(f"{code}-list-*.json")):
        try:
            candidates.extend(json.loads(path.read_text()).get("data", {}).get("list", []))
        except (OSError, json.JSONDecodeError):
            continue
    matches = [item for item in candidates if is_full_annual_report(item.get("title", ""))]
    if not matches:
        return None
    return max(matches, key=lambda item: (item.get("notice_date", ""), item.get("art_code", "")))


def cninfo_report(code: str, name: str):
    cache_path = LIST_CACHE / f"{code}-cninfo-annual-v2.json"
    if cache_path.exists():
        payload = json.loads(cache_path.read_text())
    else:
        column = "bse" if code.startswith(("8", "9")) else "sse"
        form = urllib.parse.urlencode({
            "pageNum": "1", "pageSize": "30", "column": column, "tabName": "fulltext",
            "plate": "bj" if column == "bse" else "sh", "stock": "",
            "searchkey": f"{re.sub(r'-[WU].*$', '', name)} 2025年年度报告", "secid": "",
            "category": "category_ndbg_szsh", "trade": "", "seDate": "2025-01-01~2026-09-01",
            "sortName": "", "sortType": "", "isHLtitle": "true",
        }).encode()
        request = urllib.request.Request(
            "https://www.cninfo.com.cn/new/hisAnnouncement/query",
            data=form,
            headers={"User-Agent": "Mozilla/5.0", "Referer": "https://www.cninfo.com.cn/", "X-Requested-With": "XMLHttpRequest"},
        )
        with urllib.request.urlopen(request, timeout=40) as response:
            payload = json.load(response)
        cache_path.write_text(json.dumps(payload, ensure_ascii=False) + "\n")
        time.sleep(0.35)
    candidates = []
    for item in payload.get("announcements") or []:
        title = re.sub(r"</?em>", "", item.get("announcementTitle", ""))
        if item.get("secCode") == code and is_full_annual_report(title):
            candidates.append({
                "art_code": item.get("announcementId", ""), "title": title,
                "notice_date": str(item.get("announcementTime", "")),
                "source_url": "https://static.cninfo.com.cn/" + item.get("adjunctUrl", ""),
            })
    return max(candidates, key=lambda item: (item.get("notice_date", ""), item.get("art_code", ""))) if candidates else None


def latest_report(code: str, name: str):
    return OVERRIDES.get(code) or eastmoney_report(code) or cninfo_report(code, name)


def pdf_url(report) -> str:
    return report.get("source_url") or f"https://pdf.dfcfw.com/pdf/H2_{report['art_code']}_1.pdf"


def download(item):
    code, report = item
    path = PDF_DIR / f"{code}-{report['art_code']}.pdf"
    if path.exists() and path.stat().st_size > 50_000:
        return code, report, path, "cached"
    request = urllib.request.Request(
        pdf_url(report),
        headers={"User-Agent": "Mozilla/5.0", "Referer": "https://data.eastmoney.com/"},
    )
    error = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                data = response.read()
            if len(data) < 50_000 or not data.startswith(b"%PDF"):
                raise ValueError(f"invalid PDF ({len(data)} bytes)")
            path.write_bytes(data)
            return code, report, path, "downloaded"
        except Exception as exc:  # the caller records the concrete failure
            error = exc
            time.sleep(2 + attempt * 3)
    raise RuntimeError(f"{code}: {error}")


BUSINESS_MARKERS = (
    "发行人主营业务情况",
    "主营业务概况",
    "主营业务基本情况",
    "主要产品及服务",
    "公司是一家以数据中心高效冷却技术为核心",
    "公司的主营业务涵盖",
    "报告期内公司所从事的主要业务",
    "报告期内公司从事的主要业务",
    "报告期内公司从事的业务情况",
    "主要业务、主要产品或服务情况",
    "公司主要业务及经营模式",
    "公司的主要业务及经营模式",
    "公司的主营业务",
    "公司主要业务",
    "主要业务及经营模式",
)
NEXT_HEADINGS = re.compile(r"\n\s*[二三四五六七八九十]+[、.]\s*[^\n]{2,35}")


def normalize(text: str) -> str:
    text = text.replace("\x00", "").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def extract_business(path: Path):
    reader = PdfReader(str(path))
    page_texts = []
    found_page = None
    # Core-business disclosure is normally near the front of management discussion.
    for index, page in enumerate(reader.pages[:120]):
        try:
            text = normalize(page.extract_text() or "")
        except Exception:
            text = ""
        page_texts.append(text)
        if found_page is None:
            for marker in BUSINESS_MARKERS:
                position = text.find(marker)
                if position < 0:
                    continue
                nearby = text[position : position + 700]
                if nearby.count(".") > 30 or nearby.count("…") > 15:
                    continue
                found_page = index
                break
        if found_page is not None and index >= found_page + 10:
            break
    if found_page is None:
        return {"status": "section_not_found", "pageCount": len(reader.pages), "pagesRead": len(page_texts)}
    combined = "\n\n".join(page_texts[found_page : found_page + 11])
    positions = [combined.find(marker) for marker in BUSINESS_MARKERS if marker in combined]
    start = min(position for position in positions if position >= 0)
    section = combined[start:]
    next_heading = NEXT_HEADINGS.search(section[1600:])
    if next_heading:
        section = section[: 1600 + next_heading.start()]
    section = normalize(section)[:12_000]
    return {
        "status": "extracted",
        "pageCount": len(reader.pages),
        "pagesRead": len(page_texts),
        "sectionPage": found_page + 1,
        "sectionText": section,
    }


def main():
    companies = json.loads(CATALOG.read_text())["companyAudit"]
    reports = []
    for index, company in enumerate(companies, 1):
        try:
            report = latest_report(company["code"], company["name"])
        except Exception as error:
            print(f"manifest {index}/{len(companies)} {company['code']} failed: {error}", flush=True)
            report = None
        reports.append((company["code"], report))
    known = [(code, report) for code, report in reports if report]
    results_by_code = {}
    if OUTPUT.exists():
        previous = json.loads(OUTPUT.read_text()).get("records", [])
        results_by_code = {item["code"]: item for item in previous if item.get("status") == "extracted"}
    pending = [(code, report) for code, report in known if code not in results_by_code]
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        futures = {executor.submit(download, item): item[0] for item in pending}
        for count, future in enumerate(concurrent.futures.as_completed(futures), 1):
            code = futures[future]
            try:
                result_code, report, path, fetch_status = future.result()
                extracted = extract_business(path)
                results_by_code[result_code] = {
                    "code": result_code,
                    "reportYear": report.get("report_year") or (re.search(r"(20\d{2})\s*年?年度报告", report.get("title", "")) or ["", ""])[1],
                    "reportTitle": report.get("title", ""),
                    "publishedAt": str(report.get("notice_date", ""))[:10],
                    "artCode": report.get("art_code", ""),
                    "sourceType": report.get("source_type", "annual_report"),
                    "sourceUrl": pdf_url(report),
                    "fetchStatus": fetch_status,
                    **extracted,
                }
            except Exception as error:
                results_by_code[code] = {"code": code, "status": "failed", "error": str(error)}
            print(f"{count}/{len(pending)} {code} {results_by_code[code]['status']}", flush=True)

    records = []
    for company in companies:
        record = results_by_code.get(company["code"], {"code": company["code"], "status": "report_not_found"})
        records.append({"name": company["name"], **record})
    payload = {
        "reviewedAt": "2026-09-01",
        "method": "Latest full annual-report PDF; core-business section from management discussion",
        "records": records,
    }
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({
        "outputPath": str(OUTPUT),
        "total": len(records),
        "extracted": sum(item["status"] == "extracted" for item in records),
        "unresolved": sum(item["status"] != "extracted" for item in records),
    }, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
