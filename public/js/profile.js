// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatNumber(n) {
  if (!n && n !== 0) return '—';
  if (n >= 10_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000_000)  return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 100_000)    return (n / 1_000).toFixed(0) + 'K';
  if (n >= 10_000)     return (n / 1_000).toFixed(1) + 'K';
  if (n >= 1_000)      return (n / 1_000).toFixed(2) + 'K';
  return n.toLocaleString('en-IN');
}

function formatINR(n) {
  if (!n && n !== 0) return '₹—';
  if (n >= 10_00_000) return '₹' + (n / 10_00_000).toFixed(2) + 'L';
  if (n >= 1_00_000)  return '₹' + (n / 1_00_000).toFixed(2) + 'L';
  if (n >= 1_000)     return '₹' + (n / 1_000).toFixed(1) + 'K';
  return '₹' + n.toLocaleString('en-IN');
}

function animateCounter(el, target, isDecimal = false) {
  if (!el) return;
  if (target === null || target === undefined) {
    el.textContent = 'N/A';
    el.style.color = 'var(--text-dim)';
    return;
  }
  if (target === 0 && !isDecimal) {
    el.textContent = '0';
    return;
  }
  const duration = 1200;
  const startTime = performance.now();
  const update = (now) => {
    const progress = Math.min((now - startTime) / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    const current = (target) * ease;
    el.textContent = isDecimal ? current.toFixed(2) : formatNumber(Math.round(current));
    if (progress < 1) requestAnimationFrame(update);
  };
  requestAnimationFrame(update);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  try {
    const res = await fetch('/api/profile');
    if (!res.ok) {
      window.location.href = '/?error=session_expired';
      return;
    }
    const data = await res.json();
    if (data.error) {
      window.location.href = '/?error=api_error&msg=' + encodeURIComponent(data.error);
      return;
    }
    window._profileData = data;
    renderProfile(data);
  } catch (e) {
    window.location.href = '/?error=api_error';
  }
});

