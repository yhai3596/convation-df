// Convation 站点文案注册表：每键 .it/.en 双语（bi 助手成对生成），图片键不分语言。
// 默认值 = DESIGN.md 定稿文案；后台「页面内容」改哪条哪条生效（引擎见 content.js）。
const T = 'text';
const TA = 'textarea';
const IMG = 'image';

function bi(key, group, label, type, it, en) {
  return [
    { key: `${key}.it`, group, label: `${label} · IT`, type, def: it },
    { key: `${key}.en`, group, label: `${label} · EN`, type, def: en },
  ];
}

const REGISTRY = [
  // —— 首页 · Hero ——
  ...bi('home.hero_title', '首页', 'Hero 主标题（换行分行）', TA,
    'Climatizzazione e pompe di calore,\ninstallate a regola d\'arte.',
    'Air conditioning and heat pumps,\ninstalled the right way.'),
  ...bi('home.hero_body', '首页', 'Hero 副文案', TA,
    'Convation seleziona, installa e assiste climatizzatori e pompe di calore dei migliori marchi — per la casa e per l\'impresa. Tecnici certificati, garanzia reale, assistenza che risponde.',
    'Convation selects, installs and services air conditioners and heat pumps from leading brands — for homes and businesses. Certified technicians, real warranties, support that answers.'),
  ...bi('home.cta_quote', '首页', 'CTA 主按钮', T, 'Richiedi un preventivo', 'Request a quote'),
  ...bi('home.cta_ai', '首页', 'CTA 次按钮（AI 助理）', T, 'Chiedi all\'assistente AI', 'Ask our AI assistant'),

  // —— 首页 · 数字条（真实数值待用户确认，见素材催收清单）——
  ...bi('home.stat1_value', '首页', '数字1 · 值', T, '15+', '15+'),
  ...bi('home.stat1_label', '首页', '数字1 · 说明', T, 'anni di esperienza', 'years of experience'),
  ...bi('home.stat2_value', '首页', '数字2 · 值', T, '2.500', '2,500'),
  ...bi('home.stat2_label', '首页', '数字2 · 说明', T, 'impianti installati', 'systems installed'),
  ...bi('home.stat3_value', '首页', '数字3 · 值', T, '12', '12'),
  ...bi('home.stat3_label', '首页', '数字3 · 说明', T, 'marchi trattati', 'brands carried'),
  ...bi('home.stat4_value', '首页', '数字4 · 值', T, '24h', '24h'),
  ...bi('home.stat4_label', '首页', '数字4 · 说明', T, 'tempo medio di risposta', 'average response time'),

  // —— 首页 · 服务三卡 ——
  ...bi('home.svc1_title', '首页', '服务1 · 标题', T, 'Vendita', 'Sales'),
  ...bi('home.svc1_body', '首页', '服务1 · 介绍', TA,
    'Climatizzatori e pompe di calore dei marchi che installiamo ogni giorno: ti aiutiamo a scegliere il modello giusto per i tuoi spazi e i tuoi consumi.',
    'Air conditioners and heat pumps from the brands we install every day: we help you choose the right model for your spaces and consumption.'),
  ...bi('home.svc2_title', '首页', '服务2 · 标题', T, 'Installazione', 'Installation'),
  ...bi('home.svc2_body', '首页', '服务2 · 介绍', TA,
    'Sopralluogo, dimensionamento e posa a regola d\'arte da tecnici certificati F-Gas. Ogni impianto viene collaudato e consegnato funzionante.',
    'Site survey, sizing and workmanlike installation by F-Gas certified technicians. Every system is tested and delivered up and running.'),
  ...bi('home.svc3_title', '首页', '服务3 · 标题', T, 'Assistenza', 'Service'),
  ...bi('home.svc3_body', '首页', '服务3 · 介绍', TA,
    'Manutenzione programmata, ricambi originali e interventi rapidi in garanzia e fuori garanzia. Un canale diretto, senza call center infiniti.',
    'Scheduled maintenance, original spare parts and fast repairs in and out of warranty. One direct channel, no endless call centers.'),

  // —— 首页 · 产品两类 ——
  ...bi('home.prod1_title', '首页', '产品1 · 标题', T, 'Climatizzatori', 'Air conditioners'),
  ...bi('home.prod1_body', '首页', '产品1 · 介绍', TA,
    'Mono e multi split ad alta efficienza, silenziosi e con gas R32. Per raffrescare e riscaldare casa, ufficio e negozio.',
    'High-efficiency mono and multi splits, quiet and running on R32. To cool and heat homes, offices and shops.'),
  ...bi('home.prod2_title', '首页', '产品2 · 标题', T, 'Pompe di calore', 'Heat pumps'),
  ...bi('home.prod2_body', '首页', '产品2 · 介绍', TA,
    'Riscaldamento, raffrescamento e acqua calda sanitaria con una sola macchina. La strada maestra per tagliare la bolletta e accedere agli incentivi.',
    'Heating, cooling and domestic hot water from a single unit. The main road to lower bills and incentive eligibility.'),
  { key: 'home.prod1_img', group: '首页', label: '产品1 · 图片', type: IMG, def: '' },
  { key: 'home.prod2_img', group: '首页', label: '产品2 · 图片', type: IMG, def: '' },

  // —— 首页 · 为什么选我们（深色带）——
  ...bi('home.why_title', '首页', 'Why 标题', T, 'Perché scegliere Convation', 'Why choose Convation'),
  ...bi('home.why_body', '首页', 'Why 介绍', TA,
    'Siamo un\'azienda registrata in Italia, specializzata in climatizzazione: vendiamo solo ciò che sappiamo installare e assistiamo tutto ciò che vendiamo.',
    'We are a company registered in Italy, specialised in HVAC: we only sell what we know how to install, and we service everything we sell.'),

  // —— 首页 · Detrazioni 导流条 ——
  ...bi('home.detra_title', '首页', 'Detrazioni · 标题', T,
    'Detrazioni e incentivi: paga meno il tuo nuovo impianto',
    'Tax incentives: pay less for your new system'),
  ...bi('home.detra_body', '首页', 'Detrazioni · 介绍', TA,
    'Conto Termico, detrazioni fiscali e incentivi per pompe di calore e climatizzatori: ti spieghiamo cosa spetta a te e prepariamo le carte giuste.',
    'Conto Termico, tax deductions and incentives for heat pumps and air conditioners: we explain what you are entitled to and prepare the right paperwork.'),

  // —— 首页 · 案例三卡 ——
  ...bi('home.case1_title', '首页', '案例1 · 标题', T, 'Villetta bifamiliare — pompa di calore', 'Two-family house — heat pump'),
  ...bi('home.case1_place', '首页', '案例1 · 地点', T, 'Lombardia', 'Lombardy'),
  ...bi('home.case2_title', '首页', '案例2 · 标题', T, 'Appartamento — multi split a parete', 'Apartment — wall-mounted multi split'),
  ...bi('home.case2_place', '首页', '案例2 · 地点', T, 'Milano', 'Milan'),
  ...bi('home.case3_title', '首页', '案例3 · 标题', T, 'Ufficio — climatizzazione commerciale', 'Office — commercial air conditioning'),
  ...bi('home.case3_place', '首页', '案例3 · 地点', T, 'Torino', 'Turin'),
  { key: 'home.case1_img', group: '首页', label: '案例1 · 照片', type: IMG, def: '' },
  { key: 'home.case2_img', group: '首页', label: '案例2 · 照片', type: IMG, def: '' },
  { key: 'home.case3_img', group: '首页', label: '案例3 · 照片', type: IMG, def: '' },

  // —— 首页 · AI 助理 + FAQ ——
  ...bi('home.ai_title', '首页', 'AI 区 · 标题', T, 'Una domanda? Chiedi, anche alle 23:00', 'A question? Ask — even at 11 pm'),
  ...bi('home.ai_body', '首页', 'AI 区 · 介绍', TA,
    'Il nostro assistente AI risponde subito su prodotti, installazione, incentivi e assistenza. Quando serve, passa la conversazione a una persona vera.',
    'Our AI assistant answers right away about products, installation, incentives and service. When needed, it hands the conversation to a real person.'),
  ...bi('home.faq1_q', '首页', 'FAQ1 · 问', T, 'Quanto costa installare un climatizzatore?', 'How much does it cost to install an air conditioner?'),
  ...bi('home.faq1_a', '首页', 'FAQ1 · 答', TA,
    'Dipende da modello, numero di unità e lavori necessari. Con un sopralluogo (o qualche foto) ti diamo un preventivo chiaro e senza sorprese.',
    'It depends on the model, number of units and the work required. With a site survey (or a few photos) we give you a clear quote with no surprises.'),
  ...bi('home.faq2_q', '首页', 'FAQ2 · 问', T, 'La pompa di calore conviene davvero?', 'Is a heat pump really worth it?'),
  ...bi('home.faq2_a', '首页', 'FAQ2 · 答', TA,
    'Nella maggior parte delle case sì: consuma meno di una caldaia tradizionale e accede agli incentivi. Ti aiutiamo a fare i conti sul tuo caso reale.',
    'In most homes, yes: it uses less energy than a traditional boiler and qualifies for incentives. We help you run the numbers on your actual case.'),
  ...bi('home.faq3_q', '首页', 'FAQ3 · 问', T, 'Fate anche la manutenzione?', 'Do you also handle maintenance?'),
  ...bi('home.faq3_a', '首页', 'FAQ3 · 答', TA,
    'Sì: manutenzione programmata, sanificazione e interventi su guasto, anche su impianti non installati da noi.',
    'Yes: scheduled maintenance, sanitisation and breakdown repairs — including systems we did not install.'),

  // —— 首页 · 联系速通条 ——
  ...bi('home.contact_title', '首页', '联系条 · 标题', T, 'Parliamone: preventivo gratuito in 24 ore', 'Let\'s talk: free quote within 24 hours'),
  ...bi('home.contact_body', '首页', '联系条 · 介绍', TA,
    'Chiamaci, scrivici su WhatsApp o lascia i tuoi contatti: un tecnico ti richiama, non un centralino.',
    'Call us, message us on WhatsApp or leave your details: a technician calls you back, not a switchboard.'),

  // —— Prodotti 页 ——
  ...bi('prodotti.intro_title', '产品页', '页首标题', T,
    'Prodotti selezionati, installati e garantiti',
    'Products selected, installed and guaranteed'),
  ...bi('prodotti.intro_body', '产品页', '页首介绍', TA,
    'Trattiamo solo marchi con ricambi disponibili e reti di assistenza reali. Ogni prodotto che vendiamo è un prodotto che sappiamo installare e riparare.',
    'We only carry brands with available spare parts and real service networks. Every product we sell is a product we know how to install and repair.'),
  ...bi('prodotti.cat1_body', '产品页', '空调类 · 介绍', TA,
    'Dal mono split per la camera da letto all\'impianto canalizzato per l\'ufficio: soluzioni silenziose ed efficienti, dimensionate sui tuoi spazi reali.',
    'From a single split for the bedroom to a ducted system for the office: quiet, efficient solutions sized on your actual spaces.'),
  ...bi('prodotti.cat1_points', '产品页', '空调类 · 要点（每行一条）', TA,
    'Mono e multi split per casa, ufficio e negozio\nUnità a parete, a cassetta e canalizzate\nGas R32, classe energetica fino ad A+++\nFunzione pompa di calore per il riscaldamento',
    'Mono and multi splits for homes, offices and shops\nWall-mounted, cassette and ducted units\nR32 refrigerant, energy class up to A+++\nHeat-pump function for winter heating'),
  ...bi('prodotti.cat2_body', '产品页', '热泵类 · 介绍', TA,
    'La pompa di calore aria-acqua sostituisce la caldaia: riscalda, raffresca e produce acqua calda sanitaria con un\'unica macchina, tagliando i consumi.',
    'An air-to-water heat pump replaces the boiler: it heats, cools and produces domestic hot water with a single unit, cutting consumption.'),
  ...bi('prodotti.cat2_points', '产品页', '热泵类 · 要点（每行一条）', TA,
    'Aria-acqua per riscaldamento e acqua calda sanitaria\nMonoblocco e split, anche in ristrutturazione\nCompatibili con fotovoltaico e sistemi ibridi\nAccesso a Conto Termico e detrazioni fiscali',
    'Air-to-water for heating and domestic hot water\nMonobloc and split, also for renovations\nCompatible with photovoltaics and hybrid systems\nEligible for Conto Termico and tax deductions'),
  ...bi('prodotti.acc_body', '产品页', '配件 · 介绍（预留）', TA,
    'In arrivo: staffe, canaline, comandi wi-fi e componenti per l\'installazione a regola d\'arte.',
    'Coming soon: brackets, trunking, wi-fi controls and components for workmanlike installation.'),
  ...bi('prodotti.brands_note', '产品页', '品牌区 · 说明', TA,
    'L\'elenco completo dei marchi e i listini sono in preparazione. Sei un installatore? Registrati per ricevere cataloghi e prezzi riservati.',
    'The full brand list and price lists are being prepared. Are you an installer? Register to receive catalogues and trade prices.'),
  ...bi('prodotti.cta_title', '产品页', '页尾 CTA · 标题', T,
    'Non sai quale scegliere?', 'Not sure which one to choose?'),
  ...bi('prodotti.cta_body', '产品页', '页尾 CTA · 介绍', TA,
    'Raccontaci i tuoi spazi e le tue abitudini: ti proponiamo il modello giusto, con un preventivo chiaro e senza sorprese.',
    'Tell us about your spaces and habits: we suggest the right model, with a clear quote and no surprises.'),
  { key: 'prodotti.cat1_img', group: '产品页', label: '空调类 · 图片', type: IMG, def: '' },
  { key: 'prodotti.cat2_img', group: '产品页', label: '热泵类 · 图片', type: IMG, def: '' },
];

module.exports = { REGISTRY };
