// Receipt image renderer — same visual language as site/receipt/index.html
// (teal header band with the tutor's name, receipt no + date, labelled lines,
// big amount). Pure canvas, works offline.

import { inr, modeLabel, monthLabel } from './format.js';

export const RECEIPT_W = 1000;
export const RECEIPT_H = 1250;

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export function drawReceipt(canvas, { due, tutorName }) {
  const W = RECEIPT_W, H = RECEIPT_H;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#1f6f5c';
  ctx.lineWidth = 10;
  ctx.strokeRect(20, 20, W - 40, H - 40);

  // header band
  ctx.fillStyle = '#1f6f5c';
  ctx.fillRect(20, 20, W - 40, 170);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = `bold 52px ${FONT}`;
  ctx.fillText(tutorName || 'Tuition Classes', W / 2, 105, W - 120);
  ctx.font = `30px ${FONT}`;
  ctx.fillText('FEE RECEIPT', W / 2, 160);

  // meta row
  const date = due.paidAt
    ? new Date(due.paidAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })
    : new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
  ctx.fillStyle = '#5b6b7f';
  ctx.font = `28px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText(`Receipt No: ${due.receiptNo || '—'}`, 70, 250, W / 2 - 80);
  ctx.textAlign = 'right';
  ctx.fillText(`Date: ${date}`, W - 70, 250);

  function line(label, value, y, big) {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#5b6b7f';
    ctx.font = `30px ${FONT}`;
    ctx.fillText(label, 70, y);
    ctx.fillStyle = '#1a2332';
    ctx.font = `${big ? 'bold 72px' : 'bold 38px'} ${FONT}`;
    ctx.fillText(value, 70, y + (big ? 90 : 48), W - 140);
  }

  const forText = due.subject
    ? `${monthLabel(due.month, true)} · ${due.subject}`
    : monthLabel(due.month, true);

  line('Received from (student)', due.studentName || '—', 340);
  line('Towards tuition fee for', forText, 480);
  line('Payment mode', modeLabel(due.paymentMode), 620);
  line('Amount received', inr(due.amount), 760, true);

  ctx.strokeStyle = '#e3e9e6';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(70, 950);
  ctx.lineTo(W - 70, 950);
  ctx.stroke();

  ctx.fillStyle = '#1f6f5c';
  ctx.font = `bold 34px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('Thank you!', W / 2, 1020);
  ctx.fillStyle = '#9aa7b4';
  ctx.font = `24px ${FONT}`;
  ctx.fillText('Made with GuruKhata — the digital fees register', W / 2, 1160);
}

export function canvasToBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}
