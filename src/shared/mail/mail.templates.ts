interface EmailLayout {
  preheader: string;
  eyebrow: string;
  title: string;
  description: string;
  content?: string;
  actionLabel: string;
  actionUrl: string;
  note: string;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character] ?? character;
  });
}

// Palette: Mindy-FE docs/pallete3.png (#355872, #7aaace, #9cd5ff, #f7f8f0).
// Table layout and inline styles also work in email clients that strip stylesheets.
function renderEmail(layout: EmailLayout): string {
  const actionUrl = escapeHtml(layout.actionUrl);
  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>${escapeHtml(layout.title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f7f8f0;color:#355872;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
  <div style="display:none;font-size:1px;color:#f7f8f0;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(layout.preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f7f8f0;">
    <tr><td align="center" style="padding:32px 12px;">
      <!--[if mso]><table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;">
        <tr><td style="padding:0 12px 24px;">
          <span style="font-size:34px;line-height:1.2;font-weight:700;letter-spacing:-0.7px;color:#355872;">Mindycoding<span style="color:#9cd5ff;">.</span></span>
          <span style="display:block;margin-top:5px;font-size:11px;letter-spacing:2px;color:#355872;">LEARN. GROW. TOGETHER.</span>
        </td></tr>
        <tr><td style="background-color:#ffffff;border:1px solid #9cd5ff;border-top:4px solid #7aaace;border-radius:12px;padding:32px 24px;">
          <p style="margin:0 0 14px;font-size:14px;line-height:1.5;font-weight:700;letter-spacing:1px;color:#355872;">${escapeHtml(layout.eyebrow)}</p>
          <h1 style="margin:0 0 16px;font-size:28px;line-height:1.3;letter-spacing:-0.6px;font-weight:700;">${escapeHtml(layout.title)}</h1>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.75;color:#355872;">${escapeHtml(layout.description)}</p>
          ${layout.content ?? ''}
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px;">
            <tr><td align="center" bgcolor="#355872" style="border-radius:8px;mso-padding-alt:16px 24px;">
              <a href="${actionUrl}" style="display:inline-block;padding:16px 24px;border:1px solid #355872;border-radius:8px;font-size:15px;line-height:20px;font-weight:700;text-decoration:none;color:#f7f8f0;">${escapeHtml(layout.actionLabel)} &rarr;</a>
            </td></tr>
          </table>
          <p style="margin:0;font-size:13px;line-height:1.7;color:#355872;">${escapeHtml(layout.note)}</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:24px;">
            <tr><td style="border-top:1px solid #9cd5ff;padding-top:20px;">
              <p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:#355872;">Nếu nút phía trên không mở được, hãy sao chép liên kết này vào trình duyệt:</p>
              <a href="${actionUrl}" style="font-size:12px;line-height:1.7;word-break:break-all;overflow-wrap:anywhere;color:#355872;text-decoration:underline;">${actionUrl}</a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td align="center" style="padding:24px 16px;">
          <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#355872;">Mindycoding</p>
          <p style="margin:0;font-size:12px;line-height:1.7;color:#355872;">Email tự động từ hệ thống Mindycoding.</p>
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>`;
}

export function renderVerificationEmail(verificationUrl: string, expiryMinutes: number): string {
  return renderEmail({
    preheader: 'Xác thực email để bắt đầu hành trình học tập tại Mindycoding.',
    eyebrow: 'CHÀO MỪNG ĐẾN VỚI MINDYCODING',
    title: 'Một bước nữa để bắt đầu.',
    description:
      'Cảm ơn bạn đã đăng ký Mindycoding. Hãy xác thực địa chỉ email để hoàn tất đăng ký và bắt đầu hành trình học tập của bạn.',
    actionLabel: 'Xác thực email',
    actionUrl: verificationUrl,
    note: `Liên kết có hiệu lực trong ${expiryMinutes} phút. Nếu bạn không đăng ký tài khoản này, hãy bỏ qua email.`,
  });
}

export function renderPaymentConfirmationEmail(
  orderCode: string,
  formattedAmount: string,
  orderUrl: string,
): string {
  return renderEmail({
    preheader: `Thanh toán thành công cho đơn ${orderCode}. Xem chi tiết đơn hàng tại Mindycoding.`,
    eyebrow: 'XÁC NHẬN THANH TOÁN',
    title: 'Thanh toán thành công!',
    description:
      'Mindycoding đã nhận được thanh toán của bạn. Quyền truy cập các lớp học đã mua đã được kích hoạt. Cảm ơn bạn đã đồng hành cùng Mindycoding!',
    content: `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 28px;background-color:#f7f8f0;border:1px solid #7aaace;border-radius:8px;">
      <tr><td style="padding:20px 20px 8px;font-size:12px;color:#355872;">MÃ ĐƠN HÀNG</td></tr>
      <tr><td style="padding:0 20px 16px;font-size:17px;font-weight:700;color:#355872;word-break:break-all;">${escapeHtml(orderCode)}</td></tr>
      <tr><td style="padding:0 20px;"><div style="height:1px;background-color:#9cd5ff;"></div></td></tr>
      <tr><td style="padding:16px 20px 8px;font-size:12px;color:#355872;">SỐ TIỀN ĐÃ THANH TOÁN</td></tr>
      <tr><td style="padding:0 20px 14px;font-size:30px;line-height:1.3;font-weight:700;color:#355872;">${escapeHtml(formattedAmount)}</td></tr>
      <tr><td style="padding:0 20px 20px;font-size:12px;font-weight:700;color:#355872;">&#10003; Đã thanh toán</td></tr>
    </table>`,
    actionLabel: 'Xem chi tiết đơn hàng',
    actionUrl: orderUrl,
    note: 'Đăng nhập bằng tài khoản đã mua hàng để xem chi tiết đơn, lớp học và thông tin thanh toán.',
  });
}
