import fs from 'node:fs';
import path from 'node:path';

const API_ROOT = 'https://pddikti.kemdiktisaintek.go.id/api';

const PDDIKTI_HEADERS = {
  'Accept': 'application/json',
  'Content-Type': 'application/json',
  'Origin': 'https://pddikti.kemdiktisaintek.go.id',
  'Referer': 'https://pddikti.kemdiktisaintek.go.id/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
};

let localCache = null;
function getCachedDosen(nidn, nama) {
  if (!localCache) {
    try {
      const candidates = [
        path.join(process.cwd(), 'cache_dosen.json'),
        path.join(process.cwd(), 'api', 'cache_dosen.json'),
        path.resolve('cache_dosen.json')
      ];
      for (const p of candidates) {
        if (fs.existsSync(p)) {
          localCache = JSON.parse(fs.readFileSync(p, 'utf8'));
          break;
        }
      }
    } catch (_) {}
  }
  if (!localCache) return null;

  if (nidn) {
    const cleanNidn = nidn.replace(/\D/g, '');
    if (localCache[`nidn_${cleanNidn}`]) {
      return localCache[`nidn_${cleanNidn}`];
    }
  }
  if (nama) {
    const clean = nama.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (localCache[`nama_${clean}`]) {
      return localCache[`nama_${clean}`];
    }
  }
  return null;
}

function classifyDegree(jenjang) {
  const label = (jenjang || '').toUpperCase();
  if (/(^|[^0-9])S\s*1([^0-9]|$)|SARJANA|DIPLOMA\s*(IV|4)|D\s*[-/]?\s*(IV|4)/i.test(label)) return 'S1';
  if (/(^|[^0-9])S\s*2([^0-9]|$)|MAGISTER|MASTER/i.test(label)) return 'S2';
  if (/(^|[^0-9])S\s*3([^0-9]|$)|DOKTOR|DOCTOR/i.test(label)) return 'S3';
  return null;
}

