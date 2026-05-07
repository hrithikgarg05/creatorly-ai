require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const APP_ID = process.env.APP_ID;
const APP_SECRET = process.env.APP_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const GRAPH_BASE = 'https://graph.instagram.com/v21.0';
const COOKIE_SECRET = process.env.SESSION_SECRET || 'creatorly_secret_2024';

// ─── Middleware ──────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(cookieParser(COOKIE_SECRET));

// ─── Helper: fetch with error handling ──────────────────────────────────────
async function graphFetch(url, options = {}) {
  const { default: fetch } = await import('node-fetch');
  const res = await fetch(url, options);
  const data = await res.json();
  if (data.error_message || data.error) {
    const msg = data.error_message || (data.error && data.error.message) || 'Graph API error';
    throw new Error(msg);
  }
  return data;
}

// Safe graphFetch that returns null on error (for optional endpoints)
async function graphFetchSafe(url, options = {}) {
  try { return await graphFetch(url, options); } catch { return null; }
}

// ─── Routes ─────────────────────────────────────────────────────────────────

app.get('/', (req, res) => {
  const html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  res.send(html);
});

app.get('/profile', (req, res) => {
  if (!req.signedCookies.ig_token) {
    return res.redirect('/?error=session_expired');
  }
  const html = fs.readFileSync(path.join(__dirname, 'public', 'profile.html'), 'utf8');
  res.send(html);
});

// Start OAuth
app.get('/auth/instagram', (req, res) => {
  const scopes = [
    'instagram_business_basic',
    'instagram_business_manage_insights'
  ].join(',');

  const authUrl = `https://www.instagram.com/oauth/authorize?` +
    `enable_fb_login=0` +
    `&force_authentication=1` +
    `&client_id=${APP_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(scopes)}`;

  res.redirect(authUrl);
});

// OAuth callback
app.get('/auth/callback', async (req, res) => {
  const { code, error, error_description } = req.query;
  if (error || !code) {
    return res.redirect('/?error=oauth_denied&msg=' + encodeURIComponent(error_description || error));
  }
  try {
    const tokenUrl = 'https://api.instagram.com/oauth/access_token';
    const params = new URLSearchParams();
    params.append('client_id', APP_ID);
    params.append('client_secret', APP_SECRET);
    params.append('grant_type', 'authorization_code');
    params.append('redirect_uri', REDIRECT_URI);
    params.append('code', code);

    const tokenData = await graphFetch(tokenUrl, { method: 'POST', body: params });
    const accessToken = tokenData.access_token;

    res.cookie('ig_token', accessToken, {
      signed: true,
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000
    });
    res.send(`<!DOCTYPE html><html><head><title>Connecting...</title></head><body>
      <script>window.location.href = '/profile';</script>
      <p>Connecting to your dashboard...</p>
    </body></html>`);
  } catch (err) {
    console.error('OAuth callback error:', err.message);
    res.redirect('/?error=api_error&msg=' + encodeURIComponent(err.message));
  }
});