function renderProfile(data) {
  // Profile pic & name
  const pic = document.getElementById('profilePicture');
  if (pic && data.profilePicture) pic.src = data.profilePicture;
  setText('profileName', data.name);
  setText('profileUsername', '@' + data.username);
  setText('profileBio', data.biography);

  // Website
  const webEl = document.getElementById('profileWebsite');
  if (webEl && data.website) {
    webEl.href = data.website;
    webEl.textContent = data.website.replace(/^https?:\/\//, '');
    webEl.style.display = 'inline-flex';
  }

  // Tier badge
  const tierEl = document.getElementById('tierBadge');
  if (tierEl && data.tier) {
    tierEl.textContent = data.tier.short;
    tierEl.style.background = data.tier.color + '22';
    tierEl.style.color = data.tier.color;
    tierEl.style.border = `1px solid ${data.tier.color}55`;
  }

  // Niche badge
  const nicheEl = document.getElementById('nicheBadge');
  if (nicheEl && data.niche) {
    nicheEl.textContent = data.niche.emoji + ' ' + data.niche.name;
    nicheEl.style.background = data.niche.color + '22';
    nicheEl.style.color = data.niche.color;
    nicheEl.style.border = `1px solid ${data.niche.color}55`;
  }

  // ─── 10 Brand Metrics Calculation ───
  setTimeout(() => {
    const raw = data._raw || [];
    const reels = raw.filter(p => p.type === 'VIDEO' || p.type === 'REELS');
    
    // Helpers
    const sum = (arr, key) => arr.reduce((acc, obj) => acc + (obj[key] || 0), 0);
    const median = (arr) => {
      if (arr.length === 0) return 0;
      const sorted = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    };

    // 1 & 2. Reel Views
    const reelViews = reels.map(r => r.views || 0);
    const totalReelViews = sum(reels, 'views');
    const avgReelViews = reels.length > 0 ? totalReelViews / reels.length : 0;
    const medianReelViews = median(reelViews);

    // 3. Avg Reach
    const totalReach = sum(raw, 'reach');
    const avgReach = raw.length > 0 ? totalReach / raw.length : 0;
    
    // 4. Reach Rate
    const followers = data.followers || 1; // avoid division by zero
    const reachRate = (avgReach / followers) * 100;

    // Engagement Totals
    const totalLikes = sum(raw, 'likes');
    const totalComments = sum(raw, 'comments');
    const totalSaves = sum(raw, 'saved');
    const totalShares = sum(raw, 'shares');
    
    // 5 & 6. Engagement Rates
    const erByReach = totalReach > 0 ? ((totalLikes + totalComments + totalSaves + totalShares) / totalReach) * 100 : 0;
    const trueEr = totalReach > 0 ? ((totalComments + totalSaves + totalShares) / totalReach) * 100 : 0;
    
    // 7 & 8. Save/Share Rates
    const saveRate = totalReach > 0 ? (totalSaves / totalReach) * 100 : 0;
    const shareRate = totalReach > 0 ? (totalShares / totalReach) * 100 : 0;

    // 9. Audience Match (Top Demographic)
    const topDemo = data.topDemographic || 'Data unavailable';

    // 10. Consistency Score
    const consistencyScore = avgReelViews > 0 ? (medianReelViews / avgReelViews) * 100 : 0;

    // Render Metrics
    animateCounter(document.getElementById('m_avgReelViews'), avgReelViews);
    animateCounter(document.getElementById('m_medianReelViews'), medianReelViews);
    animateCounter(document.getElementById('m_avgReach'), avgReach);
    animateCounter(document.getElementById('m_reachRate'), reachRate, true);
    animateCounter(document.getElementById('m_erByReach'), erByReach, true);
    animateCounter(document.getElementById('m_trueEr'), trueEr, true);
    animateCounter(document.getElementById('m_saveRate'), saveRate, true);
    animateCounter(document.getElementById('m_shareRate'), shareRate, true);
    
    const demoEl = document.getElementById('m_audienceMatch');
    if (demoEl) demoEl.textContent = topDemo;
    
    animateCounter(document.getElementById('m_consistencyScore'), consistencyScore, true);
  }, 300);

  // Rate card niche info
  const rateInfoEl = document.getElementById('rateNicheInfo');
  if (rateInfoEl && data.niche && data.tier) {
    rateInfoEl.innerHTML = `
      <span class="rni-tag" style="background:${data.tier.color}22;color:${data.tier.color};border:1px solid ${data.tier.color}44">
        ${data.tier.name}
      </span>
      <span class="rni-tag" style="background:${data.niche.color}22;color:${data.niche.color};border:1px solid ${data.niche.color}44">
        ${data.niche.emoji} ${data.niche.name} · ${data.niche.multiplier}x multiplier
      </span>
      <span class="rni-tag" style="background:#ffffff11;color:#aaa;border:1px solid #ffffff22">
        ${data.engagementLabel.emoji} ${data.engagementLabel.label} engagement
      </span>
    `;
  }

  // Rate amounts
  setTimeout(() => {
    const rc = data.rateCard;
    setText('reelRate', formatINR(rc.reel));
    setText('postRate', formatINR(rc.post));
    setText('storyRate', formatINR(rc.story));
    setText('bundleRate', formatINR(rc.bundle));
    const savEl = document.getElementById('bundleSavings');
    if (savEl && rc.bundleSavings > 0) savEl.textContent = `You save ${formatINR(rc.bundleSavings)}`;
  }, 700);

  // Best post
  if (data.bestPost) {
    const section = document.getElementById('bestPostSection');
    if (section) section.style.display = 'block';
    const thumb = document.getElementById('bestPostThumb');
    if (thumb && data.bestPost.thumbnail) thumb.src = data.bestPost.thumbnail;
    const link = document.getElementById('bestPostLink');
    if (link) link.href = data.bestPost.url;
    setTimeout(() => {
      animateCounter(document.getElementById('bpLikes'), data.bestPost.likes);
      animateCounter(document.getElementById('bpComments'), data.bestPost.comments);
      animateCounter(document.getElementById('bpSaved'), data.bestPost.saved);
      animateCounter(document.getElementById('bpReach'), data.bestPost.reach);
    }, 600);
  }

  // Recent Reels
  const reelsGrid = document.getElementById('reelsGrid');
  const reelsSection = document.getElementById('reelsSection');
  if (data.recentReels && data.recentReels.length > 0 && reelsGrid) {
    reelsSection.style.display = 'block';
    reelsGrid.innerHTML = '';
    data.recentReels.forEach(reel => {
      const card = document.createElement('div');
      card.className = 'reel-card';
      card.innerHTML = `
        <img src="${reel.thumbnail || ''}" class="reel-thumbnail" alt="Reel">
        <div class="reel-overlay">
          <div class="reel-stat"><span>❤️</span> ${formatNumber(reel.likes)}</div>
          <div class="reel-stat"><span>💬</span> ${formatNumber(reel.comments)}</div>
          <div class="reel-stat"><span>💾</span> ${formatNumber(reel.saved)}</div>
        </div>
        <a href="${reel.url}" target="_blank" class="reel-link"></a>
      `;
      reelsGrid.appendChild(card);
    });
  }

  // Fade in
  const main = document.getElementById('profileMain');
  const loading = document.getElementById('loadingScreen');
  if (loading) loading.style.display = 'none';
  if (main) { main.style.transition = 'opacity 0.6s'; main.style.opacity = '1'; }
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value || '';
}

// ─── Copy Rate Card ───────────────────────────────────────────────────────────
function copyRateCard() {
  const data = window._profileData;
  if (!data) return;
  const rc = data.rateCard;
  const text = `📊 Creatorly AI — Creator Card for @${data.username}

👤 ${data.name} · ${data.tier.name} · ${data.niche.emoji} ${data.niche.name}
👥 Followers: ${formatNumber(data.followers)}
🔥 Engagement Rate: ${data.engagementRate}% (${data.engagementLabel.label})
📡 Avg Reach/Post: ${formatNumber(data.avgReach)}
💾 Save Rate: ${data.saveRate}%

🇮🇳 India Rate Card (Minimum Suggested)
🎬 Instagram Reel: ${formatINR(rc.reel)}
🖼️ Static Post: ${formatINR(rc.post)}
⏱️ Story (3 Frames): ${formatINR(rc.story)}
🎁 Full Bundle: ${formatINR(rc.bundle)} (save ${formatINR(rc.bundleSavings)})

📅 Last 28 Days
🌍 Reach: ${formatNumber(data.reach28)} · 👁️ Impressions: ${formatNumber(data.impressions28)} · 🏠 Profile Views: ${formatNumber(data.profileViews28)}

✅ Verified via Instagram · Powered by Creatorly AI · creatorlyai.in`;

  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('copyRateCard');
    const orig = btn.innerHTML;
    btn.innerHTML = '✅ Copied to clipboard!';
    btn.style.background = '#22c55e';
    setTimeout(() => { btn.innerHTML = orig; btn.style.background = ''; }, 2500);
  }).catch(() => alert('Could not copy. Please select the rate card manually.'));
}