function extractRecords(v, depth = 0) {
  if (depth > 6 || !v || typeof v !== 'object') return [];
  if (Array.isArray(v)) return v.filter(item => item && typeof item === 'object');
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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { body = {}; }
  }
  const items = Array.isArray(body?.items) ? body.items : [];

  if (items.length === 0) {
    return res.status(400).json({ error: 'Array items tidak boleh kosong.' });
  }

  const results = await Promise.all(items.map(async (dosen) => {
    try {
      const cleanNidn = (dosen.nidn || '').replace(/\D/g, '');
      const cached = getCachedDosen(cleanNidn, dosen.nama);
      if (cached && cached.pendidikan && cached.pendidikan.length > 0) {
        const levels = { S1: { kampus: [], tahun: [] }, S2: { kampus: [], tahun: [] }, S3: { kampus: [], tahun: [] } };
        for (const p of cached.pendidikan) {
          const lvl = classifyDegree(p.jenjang);
          if (lvl) {
            if (p.pt) levels[lvl].kampus.push(p.pt);
            if (p.tahun) levels[lvl].tahun.push(p.tahun);
          }
        }
        return {
          ...dosen,
          s1_kampus: levels.S1.kampus.join(' | '),
          s1_tahun: levels.S1.tahun.join(' | '),
          s2_kampus: levels.S2.kampus.join(' | '),
          s2_tahun: levels.S2.tahun.join(' | '),
          s3_kampus: levels.S3.kampus.join(' | '),
          s3_tahun: levels.S3.tahun.join(' | '),
          status_pddikti: 'Riwayat tersedia (PDDikti)'
        };
      }

      let pddiktiId = dosen.id || null;

      // If ID not provided or is prefix, search by enc/all
      if (!pddiktiId || pddiktiId.startsWith('nidn_') || pddiktiId.startsWith('nama_')) {
        const queries = [];
        if (dosen.nama) queries.push(`${dosen.nama} POLITEKNIK NEGERI LHOKSEUMAWE`);
        if (dosen.nama) queries.push(dosen.nama);
        if (dosen.nidn) queries.push(dosen.nidn);

        for (const q of queries) {
          try {
            const searchResp = await fetch(`${API_ROOT}/pencarian/enc/all/${encodeURIComponent(q)}`, {
              headers: PDDIKTI_HEADERS
            });
            if (searchResp.ok) {
              const searchJson = await searchResp.json();
              const recs = searchJson.data?.dosen || extractRecords(searchJson);
              const matched = recs.find(r => {
                const sameNidn = Boolean(dosen.nidn && r.nidn && r.nidn.trim() === dosen.nidn.trim());
                const sameName = Boolean(dosen.nama && r.nama && r.nama.toLowerCase().trim() === dosen.nama.toLowerCase().trim());
                const isPnl = Boolean(!r.nama_pt || r.nama_pt.toLowerCase().includes('lhokseumawe') || r.nama_pt.toLowerCase().includes('pnl'));
                return (sameNidn || sameName) && isPnl;
              });
              if (matched && matched.id) {
                pddiktiId = matched.id;
                break;
              }
            }
          } catch (_) {}
        }
      }

      if (!pddiktiId) {
        return {
          ...dosen,
          s1_kampus: '', s1_tahun: '',
          s2_kampus: '', s2_tahun: '',
          s3_kampus: '', s3_tahun: '',
          status_pddikti: 'Tidak ditemukan di PDDikti'
        };
      }

      // Fetch study history
      const histResp = await fetch(`${API_ROOT}/dosen/study-history`, {
        method: 'POST',
        headers: PDDIKTI_HEADERS,
        body: JSON.stringify({ id: pddiktiId })
      });

      if (!histResp.ok) {
        return {
          ...dosen,
          id: pddiktiId,
          s1_kampus: '', s1_tahun: '',
          s2_kampus: '', s2_tahun: '',
          s3_kampus: '', s3_tahun: '',
          status_pddikti: 'Riwayat gagal dimuat'
        };
      }

      const histJson = await histResp.json();
      const histRecs = extractRecords(histJson);

      const levels = {
        S1: { kampus: new Set(), tahun: new Set() },
        S2: { kampus: new Set(), tahun: new Set() },
        S3: { kampus: new Set(), tahun: new Set() }
      };

      for (const rec of histRecs) {
        const jenjang = rec.jenjang || rec.nama_jenjang_didik || rec.jenjang_pendidikan || '';
        const lvl = classifyDegree(jenjang);
        if (!lvl) continue;

        const pt = (rec.nama_pt || rec.perguruan_tinggi || '').trim();
        const thn = String(rec.tahun_lulus || rec.tahun || '').trim();
        if (pt) levels[lvl].kampus.add(pt);
        if (thn) levels[lvl].tahun.add(thn);
      }

      const hasHistory = levels.S1.kampus.size > 0 || levels.S2.kampus.size > 0 || levels.S3.kampus.size > 0;
      const statusPddikti = hasHistory ? 'Riwayat tersedia' : 'Riwayat kosong/tidak dikenali';

      return {
        ...dosen,
        id: pddiktiId,
        s1_kampus: Array.from(levels.S1.kampus).join(' | '),
        s1_tahun: Array.from(levels.S1.tahun).join(' | '),
        s2_kampus: Array.from(levels.S2.kampus).join(' | '),
        s2_tahun: Array.from(levels.S2.tahun).join(' | '),
        s3_kampus: Array.from(levels.S3.kampus).join(' | '),
        s3_tahun: Array.from(levels.S3.tahun).join(' | '),
        status_pddikti: statusPddikti
      };
    } catch (err) {
      return {
        ...dosen,
        s1_kampus: '', s1_tahun: '',
        s2_kampus: '', s2_tahun: '',
        s3_kampus: '', s3_tahun: '',
        status_pddikti: 'Error: ' + err.message
      };
    }
  }));

  return res.status(200).json({ success: true, data: results });
}