// ─── API: Full profile data ──────────────────────────────────────────────────
app.get('/api/profile', async (req, res) => {
  const accessToken = req.signedCookies.ig_token;
  if (!accessToken) {
    return res.status(401).json({ error: 'No active session' });
  }

  try {
    // 1. Fetch profile
    const profileFields = 'id,username,name,biography,followers_count,follows_count,media_count,profile_picture_url,website';
    const profile = await graphFetch(
      `${GRAPH_BASE}/me?fields=${profileFields}&access_token=${accessToken}`
    );
    const igUserId = profile.id;

    // 2. Fetch last 12 posts
    const mediaData = await graphFetch(
      `${GRAPH_BASE}/me/media?fields=id,media_type,media_product_type,media_url,thumbnail_url,permalink,like_count,comments_count,timestamp&limit=12&access_token=${accessToken}`
    );
    const posts = mediaData.data || [];

    // 3. Fetch per-post insights (reach, saved, impressions) — safe, won't crash if unavailable
    const postsWithInsights = await Promise.all(
      posts.map(async (post) => {
        const insightData = await graphFetchSafe(
          `${GRAPH_BASE}/${post.id}/insights?metric=reach,saved,impressions&access_token=${accessToken}`
        );
        const insightMap = {};
        if (insightData && insightData.data) {
          insightData.data.forEach(m => { insightMap[m.name] = m.values?.[0]?.value ?? m.value ?? 0; });
        }
        return { ...post, reach: insightMap.reach || 0, saved: insightMap.saved || 0, impressions: insightMap.impressions || 0 };
      })
    );

    // 4. Fetch 28-day account-level insights (try two endpoint formats)
    const now = Math.floor(Date.now() / 1000);
    const since28 = now - (28 * 24 * 60 * 60);
    // Try /me/insights first (new Business Login API), fallback to /{id}/insights
    let accountInsights = await graphFetchSafe(
      `${GRAPH_BASE}/me/insights?metric=reach,impressions,profile_views&period=day&since=${since28}&until=${now}&access_token=${accessToken}`
    );
    if (!accountInsights || !accountInsights.data || accountInsights.data.length === 0) {
      accountInsights = await graphFetchSafe(
        `${GRAPH_BASE}/${igUserId}/insights?metric=reach,impressions,profile_views&period=day&since=${since28}&until=${now}&access_token=${accessToken}`
      );
    }

    let totalReach28 = null, totalImpressions28 = null, totalProfileViews28 = null;
    if (accountInsights && accountInsights.data && accountInsights.data.length > 0) {
      accountInsights.data.forEach(metric => {
        const total = (metric.values || []).reduce((s, v) => s + (v.value || 0), 0);
        if (metric.name === 'reach') totalReach28 = total;
        if (metric.name === 'impressions') totalImpressions28 = total;
        if (metric.name === 'profile_views') totalProfileViews28 = total;
      });
    }

    // 5. Calculate metrics
    const metrics = calculateMetrics(postsWithInsights, profile.followers_count);

    // 6. Detect niche from bio
    const niche = detectNiche(profile.biography || '');

    // 7. Detect creator tier
    const tier = detectTier(profile.followers_count);

    // 8. Calculate smart rate card
    const rateCard = calculateSmartRateCard(profile.followers_count, metrics.engagementRate, niche, tier);

    // 9. Recent Reels
    const recentReels = postsWithInsights
      .filter(p => p.media_type === 'VIDEO' || p.media_product_type === 'REELS')
      .slice(0, 3)
      .map(r => ({
        id: r.id,
        url: r.permalink,
        thumbnail: r.thumbnail_url || r.media_url,
        likes: r.like_count || 0,
        comments: r.comments_count || 0,
        saved: r.saved || 0,
        reach: r.reach || 0,
        impressions: r.impressions || 0
      }));

    // 10. Best performing post
    const bestPost = [...postsWithInsights].sort((a, b) =>
      ((b.like_count || 0) + (b.comments_count || 0) + (b.saved || 0)) -
      ((a.like_count || 0) + (a.comments_count || 0) + (a.saved || 0))
    )[0] || null;

    const profileData = {
      username: profile.username,
      name: profile.name || profile.username,
      biography: profile.biography || '',
      website: profile.website || '',
      followers: profile.followers_count,
      following: profile.follows_count,
      totalPosts: profile.media_count,
      profilePicture: profile.profile_picture_url,

      // Engagement
      engagementRate: metrics.engagementRate,
      engagementLabel: getEngagementLabel(metrics.engagementRate),
      avgLikes: metrics.avgLikes,
      avgComments: metrics.avgComments,
      avgSaved: metrics.avgSaved,
      saveRate: metrics.saveRate,
      avgReach: metrics.avgReach,
      avgImpressions: metrics.avgImpressions,

      // 28-day real data
      reach28: totalReach28,
      impressions28: totalImpressions28,
      profileViews28: totalProfileViews28,

      // Tier & niche
      tier,
      niche,

      // Content
      postsAnalyzed: posts.length,
      recentReels,
      bestPost: bestPost ? {
        url: bestPost.permalink,
        thumbnail: bestPost.thumbnail_url || bestPost.media_url,
        likes: bestPost.like_count || 0,
        comments: bestPost.comments_count || 0,
        saved: bestPost.saved || 0,
        reach: bestPost.reach || 0,
        type: bestPost.media_product_type || bestPost.media_type
      } : null,

      rateCard,
      fetchedAt: new Date().toISOString()
    };

    res.json(profileData);
  } catch (err) {
    console.error('API Profile Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Logout
app.get('/logout', (req, res) => {
  res.clearCookie('ig_token');
  res.redirect('/');
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calculateMetrics(posts, followers) {
  if (!posts.length) return { engagementRate: 0, avgLikes: 0, avgComments: 0, avgSaved: 0, saveRate: 0, avgImpressions: 0, avgReach: 0, hasRealReach: false };
  const n = posts.length;
  const avgLikes = Math.round(posts.reduce((s, p) => s + (p.like_count || 0), 0) / n);
  const avgComments = Math.round(posts.reduce((s, p) => s + (p.comments_count || 0), 0) / n);
  const avgSaved = Math.round(posts.reduce((s, p) => s + (p.saved || 0), 0) / n);

  // Use real reach if the API returned it, else fall back to followers-based estimate
  const realReachData = posts.filter(p => p.reach > 0);
  const hasRealReach = realReachData.length > 0;
  const avgReach = hasRealReach
    ? Math.round(realReachData.reduce((s, p) => s + p.reach, 0) / realReachData.length)
    : null; // null means "not available"

  const realImpressionsData = posts.filter(p => p.impressions > 0);
  const avgImpressions = realImpressionsData.length > 0
    ? Math.round(realImpressionsData.reduce((s, p) => s + p.impressions, 0) / realImpressionsData.length)
    : null;

  // ── ENGAGEMENT RATE ──
  // Industry standard formula: (likes + comments) / followers * 100
  // We add saves too since the API provides it, but use FOLLOWERS as denominator
  // (not reach) unless real reach data is available
  const followerBase = followers || 1;
  const totalEngagement = avgLikes + avgComments + avgSaved;
  const engagementRate = parseFloat((totalEngagement / followerBase * 100).toFixed(2));

  // Save rate = saves / followers (or saves / avg reach if available)
  const saveBase = (hasRealReach && avgReach > 0) ? avgReach : followerBase;
  const saveRate = avgSaved > 0 ? parseFloat((avgSaved / saveBase * 100).toFixed(2)) : 0;

  return { engagementRate, avgLikes, avgComments, avgSaved, saveRate, avgImpressions, avgReach, hasRealReach };
}

function detectNiche(bio) {
  const b = bio.toLowerCase();
  if (/finance|invest|stock|crypto|trading|fintech|money|wealth|ca |chartered/.test(b)) return { name: 'Finance', multiplier: 2.5, emoji: '💰', color: '#10b981' };
  if (/tech|software|coding|developer|ai |saas|startup|entrepreneur|founder/.test(b)) return { name: 'Tech / Business', multiplier: 2.0, emoji: '💻', color: '#6366f1' };
  if (/health|fitness|gym|workout|nutrition|yoga|wellness|doctor|dr\.|mbbs/.test(b)) return { name: 'Health & Fitness', multiplier: 1.6, emoji: '💪', color: '#f59e0b' };
  if (/beauty|makeup|skincare|cosmetic|hair|glam|glow/.test(b)) return { name: 'Beauty', multiplier: 1.5, emoji: '💄', color: '#ec4899' };
  if (/travel|wanderlust|explorer|adventure|backpack/.test(b)) return { name: 'Travel', multiplier: 1.4, emoji: '✈️', color: '#0ea5e9' };
  if (/fashion|style|outfit|ootd|model|designer|wear/.test(b)) return { name: 'Fashion', multiplier: 1.3, emoji: '👗', color: '#a855f7' };
  if (/food|recipe|chef|cook|bake|foodie|eat|restaurant|cafe/.test(b)) return { name: 'Food', multiplier: 1.2, emoji: '🍽️', color: '#f97316' };
  if (/education|learn|student|teacher|study|tutor|mentor/.test(b)) return { name: 'Education', multiplier: 1.8, emoji: '📚', color: '#3b82f6' };
  if (/comedy|meme|humor|funny|entertain|actor|actress/.test(b)) return { name: 'Entertainment', multiplier: 0.9, emoji: '🎭', color: '#eab308' };
  if (/game|gaming|gamer|esport|stream|twitch/.test(b)) return { name: 'Gaming', multiplier: 1.1, emoji: '🎮', color: '#7c3aed' };
  return { name: 'Lifestyle', multiplier: 1.0, emoji: '✨', color: '#64748b' };
}

function detectTier(followers) {
  if (followers >= 1_000_000) return { name: 'Mega Creator', short: 'MEGA', min: 6_00_000, max: 25_00_000, color: '#f59e0b' };
  if (followers >= 500_000)  return { name: 'Macro Creator', short: 'MACRO', min: 2_50_000, max: 6_00_000, color: '#8b5cf6' };
  if (followers >= 100_000)  return { name: 'Mid-Tier Creator', short: 'MID', min: 75_000, max: 2_50_000, color: '#3b82f6' };
  if (followers >= 10_000)   return { name: 'Micro Creator', short: 'MICRO', min: 10_000, max: 75_000, color: '#22c55e' };
  return                      { name: 'Nano Creator', short: 'NANO', min: 2_000, max: 10_000, color: '#64748b' };
}

function calculateSmartRateCard(followers, engagementRate, niche, tier) {
  // Base rate from tier range midpoint
  const baseMidpoint = Math.round((tier.min + tier.max) / 2);

  // Engagement adjustment: standard is 3%. Above = premium, below = discount
  const engagementBonus = engagementRate >= 6 ? 1.4
    : engagementRate >= 3 ? 1.15
    : engagementRate >= 1 ? 0.9
    : 0.75;

  const reelRate = Math.round(baseMidpoint * niche.multiplier * engagementBonus);
  const postRate = Math.round(reelRate * 0.55);
  const storyRate = Math.round(reelRate * 0.20);
  const bundleTotal = reelRate + postRate + storyRate;
  const bundleRate = Math.round(bundleTotal * 0.85);

  return {
    reel: reelRate,
    post: postRate,
    story: storyRate,
    bundle: bundleRate,
    bundleSavings: bundleTotal - bundleRate,
    nicheMultiplier: niche.multiplier,
    engagementBonus: engagementBonus
  };
}

function getEngagementLabel(rate) {
  if (rate >= 6) return { label: 'Excellent', color: '#22c55e', emoji: '🚀' };
  if (rate >= 3) return { label: 'Good',      color: '#84cc16', emoji: '✅' };
  if (rate >= 1) return { label: 'Average',   color: '#f59e0b', emoji: '📊' };
  return               { label: 'Low',        color: '#ef4444', emoji: '📉' };
}

// ─── Start server ────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Creatorly AI running at http://localhost:${PORT}\n`);
});

module.exports = app;
