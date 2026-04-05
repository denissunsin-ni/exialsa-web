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

async function handleQuote(request, env) {
  const contentType = request.headers.get('content-type') || '';

  if (!contentType.includes('application/json')) {
    return json({ error: 'Formato de solicitud no válido.' }, 415);
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

  if (!env.RESEND_API_KEY) {
    return json({ error: 'Falta configurar RESEND_API_KEY en Cloudflare.' }, 500);
  }

  if (!env.RESEND_FROM_EMAIL) {
    return json({ error: 'Falta configurar RESEND_FROM_EMAIL en Cloudflare.' }, 500);
  }

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

  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      'User-Agent': 'exialsa-web/1.0'
    },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL,
      to: RECIPIENTS,
      reply_to: correo,
      subject,
      html,
      text
    })
  });

  if (!resendResponse.ok) {
    const errorText = await resendResponse.text();
    return json({ error: `Resend rechazo el envio: ${errorText}` }, 502);
  }

  return json({ ok: true, message: 'Solicitud enviada correctamente.' });
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
        return json({ error: error instanceof Error ? error.message : 'Error interno del servidor.' }, 500);
      }
    }

    return env.ASSETS.fetch(request);
  }
};
