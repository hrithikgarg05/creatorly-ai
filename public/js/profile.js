// ── Profile page JS ───────────────────────────────────────────────────────────
// Fetches /api/profile from session, renders all stats and rate card

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatNumber(n) {
  if (n == null) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString('en-IN');
}

function formatINR(n) {
  if (n == null || n === 0) return '₹—';
  return '₹' + n.toLocaleString('en-IN');
}

// Animated counter
function animateCounter(el, target, isFloat = false, suffix = '') {
  const duration = 1200;
  const start = performance.now();
  const startVal = 0;

  function update(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3); // ease out cubic
    const val = startVal + (target - startVal) * ease;

    if (isFloat) {
      el.textContent = val.toFixed(2) + suffix;
    } else {
      el.textContent = formatNumber(Math.round(val)) + suffix;
    }

    if (progress < 1) requestAnimationFrame(update);
    else el.textContent = isFloat ? target.toFixed(2) + suffix : formatNumber(target) + suffix;
  }
  requestAnimationFrame(update);
}

// ─── Render ───────────────────────────────────────────────────────────────────

function renderProfile(data) {
  // Profile card
  const pic = document.getElementById('profilePicture');
  if (data.profilePicture) {
    pic.src = data.profilePicture;
    pic.alt = data.name + ' profile picture';
  } else {
    pic.style.display = 'none';
  }

  document.getElementById('profileName').textContent = data.name || data.username;
  document.getElementById('profileUsername').textContent = '@' + data.username;
  const bio = document.getElementById('profileBio');
  bio.textContent = data.biography || '';
  if (!data.biography) bio.style.display = 'none';

  // Core stats — animated
  setTimeout(() => {
    animateCounter(document.getElementById('followersCount'), data.followers);
    animateCounter(document.getElementById('followingCount'), data.following);
    animateCounter(document.getElementById('postsCount'), data.totalPosts);
    animateCounter(document.getElementById('engagementRate'), data.engagementRate, true);
  }, 300);

  // Engagement label
  const label = data.engagementLabel;
  const labelEl = document.getElementById('engagementLabel');
  if (labelEl && label) {
    labelEl.textContent = label.emoji + ' ' + label.label;
    labelEl.style.background = label.color + '22';
    labelEl.style.color = label.color;
    labelEl.style.border = `1px solid ${label.color}44`;
  }

  // Averages
  document.getElementById('postsAnalyzed').textContent = data.postsAnalyzed;
  setTimeout(() => {
    animateCounter(document.getElementById('avgLikes'), data.avgLikes);
    animateCounter(document.getElementById('avgComments'), data.avgComments);
    animateCounter(document.getElementById('avgImpressions'), data.avgImpressions);
    animateCounter(document.getElementById('avgReach'), data.avgReach);
  }, 500);

  // Render Recent Reels
  const reelsGrid = document.getElementById('reelsGrid');
  const reelsSection = document.getElementById('reelsSection');
  if (data.recentReels && data.recentReels.length > 0) {
    reelsSection.style.display = 'block';
    reelsGrid.innerHTML = '';
    data.recentReels.forEach(reel => {
      const card = document.createElement('div');
      card.className = 'reel-card';
      const thumbUrl = reel.thumbnail || '';
      card.innerHTML = `
        <img src="${thumbUrl}" class="reel-thumbnail" alt="Reel thumbnail">
        <div class="reel-overlay">
          <div class="reel-stat"><span>❤️</span> ${formatNumber(reel.likes)}</div>
          <div class="reel-stat"><span>💬</span> ${formatNumber(reel.comments)}</div>
        </div>
        <a href="${reel.url}" target="_blank" class="reel-link"></a>
      `;
      reelsGrid.appendChild(card);
    });
  }

  // Rate card
  const rc = data.rateCard;
  setTimeout(() => {
    document.getElementById('reelRate').textContent = formatINR(rc.reel);
    document.getElementById('storyRate').textContent = formatINR(rc.story);
    document.getElementById('postRate').textContent = formatINR(rc.post);
    document.getElementById('bundleRate').textContent = formatINR(rc.bundle);
    const savingsEl = document.getElementById('bundleSavings');
    if (savingsEl && rc.bundleSavings > 0) {
      savingsEl.textContent = `You save ${formatINR(rc.bundleSavings)}`;
    }
  }, 700);
}

// ─── Copy Rate Card ───────────────────────────────────────────────────────────

function copyRateCard() {
  const data = window._profileData;
  if (!data) return;

  const rc = data.rateCard;
  const text = `📊 Creatorly AI — Rate Card for @${data.username}

👥 Followers: ${formatNumber(data.followers)}
🔥 Engagement Rate: ${data.engagementRate}% (${data.engagementLabel.label})

🇮🇳 India Rate Card
🎬 Instagram Reel: ${formatINR(rc.reel)}
⏱️ Story (3 Frames): ${formatINR(rc.story)}
🖼️ Static Post: ${formatINR(rc.post)}
🎁 Full Bundle: ${formatINR(rc.bundle)} (save ${formatINR(rc.bundleSavings)})

📊 Based on ${data.postsAnalyzed} recent posts | Avg Impressions: ${formatNumber(data.avgImpressions)}
✅ Verified via Instagram · Powered by Creatorly AI`;

  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('copyRateCard');
    const orig = btn.innerHTML;
    btn.innerHTML = '✅ Copied!';
    btn.style.background = '#22c55e';
    btn.style.color = '#fff';
    setTimeout(() => {
      btn.innerHTML = orig;
      btn.style.background = '';
      btn.style.color = '';
    }, 2000);
  }).catch(() => {
    alert('Could not copy. Please try manually selecting the rate card.');
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  try {
    const res = await fetch('/api/profile');

    if (!res.ok) {
      window.location.href = '/?error=session_expired';
      return;
    }

    const data = await res.json();
    window._profileData = data;

    // Hide loading, show main
    const loading = document.getElementById('loadingScreen');
    const main = document.getElementById('profileMain');

    renderProfile(data);

    // Smooth reveal
    loading.style.transition = 'opacity 0.4s';
    loading.style.opacity = '0';
    setTimeout(() => {
      loading.style.display = 'none';
      main.style.transition = 'opacity 0.5s';
      main.style.opacity = '1';
    }, 400);

  } catch (err) {
    console.error('Failed to load profile:', err);
    window.location.href = '/?error=api_error';
  }
}

document.addEventListener('DOMContentLoaded', init);
