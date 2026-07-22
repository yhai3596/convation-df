// 诊断报告邮件（可选）：配置 SMTP_HOST/SMTP_USER/SMTP_PASS 后启用；未配置时静默跳过，
// 提交记录始终入库，管理后台可查看。
const nodemailer = require('nodemailer');

const HOST = process.env.SMTP_HOST || '';
const USER = process.env.SMTP_USER || '';
const PASS = process.env.SMTP_PASS || '';
const PORT = Number(process.env.SMTP_PORT || 465);
const FROM = process.env.SMTP_FROM || USER;
const SITE_URL = process.env.SITE_URL || 'https://geopro.cc';

function enabled() { return !!(HOST && USER && PASS); }

let transport = null;
if (enabled()) {
  transport = nodemailer.createTransport({
    host: HOST, port: PORT, secure: PORT === 465,
    auth: { user: USER, pass: PASS },
  });
}

function reportHtml(company, report) {
  const spotRows = report.integrationPoints.map((s, i) => `<tr><td style="padding:6px 10px;border-bottom:1px solid #e5e2de;color:#7d5411;font-size:13px">${String(i + 1).padStart(2, '0')}</td><td style="padding:6px 10px;border-bottom:1px solid #e5e2de;font-size:14px">${s}</td></tr>`).join('');
  const stageRows = report.stages.map(st => `<tr><td style="padding:8px 10px;border-bottom:1px solid #e5e2de;white-space:nowrap;font-size:13px;color:#7d5411">${st.name}<br><span style="color:#9b9797">${st.window}</span></td><td style="padding:8px 10px;border-bottom:1px solid #e5e2de;font-size:14px;line-height:1.7">${st.desc}${st.note ? `<br><span style="color:#7d7979">${st.note}</span>` : ''}</td></tr>`).join('');
  return `<div style="max-width:640px;margin:0 auto;font-family:Georgia,'Noto Serif SC','Songti SC',serif;color:#201f1d;background:#f3f2f2;padding:32px 28px">
  <p style="font-size:22px;margin:0">Alan<span style="color:#b68235">.</span> <span style="font-size:11px;letter-spacing:2px;color:#7d7979">HVAC × AI</span></p>
  <h1 style="font-weight:400;font-size:26px;margin:24px 0 4px">${company} · 企业 AI 诊断报告</h1>
  <p style="font-size:13px;color:#7d7979;margin:0 0 20px">由 Hermes Agent 生成 · Alan 审核口径</p>
  <table style="width:100%;border-collapse:collapse;margin:0 0 20px"><tr>
    <td style="border:1px solid #d7d3d3;padding:14px"><div style="font-size:11px;color:#7d7979;text-transform:uppercase;letter-spacing:1px">AI 成熟度</div><div style="font-size:30px;color:#b68235">${report.level} / L5</div><div style="font-size:12px;color:#7d7979">${report.levelDesc}</div></td>
    <td style="border:1px solid #d7d3d3;padding:14px"><div style="font-size:11px;color:#7d7979;text-transform:uppercase;letter-spacing:1px">AI 结合点</div><div style="font-size:30px">${report.spots} 处</div><div style="font-size:12px;color:#7d7979">围绕「${report.focus}」</div></td>
    <td style="border:1px solid #d7d3d3;padding:14px"><div style="font-size:11px;color:#7d7979;text-transform:uppercase;letter-spacing:1px">推进路径</div><div style="font-size:30px">3 阶段</div><div style="font-size:12px;color:#7d7979">12 个月路线图</div></td>
  </tr></table>
  <div style="border-left:3px solid #b68235;background:#f8f4f4;padding:14px 16px;font-size:14px;line-height:1.8;margin-bottom:24px">${report.summary}</div>
  <h2 style="font-weight:400;font-size:19px;margin:0 0 8px">AI 结合点清单</h2>
  <table style="width:100%;border-collapse:collapse;margin-bottom:24px">${spotRows}</table>
  <h2 style="font-weight:400;font-size:19px;margin:0 0 8px">三阶段推进路径</h2>
  <table style="width:100%;border-collapse:collapse;margin-bottom:24px">${stageRows}</table>
  <p style="font-size:14px">建议预约一次一对一解读，把报告翻译成可立刻启动的第一步：<a href="${SITE_URL}/about" style="color:#b68235">联系 Alan →</a></p>
  <p style="font-size:12px;color:#9b9797;border-top:1px solid #d7d3d3;padding-top:14px;margin-top:24px">© Alan · HVAC × AI · ${SITE_URL}</p>
</div>`;
}

async function sendDiagnosisReport(to, company, report) {
  if (!enabled()) return false;
  try {
    await transport.sendMail({
      from: `"Alan · HVAC × AI" <${FROM}>`,
      to,
      subject: `${company} · 企业 AI 诊断报告`,
      html: reportHtml(company, report),
    });
    return true;
  } catch (e) {
    console.warn('[mailer] 发送失败：', e.message);
    return false;
  }
}

module.exports = { enabled, sendDiagnosisReport };
