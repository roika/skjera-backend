async function kvCommand(args) {
  const url = process.env.skjeradb_KV_REST_API_URL;
  const token = process.env.skjeradb_KV_REST_API_TOKEN;

  if (!url || !token) throw new Error('Database ikke konfigurert');

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(args)
  });

  const json = await resp.json();
  if (json.error) throw new Error(json.error);
  return json.result;
}

function generateCode() {
  const words = ['BJORN','ULVEN','FJORD','SNOEN','HAVET','SKYEN','SOLEN','MANEN','TIGER','LOVEN','ELGEN','ORNEN'];
  const word = words[Math.floor(Math.random() * words.length)];
  const num = Math.floor(10 + Math.random() * 90);
  return word + '-' + num;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'ok',
      hasUrl: !!process.env.skjeradb_KV_REST_API_URL,
      hasToken: !!process.env.skjeradb_KV_REST_API_TOKEN
    });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, code, data } = req.body || {};

  try {
    if (action === 'create') {
      let newCode, exists;
      let attempts = 0;
      do {
        newCode = generateCode();
        const check = await kvCommand(['GET', 'family:' + newCode]);
        exists = check !== null;
        attempts++;
      } while (exists && attempts < 10);

      const familyData = data || { children: [], childData: {} };
      await kvCommand(['SET', 'family:' + newCode, JSON.stringify(familyData), 'EX', 31536000]);
      return res.status(200).json({ ok: true, code: newCode });
    }

    if (action === 'load') {
      if (!code) return res.status(400).json({ error: 'Mangler familiekode' });
      const key = 'family:' + code.toUpperCase().trim();
      const result = await kvCommand(['GET', key]);
      if (result === null) {
        return res.status(404).json({ error: 'Fant ingen familie med koden «' + code.toUpperCase().trim() + '». Sjekk at koden er riktig.' });
      }
      await kvCommand(['EXPIRE', key, 31536000]);
      return res.status(200).json({ ok: true, data: JSON.parse(result) });
    }

    if (action === 'save') {
      if (!code || !data) return res.status(400).json({ error: 'Mangler kode eller data' });
      const key = 'family:' + code.toUpperCase().trim();
      await kvCommand(['SET', key, JSON.stringify(data), 'EX', 31536000]);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Ukjent action: ' + action });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
