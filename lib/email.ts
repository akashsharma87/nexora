import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

interface EmailPayload {
  to: string
  subject: string
  html: string
}

export async function sendEmail({ to, subject, html }: EmailPayload): Promise<boolean> {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    console.log(`[EMAIL STUB] To: ${to} | Subject: ${subject}`)
    return true
  }

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'NEXORA <noreply@nexora.in>',
      to,
      subject,
      html,
      text: html.replace(/<[^>]+>/g, ''),
    })
    return true
  } catch (err) {
    console.error('[EMAIL ERROR]', err)
    return false
  }
}

export function newLeadEmailHtml(
  managerName: string,
  leadName: string,
  phone: string,
  eventType: string,
  source: string
): string {
  return `<div style="font-family:Arial,sans-serif;max-width:600px">
    <h2 style="color:#1a1a2e">🎯 New Lead — Action Required Within 90 Seconds</h2>
    <p>Hi ${managerName},</p>
    <p>A new lead just arrived in NEXORA. WhatsApp auto-response has been queued.</p>
    <table style="width:100%;border-collapse:collapse">
      <tr><td style="padding:8px;border:1px solid #ddd"><strong>Name</strong></td><td style="padding:8px;border:1px solid #ddd">${leadName}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd"><strong>Phone</strong></td><td style="padding:8px;border:1px solid #ddd">${phone}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd"><strong>Event Type</strong></td><td style="padding:8px;border:1px solid #ddd">${eventType}</td></tr>
      <tr><td style="padding:8px;border:1px solid #ddd"><strong>Source</strong></td><td style="padding:8px;border:1px solid #ddd">${source}</td></tr>
    </table>
  </div>`
}

export function proposalEmailHtml(
  leadName: string,
  eventType: string,
  propertyName: string,
  proposalTitle: string
): string {
  return `<div style="font-family:Arial,sans-serif;max-width:600px">
    <h2 style="color:#1a1a2e">Proposal — ${proposalTitle}</h2>
    <p>Dear ${leadName},</p>
    <p>Please find your personalized proposal for <strong>${eventType}</strong> at <strong>${propertyName}</strong> attached to this message.</p>
    <p>Our team is available to answer any questions or schedule a venue visit at your convenience.</p>
    <p>Warm regards,<br/>The Banquet Team<br/>${propertyName}</p>
  </div>`
}
