const API_ROOT = 'https://pddikti.kemdiktisaintek.go.id/api';

const PDDIKTI_HEADERS = {
  'Accept': 'application/json',
  'Origin': 'https://pddikti.kemdiktisaintek.go.id',
  'Referer': 'https://pddikti.kemdiktisaintek.go.id/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
};

let cachedPnlList = null;
let lastCacheTime = 0;

async function getPnlDosenList() {
  const now = Date.now();
  if (cachedPnlList && (now - lastCacheTime < 3600000)) {
    return cachedPnlList;
  }

  try {
    const resp = await fetch('https://data.pnl.ac.id/dosen/list', {
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!resp.ok) return cachedPnlList || [];

    const html = await resp.text();
    const trRegex = /<tr[\s\S]*?<\/tr>/gi;
    const matches = html.match(trRegex) || [];
    const rows = [];

    for (const tr of matches) {
      const tdMatches = [...tr.matchAll(/<td[\s\S]*?>([\s\S]*?)<\/td>/gi)];
      if (tdMatches.length >= 11) {
        const clean = tdMatches.map(m => m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
        if (/^\d+$/.test(clean[0])) {
          rows.push({
            id: clean[2] ? `nidn_${clean[2]}` : `nama_${encodeURIComponent(clean[1])}`,
            nama: clean[1],
            nidn: clean[2] || '',
            nuptk: clean[3] || '',
            jenjang: clean[4] || '',
            status: clean[5] || '',
            status_pegawai: clean[6] || '',
            ikatan_kerja: clean[7] || '',
            nama_prodi: clean[8] || '',
            jurusan: clean[9] || '',
            semester: clean[10] || '',
            nama_pt: 'Politeknik Negeri Lhokseumawe'
          });
        }
      }
    }

    if (rows.length > 0) {
      cachedPnlList = rows;
      lastCacheTime = now;
    }
    return cachedPnlList || [];
  } catch (err) {
    return cachedPnlList || [];
  }
}

function extractRecords(v, depth = 0) {
  if (depth > 6 || !v || typeof v !== 'object') return [];
  if (Array.isArray(v)) {
    return v.filter(item => item && typeof item === 'object');
  }
  for (const k of ['dosen', 'data', 'results', 'result', 'items', 'records', 'content']) {
    if (k in v) {
      const res = extractRecords(v[k], depth + 1);
      if (res.length > 0) return res;
    }
  }
  return [];
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const q = (req.query?.q || '').trim();
  if (q.length < 2) {
    return res.status(400).json({ error: 'Masukkan nama dosen minimal 2 karakter.' });
  }

  const queryLower = q.toLowerCase();

  // 1. Ambil dari database portal resmi PNL (312 dosen resmi)
  const pnlDosen = await getPnlDosenList();
  const matched = pnlDosen.filter(d => 
    d.nama.toLowerCase().includes(queryLower) ||
    d.nidn.includes(queryLower) ||
    d.nuptk.includes(queryLower) ||
    d.nama_prodi.toLowerCase().includes(queryLower) ||
    d.jurusan.toLowerCase().includes(queryLower)
  );

  if (matched.length > 0) {
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json({
      success: true,
      count: matched.length,
      data: matched
    });
  }

  // 2. Fallback: Cari ke PDDikti via enc/all & pencarian/dosen
  try {
    const urls = [
      `${API_ROOT}/pencarian/enc/all/${encodeURIComponent(q + ' POLITEKNIK NEGERI LHOKSEUMAWE')}`,
      `${API_ROOT}/pencarian/enc/all/${encodeURIComponent(q)}`,
      `${API_ROOT}/pencarian/dosen/${encodeURIComponent(q)}`
    ];

    let pddiktiList = [];
    for (const u of urls) {
      const resp = await fetch(u, { headers: PDDIKTI_HEADERS });
      if (resp.ok) {
        const json = await resp.json();
        const records = json.data?.dosen || extractRecords(json);
        const pnlOnly = records.filter(r => {
          const pt = (r.nama_pt || r.sinkatan_pt || r.perguruan_tinggi || '').toLowerCase();
          return pt.includes('lhokseumawe') || pt.includes('pnl');
        });
        if (pnlOnly.length > 0) {
          pddiktiList = pnlOnly.map(r => ({
            id: r.id || r.id_sdm || '',
            nama: r.nama || r.nama_dosen || '',
            nidn: r.nidn || '',
            nuptk: r.nuptk || '',
            nama_prodi: r.nama_prodi || r.prodi || '',
            nama_pt: 'Politeknik Negeri Lhokseumawe'
          }));
          break;
        }
      }
    }

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json({
      success: true,
      count: pddiktiList.length,
      data: pddiktiList
    });
  } catch (err) {
    return res.status(200).json({ success: true, count: 0, data: [] });
  }
}
