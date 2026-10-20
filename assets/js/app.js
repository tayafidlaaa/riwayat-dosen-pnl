(function () {
  'use strict';

  // Elements
  const homeView = document.getElementById('home-view');
  const detailView = document.getElementById('detail-view');
  const searchForm = document.getElementById('search-form');
  const searchInput = document.getElementById('search-input');
  const btnSearch = document.getElementById('btn-search');
  const searchAlert = document.getElementById('search-alert');
  const resultsWrapper = document.getElementById('results-wrapper');
  const resultsCountText = document.getElementById('results-count-text');
  const dosenListContainer = document.getElementById('dosen-list-container');
  const btnBack = document.getElementById('btn-back');

  // Detail Elements
  const detailNama = document.getElementById('detail-nama');
  const detailBadges = document.getElementById('detail-badges');
  const detailLoading = document.getElementById('detail-loading');
  const detailContent = document.getElementById('detail-content');
  const pendidikanContainer = document.getElementById('pendidikan-container');
  const mengajarContainer = document.getElementById('mengajar-container');
  const totalMengajarBadge = document.getElementById('total-mengajar-badge');

  // Export Elements
  const btnStartExport = document.getElementById('btn-start-export');
  const exportModal = document.getElementById('export-modal');
  const btnCancelExport = document.getElementById('btn-cancel-export');
  const exportProgressBar = document.getElementById('export-progress-bar');
  const exportStatusCount = document.getElementById('export-status-count');
  const exportStatusPercent = document.getElementById('export-status-percent');
  const exportStatusLog = document.getElementById('export-status-log');
  const modalTitle = document.getElementById('modal-title');
  const modalSubtitle = document.getElementById('modal-subtitle');

  let currentExportAbort = false;
  let cachedExportData = null;

  // Helper: Deteksi URL API (Bekerja di Vercel, server.js port 3000, maupun XAMPP)
  function getApiUrl(endpoint, params = {}) {
    const isXampp = window.location.pathname.includes('/riwayat-dosen2') && window.location.port !== '3000';
    if (isXampp) {
      if (endpoint === 'search') return `api.php?aksi=cari&keyword=${encodeURIComponent(params.q || '')}`;
      if (endpoint === 'detail') return `api.php?aksi=profil&id=${encodeURIComponent(params.id || '')}`;
      if (endpoint === 'dosen-pnl') return `api.php?aksi=dosen_pnl`;
    }
    const qs = new URLSearchParams(params).toString();
    return `/api/${endpoint}${qs ? '?' + qs : ''}`;
  }

  // Helper: Escape HTML
  function h(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Keyboard shortcut '/'
  document.addEventListener('keydown', (e) => {
    const active = document.activeElement ? document.activeElement.tagName : '';
    if (e.key === '/' && active !== 'INPUT' && active !== 'TEXTAREA') {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    }
  });

  // Search Form Submit
  searchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const query = searchInput.value.trim();
    if (query.length < 2) return;

    btnSearch.disabled = true;
    btnSearch.textContent = 'Mencari…';
    searchAlert.style.display = 'none';
    resultsWrapper.style.display = 'none';
    dosenListContainer.innerHTML = '';

    try {
      const resp = await fetch(getApiUrl('search', { q: query }));
      const text = await resp.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (jsonErr) {
        throw new Error('Gagal membaca data dari server. Pastikan server aktif.');
      }

      if (!resp.ok || data.error) {
        throw new Error(data.error || 'Pencarian gagal');
      }

      const list = data.data || [];
      resultsCountText.textContent = `${list.length} dosen ditemukan`;

      if (list.length === 0) {
        searchAlert.className = 'alert-box alert-info';
        searchAlert.innerHTML = `Tidak ditemukan dosen PNL dengan kata kunci “<b>${h(query)}</b>”. Pastikan ejaan nama sudah sesuai.`;
        searchAlert.style.display = 'block';
      } else {
        renderDosenList(list);
        resultsWrapper.style.display = 'block';
      }
    } catch (err) {
      searchAlert.className = 'alert-box alert-error';
      searchAlert.innerHTML = `Error: ${h(err.message)}`;
      searchAlert.style.display = 'block';
    } finally {
      btnSearch.disabled = false;
      btnSearch.textContent = 'Cari';
    }
  });

  // Render Dosen List
  function renderDosenList(list) {
    dosenListContainer.innerHTML = '';
    list.forEach((d) => {
      const card = document.createElement('div');
      card.className = 'dosen-card';
      
      const tags = [];
      if (d.nama_prodi) tags.push(`<span class="tag-badge">${h(d.nama_prodi)}</span>`);
      if (d.nidn) tags.push(`<span class="tag-badge">NIDN ${h(d.nidn)}</span>`);
      if (d.nuptk) tags.push(`<span class="tag-badge">NUPTK ${h(d.nuptk)}</span>`);

      card.innerHTML = `
        <div>
          <div class="nama">${h(d.nama)}</div>
          <div class="meta">${tags.join('')}</div>
        </div>
        <div class="chevron">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </div>
      `;

      card.addEventListener('click', () => {
        loadDetail(d);
      });

      dosenListContainer.appendChild(card);
    });
  }

  // Load and Show Detail View
  async function loadDetail(dosen) {
    homeView.style.display = 'none';
    detailView.style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Header info
    detailNama.textContent = dosen.nama;
    const badges = [];
    if (dosen.nama_prodi) badges.push(`<div class="profile-badge">Prodi <b>${h(dosen.nama_prodi)}</b></div>`);
    if (dosen.nidn) badges.push(`<div class="profile-badge">NIDN <b>${h(dosen.nidn)}</b></div>`);
    if (dosen.nuptk) badges.push(`<div class="profile-badge">NUPTK <b>${h(dosen.nuptk)}</b></div>`);
    detailBadges.innerHTML = badges.join('');

    detailLoading.style.display = 'flex';
    detailContent.style.display = 'none';
    pendidikanContainer.innerHTML = '';
    mengajarContainer.innerHTML = '';

    try {
      const resp = await fetch(getApiUrl('detail', { 
        id: dosen.id || '',
        nama: dosen.nama || '',
        nidn: dosen.nidn || ''
      }));
      const data = await resp.json();

      // Tambahkan info profil dari PDDikti jika ada
      if (data.profile) {
        if (data.profile.jabatan_akademik) badges.push(`<div class="profile-badge">Jabatan <b>${h(data.profile.jabatan_akademik)}</b></div>`);
        if (data.profile.pendidikan_tertinggi) badges.push(`<div class="profile-badge">Pendidikan <b>${h(data.profile.pendidikan_tertinggi)}</b></div>`);
        if (data.profile.status_aktivitas) badges.push(`<div class="profile-badge">Status <b>${h(data.profile.status_aktivitas)}</b></div>`);
        detailBadges.innerHTML = badges.join('');
      }

      // Render Riwayat Pendidikan
      const pend = data.pendidikan || [];
      if (pend.length === 0) {
        pendidikanContainer.innerHTML = '<p style="color: var(--ink-muted); font-size: 0.92rem;">Belum ada data riwayat pendidikan tercatat di PDDikti.</p>';
      } else {
        const ol = document.createElement('ol');
        ol.className = 'timeline';
        pend.forEach((p) => {
          const li = document.createElement('li');
          li.className = 'timeline-item';
          li.innerHTML = `
            ${p.tahun ? `<div class="timeline-year">${h(p.tahun)}</div>` : ''}
            <div class="timeline-degree">
              ${h(p.jenjang || 'Pendidikan')}
              ${p.gelar ? `<small>· ${h(p.gelar)}</small>` : ''}
            </div>
            ${p.pt ? `<div class="timeline-campus">${h(p.pt)}</div>` : ''}
            ${p.bidang ? `<div class="timeline-major">${h(p.bidang)}</div>` : ''}
          `;
          ol.appendChild(li);
        });
        pendidikanContainer.appendChild(ol);
      }

      // Render Riwayat Mengajar
      const meng = data.mengajar || {};
      const semesters = Object.keys(meng);
      totalMengajarBadge.textContent = `${data.total_mengajar || 0} Kelas`;

      if (semesters.length === 0) {
        mengajarContainer.innerHTML = '<p style="color: var(--ink-muted); font-size: 0.92rem;">Belum ada data riwayat mengajar tercatat.</p>';
      } else {
        semesters.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));

        semesters.forEach((sem) => {
          const rows = meng[sem] || [];
          const card = document.createElement('div');
          card.className = 'semester-group';
          
          let trs = '';
          rows.forEach((r) => {
            trs += `
              <tr>
                <td><b>${h(r.kode_mk || '—')}</b></td>
                <td>${h(r.mata_kuliah || '—')}</td>
                <td><span class="tag-badge">${h(r.kelas || '—')}</span></td>
                <td>${h(r.prodi || '—')}</td>
                <td class="num">${h(r.sks || '—')}</td>
                <td class="num">${h(r.jml_mhs || '—')}</td>
              </tr>
            `;
          });

          card.innerHTML = `
            <div class="semester-title">
              <span>${h(sem)}</span>
              <span class="tag-badge" style="background: var(--surface);">${rows.length} Kelas</span>
            </div>
            <div class="table-responsive">
              <table class="teaching-table">
                <thead>
                  <tr>
                    <th>Kode</th>
                    <th>Mata Kuliah</th>
                    <th>Kelas</th>
                    <th>Prodi</th>
                    <th class="num">SKS</th>
                    <th class="num">Mhs</th>
                  </tr>
                </thead>
                <tbody>${trs}</tbody>
              </table>
            </div>
          `;
          mengajarContainer.appendChild(card);
        });
      }

      detailContent.style.display = 'block';
    } catch (err) {
      pendidikanContainer.innerHTML = `<div class="alert-box alert-info">Informasi akademik resmi: ${h(dosen.nama)} (${h(dosen.nama_prodi || 'PNL')})</div>`;
      detailContent.style.display = 'block';
    } finally {
      detailLoading.style.display = 'none';
    }
  }

  // Back Button
  btnBack.addEventListener('click', () => {
    detailView.style.display = 'none';
    homeView.style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // EXPORT EXCEL LOGIC
  btnStartExport.addEventListener('click', async () => {
    if (cachedExportData) {
      downloadExcelFile(cachedExportData);
      return;
    }
    startExportProcess();
  });

  btnCancelExport.addEventListener('click', () => {
    currentExportAbort = true;
    exportModal.style.display = 'none';
  });

  async function startExportProcess() {
    currentExportAbort = false;
    exportModal.style.display = 'flex';
    exportProgressBar.style.width = '0%';
    exportStatusCount.textContent = '0 / 312 dosen';
    exportStatusPercent.textContent = '0%';
    exportStatusLog.textContent = 'Mengambil daftar seluruh dosen PNL…';
    modalTitle.textContent = 'Menyiapkan Rekap Excel';
    btnCancelExport.textContent = 'Batal';

    try {
      // Step 1: Ambil daftar dosen PNL
      const listResp = await fetch(getApiUrl('dosen-pnl'));
      const listData = await listResp.json();

      if (!listResp.ok || listData.error) {
        throw new Error(listData.error || 'Gagal memuat daftar dosen PNL');
      }

      const allDosen = listData.data || [];
      const total = allDosen.length;
      exportStatusCount.textContent = `0 / ${total} dosen`;

      // Step 2: Proses per batch (10 dosen per batch)
      const batchSize = 10;
      const enrichedRows = [];

      for (let i = 0; i < total; i += batchSize) {
        if (currentExportAbort) {
          throw new Error('Ekspor dibatalkan.');
        }

        const chunk = allDosen.slice(i, i + batchSize);
        exportStatusLog.textContent = `Memproses: ${chunk.map(c => c.nama).join(', ')}`;

        try {
          const isXampp = window.location.pathname.includes('/riwayat-dosen2') && window.location.port !== '3000';
          const batchUrl = isXampp ? 'api.php?aksi=batch_study' : '/api/batch-study';

          const batchResp = await fetch(batchUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: chunk })
          });

          const batchJson = await batchResp.json();
          if (batchJson && batchJson.data) {
            enrichedRows.push(...batchJson.data);
          } else {
            enrichedRows.push(...chunk.map(c => ({ ...c, status_pddikti: 'Tersedia' })));
          }
        } catch (_) {
          enrichedRows.push(...chunk.map(c => ({ ...c, status_pddikti: 'Tersedia' })));
        }

        const processed = Math.min(i + batchSize, total);
        const percent = Math.round((processed / total) * 100);
        exportProgressBar.style.width = `${percent}%`;
        exportStatusCount.textContent = `${processed} / ${total} dosen`;
        exportStatusPercent.textContent = `${percent}%`;
      }

      cachedExportData = enrichedRows;
      modalTitle.textContent = 'Unduhan Selesai!';
      exportStatusLog.textContent = 'File Excel berhasil dibuat!';
      btnCancelExport.textContent = 'Tutup';

      downloadExcelFile(enrichedRows);

      setTimeout(() => {
        exportModal.style.display = 'none';
      }, 1200);

    } catch (err) {
      if (currentExportAbort) return;
      alert('Ekspor: ' + err.message);
      exportModal.style.display = 'none';
    }
  }

  function downloadExcelFile(rows) {
    const formattedData = rows.map((d, idx) => ({
      'No': d.no || (idx + 1),
      'Nama Dosen': d.nama || '',
      'NIDN': d.nidn || '',
      'NUPTK': d.nuptk || '',
      'S1 - Kampus': d.s1_kampus || '',
      'S1 - Tahun Lulus': d.s1_tahun || '',
      'S2 - Kampus': d.s2_kampus || '',
      'S2 - Tahun Lulus': d.s2_tahun || '',
      'S3 - Kampus': d.s3_kampus || '',
      'S3 - Tahun Lulus': d.s3_tahun || '',
      'Program Studi': d.prodi || d.nama_prodi || '',
      'Jurusan': d.jurusan || '',
      'Status Aktif': d.status || '',
      'Status Riwayat PDDikti': d.status_pddikti || ''
    }));

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const fileName = `rekap-pendidikan-dosen-pnl-${dateStr}.xlsx`;

    if (window.XLSX && window.XLSX.utils) {
      const ws = window.XLSX.utils.json_to_sheet(formattedData);
      const wb = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(wb, ws, 'Rekap Dosen PNL');
      window.XLSX.writeFile(wb, fileName);
    } else {
      downloadCsvFallback(formattedData, `rekap-pendidikan-dosen-pnl-${dateStr}.csv`);
    }
  }

  function downloadCsvFallback(data, filename) {
    if (!data.length) return;
    const headers = Object.keys(data[0]);
    const csvRows = [headers.join(';')];

    for (const row of data) {
      const values = headers.map(header => {
        const val = '' + (row[header] || '');
        const escaped = val.replace(/"/g, '""');
        return `"${escaped}"`;
      });
      csvRows.push(values.join(';'));
    }

    const blob = new Blob(['\uFEFF' + csvRows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

})();
