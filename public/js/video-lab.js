document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('uploadForm');
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('videoFile');
  const fileInfo = document.getElementById('fileInfo');
  const fileName = document.getElementById('fileName');
  const clearFileBtn = document.getElementById('clearFile');
  
  const sections = {
    upload: document.getElementById('uploadSection'),
    loading: document.getElementById('loadingSection'),
    results: document.getElementById('resultsSection')
  };

  const API_URL = 'https://creatorly-videolab-production.up.railway.app/api/analyse';

  // ─── Drag & Drop ──────────────────────────────────────────────
  dropZone.addEventListener('click', (e) => {
    if (e.target.tagName !== 'BUTTON') {
      fileInput.click();
    }
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-active');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-active');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-active');
    if (e.dataTransfer.files.length) {
      fileInput.files = e.dataTransfer.files;
      updateFileInfo();
    }
  });

  fileInput.addEventListener('change', updateFileInfo);

  clearFileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.value = '';
    updateFileInfo();
  });

  function updateFileInfo() {
    if (fileInput.files.length > 0) {
      const file = fileInput.files[0];
      fileName.textContent = `${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`;
      dropZone.classList.add('hidden');
      fileInfo.classList.remove('hidden');
    } else {
      dropZone.classList.remove('hidden');
      fileInfo.classList.add('hidden');
    }
  }

  // ─── Form Submission ──────────────────────────────────────────
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (fileInput.files.length === 0) return alert('Please select a video file.');

    const formData = new FormData(form);
    const analyzeBtn = document.getElementById('analyzeBtn');
    analyzeBtn.disabled = true;
    analyzeBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading...';
    
    showSection('loading');
    simulateLoadingSteps();

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to analyze video');
      }

      renderResults(data.results);
      showSection('results');
    } catch (err) {
      console.error(err);
      alert('Analysis Error: ' + err.message);
      showSection('upload');
    } finally {
      analyzeBtn.disabled = false;
      analyzeBtn.innerHTML = 'Analyse Reel <i class="fa-solid fa-arrow-right"></i>';
    }
  });

  document.getElementById('analyzeAnotherBtn').addEventListener('click', () => {
    form.reset();
    fileInput.value = '';
    updateFileInfo();
    showSection('upload');
    window.scrollTo(0, 0);
  });

  // ─── UI Helpers ───────────────────────────────────────────────
  function showSection(name) {
    Object.values(sections).forEach(sec => sec.classList.add('hidden'));
    sections[name].classList.remove('hidden');
  }

  function simulateLoadingSteps() {
    const s1 = document.getElementById('step1');
    const s2 = document.getElementById('step2');
    const s3 = document.getElementById('step3');
    const i1 = s1.querySelector('i');
    const i2 = s2.querySelector('i');
    const i3 = s3.querySelector('i');
    
    s1.style.color = 'white'; i1.classList.add('fa-spin'); i1.style.opacity = '1';
    s2.style.color = ''; i2.classList.remove('fa-spin'); i2.style.opacity = '0';
    s3.style.color = ''; i3.classList.remove('fa-spin'); i3.style.opacity = '0';

    setTimeout(() => { 
      s1.style.color = 'var(--text-muted)'; i1.classList.remove('fa-spin'); i1.className = 'fa-solid fa-check'; i1.style.color = 'var(--success)';
      s2.style.color = 'white'; i2.className = 'fa-solid fa-spinner fa-spin'; i2.style.opacity = '1';
    }, 4000);

    setTimeout(() => { 
      s2.style.color = 'var(--text-muted)'; i2.classList.remove('fa-spin'); i2.className = 'fa-solid fa-check'; i2.style.color = 'var(--success)';
      s3.style.color = 'white'; i3.className = 'fa-solid fa-spinner fa-spin'; i3.style.opacity = '1';
    }, 12000);
  }

  function renderResults(res) {
    // Determine performance badge
    const perfStr = res.predicted_performance || 'average';
    let badgeText = 'AVERAGE';
    let badgeClass = 'average';
    let titleText = 'Average Potential';
    let color = 'var(--warning)';

    if (perfStr.includes('below')) {
      badgeText = '⬇️ BELOW AVERAGE';
      badgeClass = '';
      titleText = 'Needs Work';
      color = 'var(--danger)';
    } else if (perfStr.includes('above')) {
      badgeText = '⬆️ ABOVE AVERAGE';
      badgeClass = 'good';
      titleText = 'Strong Potential';
      color = 'var(--success)';
    } else if (perfStr.includes('viral')) {
      badgeText = '🚀 VIRAL POTENTIAL';
      badgeClass = 'viral';
      titleText = 'Viral Material';
      color = 'var(--brand-purple-light)';
    }

    const badgeEl = document.getElementById('predictedPerformance');
    badgeEl.className = 'performance-badge ' + badgeClass;
    badgeEl.textContent = badgeText;
    document.getElementById('overallTitle').textContent = titleText;

    // Overall Score (average of main categories)
    const categories = ['hook', 'retention', 'visual_quality', 'audio_quality', 'content_structure', 'editing'];
    let totalScore = 0;
    let count = 0;
    categories.forEach(c => {
      if (res[c] && res[c].score) {
        totalScore += res[c].score;
        count++;
      }
    });
    const avgScore = count > 0 ? (totalScore / count).toFixed(1) : 0;
    
    document.getElementById('overallScore').textContent = avgScore;
    document.getElementById('overallSummary').textContent = res.overall_summary || 'Analysis complete.';

    // Progress circle
    const progressCircle = document.getElementById('mainProgress');
    const circumference = 251.2; // 2 * pi * 40
    const offset = circumference - (avgScore / 10) * circumference;
    progressCircle.style.strokeDashoffset = offset;
    progressCircle.style.stroke = color;

    // Top Wins & Fixes
    populateList('topWinsList', res.top_3_wins || [], '<span style="color:var(--success);">●</span>');
    populateList('topFixesList', res.top_3_fixes || [], '<span style="color:var(--danger);">●</span>');

    // Build Masonry Grid
    const grid = document.getElementById('breakdownGrid');
    grid.innerHTML = '';
    
    const renderCard = (title, data) => {
      if (!data) return;
      const score = data.score || 0;
      let barColor = 'var(--danger)';
      if (score >= 4) barColor = 'var(--warning)';
      if (score >= 7) barColor = 'var(--success)';

      let subscoresHTML = '';
      if (data.sub_scores) {
        Object.entries(data.sub_scores).forEach(([key, val]) => {
          const readableKey = key.replace(/_/g, ' ').toLowerCase();
          subscoresHTML += `<div class="bd-subscore-item"><span>${readableKey}</span><span>${val}</span></div>`;
        });
      }

      let strengthsHTML = '';
      if (data.strengths && data.strengths.length > 0) {
        strengthsHTML += `<h4>Strengths</h4><ul>`;
        data.strengths.forEach(s => strengthsHTML += `<li>${s}</li>`);
        strengthsHTML += `</ul>`;
      }

      let improvementsHTML = '';
      if (data.improvements && data.improvements.length > 0) {
        improvementsHTML += `<h4>Improvements</h4><ul>`;
        data.improvements.forEach(s => improvementsHTML += `<li>${s}</li>`);
        improvementsHTML += `</ul>`;
      }

      const card = document.createElement('div');
      card.className = 'breakdown-card';
      card.innerHTML = `
        <div class="bd-title">${title}</div>
        <div class="bd-score-row">
          <div class="bd-score-val" style="color:${barColor}">${score}</div>
          <div class="bd-score-bar-bg">
            <div class="bd-score-bar-fill" style="width:0%; background:${barColor};"></div>
          </div>
        </div>
        <div class="bd-subscores">
          ${subscoresHTML}
        </div>
        <div class="bd-notes">
          ${strengthsHTML}
          ${improvementsHTML}
        </div>
      `;
      grid.appendChild(card);

      // Animate progress bar after short delay
      setTimeout(() => {
        const fill = card.querySelector('.bd-score-bar-fill');
        if (fill) fill.style.width = (score * 10) + '%';
      }, 100);
    };

    renderCard('Hook', res.hook);
    renderCard('Retention', res.retention);
    renderCard('Visual Quality', res.visual_quality);
    renderCard('Audio Quality', res.audio_quality);
    renderCard('Content Structure', res.content_structure);
    renderCard('Editing', res.editing);
    if(res.text_subtitles) renderCard('Text / Subtitles', res.text_subtitles);
    if(res.compliance) renderCard('Compliance', res.compliance);
  }

  function populateList(id, items, iconHtml) {
    const ul = document.getElementById(id);
    ul.innerHTML = '';
    items.forEach(item => {
      const li = document.createElement('li');
      li.innerHTML = `${iconHtml} <span>${item}</span>`;
      ul.appendChild(li);
    });
  }
});
