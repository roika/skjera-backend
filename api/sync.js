async function kv(method, path, body) {
  const url = process.env.skjeradb_KV_REST_API_URL;
  const token = process.env.skjeradb_KV_REST_API_TOKEN;
  const resp = await fetch(url + path, {
    method,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  return resp.json();
}

function generateCode() {
  const words = ['BJORN','ULVEN','FJORD','SNØEN','HAVET','SKYEN','SOLEN','MÅNEN','TIGER','LØVEN'];
  const word = words[Math.floor(Math.random() * words.length)];
  const num = Math.floor(10 + Math.random() * 90);
  return word + '-' + num;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, code, data } = req.method === 'POST' ? req.body : req.query;

  try {
    // Create new family
    if (action === 'create') {
      let newCode, exists;
      let attempts = 0;
      do {
        newCode = generateCode();
        const check = await kv('GET', '/get/family:' + newCode);
        exists = check.result !== null;
        attempts++;
      } while (exists && attempts < 10);

      const familyData = data || { children: [], childData: {} };
      await kv('POST', '/set/family:' + newCode, [JSON.stringify(familyData), 'EX', 60 * 60 * 24 * 365]);
      return res.status(200).json({ ok: true, code: newCode });
    }

    // Load family data
    if (action === 'load') {
      if (!code) return res.status(400).json({ error: 'Mangler familiekode' });
      const result = await kv('GET', '/get/family:' + code.toUpperCase());
      if (result.result === null) return res.status(404).json({ error: 'Fant ikke familie med denne koden' });
      // Refresh TTL on access
      await kv('POST', '/expire/family:' + code.toUpperCase(), [60 * 60 * 24 * 365]);
      return res.status(200).json({ ok: true, data: JSON.parse(result.result) });
    }

    // Save family data
    if (action === 'save') {
      if (!code || !data) return res.status(400).json({ error: 'Mangler kode eller data' });
      await kv('POST', '/set/family:' + code.toUpperCase(), [JSON.stringify(data), 'EX', 60 * 60 * 24 * 365]);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Ukjent action' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
