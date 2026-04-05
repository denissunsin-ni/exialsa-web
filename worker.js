const RECIPIENTS = [
  'denis@sunsin.online',
  'aracely@rosalesmarenco.online'
];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function maskEmail(email = '') {
  const [user = '', domain = ''] = String(email).split('@');
  if (!user || !domain) return 'destinatario';
  return `${user.slice(0, 2)}***@${domain}`;
}

function buildMessage({ nombre, empresa, telefono, correo, producto, detalle }) {
  const subject = `Nueva solicitud de cotizacion - ${producto}`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;">
      <h2 style="color:#0f4c81;">Nueva solicitud de cotizacion</h2>
      <p><strong>Nombre:</strong> ${escapeHtml(nombre)}</p>
      <p><strong>Empresa:</strong> ${escapeHtml(empresa || 'No aplica')}</p>
      <p><strong>Telefono:</strong> ${escapeHtml(telefono)}</p>
      <p><strong>Correo electronico:</strong> ${escapeHtml(correo)}</p>
      <p><strong>Producto de interes:</strong> ${escapeHtml(producto)}</p>
      <p><strong>Detalle de la solicitud:</strong></p>
      <p>${escapeHtml(detalle).replace(/\n/g, '<br>')}</p>
    </div>
  `;

  const text = [
    'Nueva solicitud de cotizacion',
    `Nombre: ${nombre}`,
    `Empresa: ${empresa || 'No aplica'}`,
    `Telefono: ${telefono}`,
    `Correo electronico: ${correo}`,
    `Producto de interes: ${producto}`,
    'Detalle de la solicitud:',
    detalle
  ].join('\n');

  return { subject, html, text };
}

async function sendToRecipient(env, recipient, replyTo, message) {
  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      'User-Agent': 'exialsa-web/1.0'
    },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL,
      to: [recipient],
      reply_to: replyTo,
      subject: message.subject,
      html: message.html,
      text: message.text
    })
  });

  const raw = await resendResponse.text();
  let parsed;

  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = raw;
  }

  return {
    recipient,
    ok: resendResponse.ok,
    status: resendResponse.status,
    parsed
  };
}

async function handleQuote(request, env) {
  const contentType = request.headers.get('content-type') || '';

  if (!contentType.includes('application/json')) {
    return json({ error: 'No se pudo procesar la solicitud.' }, 415);
  }

  const body = await request.json();
  const nombre = String(body.nombre || '').trim();
  const empresa = String(body.empresa || '').trim();
  const telefono = String(body.telefono || '').trim();
  const correo = String(body.correo || '').trim();
  const producto = String(body.producto || '').trim();
  const detalle = String(body.detalle || '').trim();

  if (!nombre || !telefono || !correo || !producto || !detalle) {
    return json({ error: 'Complete todos los campos obligatorios.' }, 400);
  }

  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) {
    console.error('Missing email configuration', {
      hasResendApiKey: Boolean(env.RESEND_API_KEY),
      hasResendFromEmail: Boolean(env.RESEND_FROM_EMAIL)
    });
    return json({ error: 'No se pudo enviar la solicitud en este momento.' }, 500);
  }

  const message = buildMessage({
    nombre,
    empresa,
    telefono,
    correo,
    producto,
    detalle
  });

  const results = await Promise.all(
    RECIPIENTS.map((recipient) => sendToRecipient(env, recipient, correo, message))
  );

  const failed = results.filter((result) => !result.ok);

  if (failed.length > 0) {
    console.error(
      'Email delivery failure',
      failed.map((result) => ({
        recipient: maskEmail(result.recipient),
        status: result.status,
        response: result.parsed
      }))
    );

    return json({ error: 'No se pudo enviar la solicitud en este momento.' }, 502);
  }

  console.log(
    'Email submission accepted',
    results.map((result) => ({
      recipient: maskEmail(result.recipient),
      status: result.status
    }))
  );

  return json({
    ok: true,
    message: 'Solicitud enviada correctamente.'
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS' && url.pathname === '/api/cotizacion') {
      return json({}, 204);
    }

    if (request.method === 'POST' && url.pathname === '/api/cotizacion') {
      try {
        return await handleQuote(request, env);
      } catch (error) {
        console.error('Unexpected quote error', error);
        return json({ error: 'No se pudo enviar la solicitud en este momento.' }, 500);
      }
    }

    if (request.method === 'GET' && url.pathname === '/cotizacion') {
      const rewrittenRequest = new Request(new URL('/index.html', url.origin), request);
      return env.ASSETS.fetch(rewrittenRequest);
    }

    return env.ASSETS.fetch(request);
  }
};
