export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const resp = await fetch('https://data.pnl.ac.id/dosen/list', {
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!resp.ok) {
      return res.status(502).json({ error: 'Portal data PNL mengembalikan status HTTP ' + resp.status });
    }

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
            no: clean[0],
            nama: clean[1],
            nidn: clean[2],
            nuptk: clean[3],
            jenjang: clean[4],
            status: clean[5],
            status_pegawai: clean[6],
            ikatan_kerja: clean[7],
            prodi: clean[8],
            jurusan: clean[9],
            semester: clean[10]
          });
        }
      }
    }

    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json({ success: true, total: rows.length, data: rows });
  } catch (e) {
    return res.status(502).json({ error: 'Gagal mengambil daftar dosen PNL: ' + e.message });
  }
}
