const leaders = [
  { name: "寒武纪-U", code: "688256", sector: "算力芯片", price: "1,268.00", change: "+2.36%", tone: "up" },
  { name: "中际旭创", code: "300308", sector: "光模块", price: "518.20", change: "+1.84%", tone: "up" },
  { name: "英维克", code: "002837", sector: "液冷温控", price: "83.16", change: "-0.72%", tone: "down" },
  { name: "北方华创", code: "002371", sector: "半导体设备", price: "487.60", change: "+0.95%", tone: "up" },
];

const sectors = ["算力芯片", "存储互联", "AI 服务器", "光模块", "PCB", "网络设备", "液冷", "IDC", "电源", "云服务", "半导体设备", "半导体材料", "算力租赁"];

export default function Home() {
  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="算力图谱首页">
          <span className="brand-mark">算</span>
          <span>算力图谱</span>
          <em>COMPUTE CHAIN</em>
        </a>
        <nav aria-label="主导航">
          <a className="active" href="#overview">产业全景</a>
          <a href="#signals">异动雷达</a>
          <a href="#news">产业资讯</a>
          <a className="admin-link" href="/admin">管理标的</a>
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow"><span /> A股算力产业研究终端</p>
          <h1>从一颗芯片到一座智算中心，<br /><strong>看清真正的核心资产。</strong></h1>
          <p className="lede">追踪 13 个算力产业环节的产业核心与市场活跃龙头，把实时行情、异动证据和重要资讯放在同一张图谱里。</p>
          <div className="hero-actions">
            <a className="primary-button" href="#overview">浏览产业图谱 <span>↘</span></a>
            <span className="market-status"><i /> 已收盘 · 数据更新于 15:04</span>
          </div>
        </div>
        <div className="hero-metrics" aria-label="平台概览">
          <div><span>追踪标的</span><strong>64</strong><small>家 A 股公司</small></div>
          <div><span>产业环节</span><strong>13</strong><small>覆盖完整链条</small></div>
          <div><span>今日异动</span><strong>04</strong><small>2 条已匹配证据</small></div>
          <p>数据源状态 <b>3 / 3 正常</b></p>
        </div>
      </section>

      <section className="sector-strip" aria-label="产业方向">
        {sectors.map((sector, index) => <span key={sector}><b>{String(index + 1).padStart(2, "0")}</b>{sector}</span>)}
      </section>

      <section className="dashboard" id="overview">
        <div className="section-heading">
          <div><p className="eyebrow"><span /> CORE LEADERS</p><h2>产业核心标的</h2></div>
          <p>以产业地位为锚，叠加盘面变化。<br />入选逻辑按季度复核。</p>
        </div>
        <div className="leader-table" role="table" aria-label="产业核心标的行情">
          <div className="table-head" role="row"><span>公司 / 代码</span><span>产业环节</span><span>最新价</span><span>今日涨跌</span><span>近 5 日</span><span>状态</span></div>
          {leaders.map((leader, index) => (
            <a className="table-row" href={`/company/${leader.code}`} role="row" key={leader.code}>
              <span className="company-cell"><i>{index + 1}</i><b>{leader.name}<small>{leader.code}</small></b></span>
              <span><em className="sector-tag">{leader.sector}</em></span>
              <strong>¥ {leader.price}</strong>
              <span className={leader.tone}>{leader.change}</span>
              <span className="spark"><i style={{width: `${42 + index * 9}%`}} /></span>
              <span className="verified">产业核心</span>
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}
