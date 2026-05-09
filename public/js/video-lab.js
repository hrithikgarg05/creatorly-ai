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

  // Replace with your deployed Railway app URL once deployed
  const API_URL = 'http://localhost:3001/api/analyse'; 
  // const API_URL = 'https://creatorly-videolab-production.up.railway.app/api/analyse';

  // ─── Drag & Drop ──────────────────────────────────────────────
  dropZone.addEventListener('click', () => fileInput.click());

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
    }
  });

  document.getElementById('analyzeAnotherBtn').addEventListener('click', () => {
    form.reset();
    fileInput.value = '';
    updateFileInfo();
    showSection('upload');
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
    
    s1.classList.add('active');
    s2.classList.remove('active');
    s3.classList.remove('active');

    setTimeout(() => { s1.classList.remove('active'); s2.classList.add('active'); }, 5000);
    setTimeout(() => { s2.classList.remove('active'); s3.classList.add('active'); }, 15000);
  }

  function renderResults(res) {
    // Top summary
    document.getElementById('overallScore').textContent = res.overall_score || '--';
    
    const perfText = res.predicted_performance ? res.predicted_performance.replace(/_/g, ' ').toUpperCase() : 'UNKNOWN';
    const perfEl = document.getElementById('predictedPerformance');
    perfEl.textContent = perfText;
    
    if (perfText.includes('VIRAL')) perfEl.style.color = 'var(--brand)';
    else if (perfText.includes('ABOVE')) perfEl.style.color = '#10b981';
    else perfEl.style.color = 'var(--text)';

    document.getElementById('overallSummary').textContent = res.overall_summary || 'Analysis complete.';
    
    // Tech badges
    document.getElementById('resDuration').textContent = res.video_info.duration.toFixed(1);
    document.getElementById('resCuts').textContent = res.technical.sceneCuts;
    document.getElementById('resLoudness').textContent = res.technical.loudnessLabel;

    // Categories
    updateCategory('scoreHook', 'hookNotes', res.hook);
    updateCategory('scoreRetention', 'retentionNotes', res.retention);
    updateCategory('scoreStructure', 'structureNotes', res.content_structure);
    
    // Combined A/V
    const avScore = Math.round(((res.audio_quality?.score || 0) + (res.visual_quality?.score || 0)) / 2) || '--';
    document.getElementById('scoreAV').textContent = avScore + '/10';
    const avNotes = [...(res.audio_quality?.improvements || []), ...(res.visual_quality?.improvements || [])];
    if(avNotes.length === 0) avNotes.push("Audio and visuals look good.");
    populateList('avNotes', avNotes.slice(0, 3));

    // Combined Metadata
    const metaScore = Math.round(((res.caption?.score || 0) + (res.hashtags?.score || 0)) / 2) || '--';
    document.getElementById('scoreMetadata').textContent = metaScore + '/10';
    const metaNotes = [...(res.caption?.improvements || []), ...(res.hashtags?.improvements || [])];
    if(metaNotes.length === 0) metaNotes.push("Caption and hashtags are optimized.");
    populateList('metadataNotes', metaNotes.slice(0, 3));

    // Wins / Fixes
    populateList('topWinsList', res.top_3_wins || ['Looks good overall'], true);
    populateList('topFixesList', res.top_3_fixes || ['No major fixes needed']);
  }

  function updateCategory(scoreId, listId, data) {
    document.getElementById(scoreId).textContent = data?.score ? data.score + '/10' : '--/10';
    const list = data?.improvements?.length ? data.improvements : (data?.strengths?.length ? data.strengths : ['No specific notes']);
    populateList(listId, list.slice(0, 2)); // Show top 2 points per category
  }

  function populateList(id, items, isWin = false) {
    const ul = document.getElementById(id);
    ul.innerHTML = '';
    const icon = isWin ? '<i class="fa-solid fa-check text-green"></i>' : '<i class="fa-solid fa-arrow-right"></i>';
    items.forEach(item => {
      const li = document.createElement('li');
      li.innerHTML = `${icon} <span>${item}</span>`;
      ul.appendChild(li);
    });
  }
});
