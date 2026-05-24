import { google } from 'googleapis';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X-Replit-Token not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-mail',
    {
      headers: {
        'Accept': 'application/json',
        'X-Replit-Token': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Gmail not connected');
  }
  return accessToken;
}

async function getUncachableGmailClient() {
  const accessToken = await getAccessToken();
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.gmail({ version: 'v1', auth: oauth2Client });
}

export async function sendEmailVerificationEmail(toEmail: string, code: string, firstName: string): Promise<boolean> {
  try {
    const gmail = await getUncachableGmailClient();

    const subject = `${code} is your Lekker Chat email verification code`;
    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#1A1A1A;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#1A1A1A;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#252525;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="background-color:#F5B800;padding:32px 24px;text-align:center;">
              <h1 style="margin:0;color:#1A1A1A;font-size:24px;font-weight:700;">Lekker Chat</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 24px;">
              <p style="margin:0 0 16px;color:#FFFFFF;font-size:16px;">Hi ${firstName},</p>
              <p style="margin:0 0 24px;color:#B0B0B0;font-size:14px;line-height:22px;">
                Welcome to Lekker Chat! Use the code below to verify your email address. This code expires in 10 minutes.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:16px 0;">
                    <div style="background-color:#1A1A1A;border:2px solid #F5B800;border-radius:12px;padding:20px 32px;display:inline-block;">
                      <span style="font-size:36px;font-weight:700;color:#F5B800;letter-spacing:12px;font-family:monospace;">${code}</span>
                    </div>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;color:#B0B0B0;font-size:13px;line-height:20px;">
                If you didn't create a Lekker Chat account, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px 24px;border-top:1px solid #333333;text-align:center;">
              <p style="margin:0;color:#666666;font-size:12px;">
                Powered by <a href="https://lekker.network" style="color:#F5B800;text-decoration:none;">Lekker Network</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const rawMessage = [
      `To: ${toEmail}`,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/html; charset=utf-8`,
      ``,
      htmlBody,
    ].join('\r\n');

    const encodedMessage = Buffer.from(rawMessage)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encodedMessage },
    });

    console.log(`[Gmail] Email verification sent to ${toEmail}`);
    return true;
  } catch (error) {
    console.error('[Gmail] Failed to send email verification:', error);
    return false;
  }
}

export async function sendPasswordResetEmail(toEmail: string, code: string, firstName: string): Promise<boolean> {
  try {
    const gmail = await getUncachableGmailClient();

    const subject = `${code} is your Lekker Chat password reset code`;
    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#1A1A1A;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#1A1A1A;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#252525;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="background-color:#F5B800;padding:32px 24px;text-align:center;">
              <h1 style="margin:0;color:#1A1A1A;font-size:24px;font-weight:700;">Lekker Chat</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 24px;">
              <p style="margin:0 0 16px;color:#FFFFFF;font-size:16px;">Hi ${firstName},</p>
              <p style="margin:0 0 24px;color:#B0B0B0;font-size:14px;line-height:22px;">
                You requested to reset your password. Use the code below to continue. This code expires in 15 minutes.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:16px 0;">
                    <div style="background-color:#1A1A1A;border:2px solid #F5B800;border-radius:12px;padding:20px 32px;display:inline-block;">
                      <span style="font-size:36px;font-weight:700;color:#F5B800;letter-spacing:12px;font-family:monospace;">${code}</span>
                    </div>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;color:#B0B0B0;font-size:13px;line-height:20px;">
                If you didn't request this, you can safely ignore this email. Your password won't be changed.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px 24px;border-top:1px solid #333333;text-align:center;">
              <p style="margin:0;color:#666666;font-size:12px;">
                Powered by <a href="https://lekker.network" style="color:#F5B800;text-decoration:none;">Lekker Network</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const rawMessage = [
      `To: ${toEmail}`,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/html; charset=utf-8`,
      ``,
      htmlBody,
    ].join('\r\n');

    const encodedMessage = Buffer.from(rawMessage)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
      },
    });

    console.log(`[Gmail] Password reset email sent to ${toEmail}`);
    return true;
  } catch (error) {
    console.error('[Gmail] Failed to send password reset email:', error);
    return false;
  }
}
