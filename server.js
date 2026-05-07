require('dotenv').config();
const express = require('express');
const cookieSession = require('cookie-session');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const APP_ID = process.env.APP_ID;
const APP_SECRET = process.env.APP_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const GRAPH_BASE = 'https://graph.instagram.com/v21.0';

// ─── Middleware ──────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(cookieSession({
  name: 'session',
  keys: [process.env.SESSION_SECRET || 'creatorly_secret'],
  maxAge: 24 * 60 * 60 * 1000 // 24 hours
}));

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

// ─── Routes ─────────────────────────────────────────────────────────────────

// Landing page
app.get('/', (req, res) => {
  const html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  res.send(html);
});

// Profile page
app.get('/profile', (req, res) => {
  if (!req.session.profile) {
    return res.redirect('/?error=session_expired');
  }
  const html = fs.readFileSync(path.join(__dirname, 'public', 'profile.html'), 'utf8');
  res.send(html);
});

// Start OAuth (NEW INSTAGRAM API)
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
    // 1. Exchange code for access token using POST form data
    const tokenUrl = 'https://api.instagram.com/oauth/access_token';
    const params = new URLSearchParams();
    params.append('client_id', APP_ID);
    params.append('client_secret', APP_SECRET);
    params.append('grant_type', 'authorization_code');
    params.append('redirect_uri', REDIRECT_URI);
    params.append('code', code);

    const tokenData = await graphFetch(tokenUrl, {
      method: 'POST',
      body: params
    });
    const accessToken = tokenData.access_token;

    // 2. Fetch Instagram profile
    const profileFields = 'id,username,name,biography,followers_count,follows_count,media_count,profile_picture_url';
    const profile = await graphFetch(
      `${GRAPH_BASE}/me?fields=${profileFields}&access_token=${accessToken}`
    );

    // 3. Fetch last 12 media posts with extra fields for Reels
    const mediaData = await graphFetch(
      `${GRAPH_BASE}/me/media?fields=id,media_type,media_product_type,media_url,thumbnail_url,permalink,like_count,comments_count,timestamp&limit=12&access_token=${accessToken}`
    );

    const posts = mediaData.data || [];

    // Extract recent 3 Reels
    const recentReels = posts
      .filter(p => p.media_type === 'VIDEO' || p.media_product_type === 'REELS')
      .slice(0, 3)
      .map(r => ({
        id: r.id,
        url: r.permalink,
        thumbnail: r.thumbnail_url || r.media_url,
        likes: r.like_count || 0,
        comments: r.comments_count || 0,
        timestamp: r.timestamp
      }));

    // 4. Calculate metrics
    const metrics = calculateMetrics(posts, profile.followers_count);

    // 5. Calculate rate card
    const rateCard = calculateRateCard(metrics.avgImpressions, metrics.engagementRate);

    // 6. Build final profile object
    const profileData = {
      username: profile.username,
      name: profile.name || profile.username,
      biography: profile.biography || '',
      followers: profile.followers_count,
      following: profile.follows_count,
      totalPosts: profile.media_count,
      profilePicture: profile.profile_picture_url,
      engagementRate: metrics.engagementRate,
      engagementLabel: getEngagementLabel(metrics.engagementRate),
      avgLikes: metrics.avgLikes,
      avgComments: metrics.avgComments,
      avgImpressions: metrics.avgImpressions,
      avgReach: metrics.avgReach,
      postsAnalyzed: posts.length,
      recentReels,
      rateCard,
      fetchedAt: new Date().toISOString()
    };

    req.session.profile = profileData;
    res.redirect('/profile');

  } catch (err) {
    console.error('OAuth callback error:', err.message);
    res.redirect('/?error=api_error&msg=' + encodeURIComponent(err.message));
  }
});

// API: return profile data for current session
app.get('/api/profile', (req, res) => {
  if (!req.session.profile) {
    return res.status(401).json({ error: 'No active session' });
  }
  res.json(req.session.profile);
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// ─── Calculation helpers ─────────────────────────────────────────────────────

function calculateMetrics(posts, followers) {
  if (!posts.length) {
    return {
      engagementRate: 0,
      avgLikes: 0,
      avgComments: 0,
      avgImpressions: 0,
      avgReach: 0
    };
  }

  const totalLikes = posts.reduce((sum, p) => sum + (p.like_count || 0), 0);
  const totalComments = posts.reduce((sum, p) => sum + (p.comments_count || 0), 0);
  const n = posts.length;

  const avgLikes = Math.round(totalLikes / n);
  const avgComments = Math.round(totalComments / n);
  
  // Estimate impressions and reach if not directly provided (new API usually requires separate /insights calls)
  // For the sake of the rate card demo, we estimate: 
  // Impressions ≈ Likes * 10
  // Reach ≈ Impressions * 0.8
  const avgImpressions = Math.round(avgLikes * 10.5);
  const avgReach = Math.round(avgImpressions * 0.8);

  const engagementRate = followers > 0
    ? parseFloat(((avgLikes + avgComments) / followers * 100).toFixed(2))
    : 0;

  return { engagementRate, avgLikes, avgComments, avgImpressions, avgReach };
}

function calculateRateCard(avgImpressions, engagementRate) {
  const CPM = 600; // ₹600 CPM
  const engagementMultiplier = 1 + (engagementRate / 100);

  const reelRate = Math.round((avgImpressions / 1000) * CPM * engagementMultiplier) || 1500; // fallback if 0
  const storyRate = Math.round(reelRate * 0.20);
  const postRate = Math.round(reelRate * 0.55);
  const bundleRate = Math.round((reelRate + storyRate + postRate) * 0.85);

  return {
    reel: reelRate,
    story: storyRate,
    post: postRate,
    bundle: bundleRate,
    bundleSavings: Math.round((reelRate + storyRate + postRate) - bundleRate)
  };
}

function getEngagementLabel(rate) {
  if (rate >= 6) return { label: 'Excellent', color: '#22c55e', emoji: '🚀' };
  if (rate >= 3) return { label: 'Good', color: '#84cc16', emoji: '✅' };
  if (rate >= 1) return { label: 'Average', color: '#f59e0b', emoji: '📊' };
  return { label: 'Low', color: '#ef4444', emoji: '📉' };
}

// ─── Start server ────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Creatorly AI running at http://localhost:${PORT}\n`);
});
