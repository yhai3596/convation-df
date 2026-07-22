// 客服通道（T3.2：后台 settings 配置；未配置的通道自动隐藏）
// 键：support_phone / support_email_info / support_email_service / support_whatsapp
const { getSetting } = require('./db');

function supportChannels(locale) {
  const en = locale === 'en';
  const list = [];
  const phone = getSetting('support_phone', '');
  const info = getSetting('support_email_info', '');
  const svc = getSetting('support_email_service', '');
  const wa = getSetting('support_whatsapp', '');
  if (phone) list.push({ key: 'phone', label: en ? 'Phone' : 'Telefono', value: phone, href: 'tel:' + phone.replace(/\s+/g, '') });
  if (wa) list.push({ key: 'whatsapp', label: 'WhatsApp', value: wa, href: 'https://wa.me/' + wa.replace(/\D/g, '') });
  if (info) list.push({ key: 'email_info', label: en ? 'Email (info)' : 'Email (informazioni)', value: info, href: 'mailto:' + info });
  if (svc) list.push({ key: 'email_service', label: en ? 'Email (after-sales)' : 'Email (assistenza)', value: svc, href: 'mailto:' + svc });
  return list;
}

module.exports = { supportChannels };
