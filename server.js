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

// Quick auth check — used by the frontend to confirm OAuth succeeded before navigating to /profile
app.get('/api/check-auth', (req, res) => {
  if (req.signedCookies.ig_token) {
    res.json({ authenticated: true });
  } else {
    res.status(401).json({ authenticated: false });
  }
});

app.get('/profile', (req, res) => {
  if (!req.signedCookies.ig_token) {
    return res.redirect('/?error=session_expired');
  }
  const html = fs.readFileSync(path.join(__dirname, 'public', 'profile.html'), 'utf8');
  res.send(html);
});

// Start OAuth
// On Android: App Links auto-open instagram.com in the Instagram app → use intent:// URL
// On iOS: Universal Links auto-open instagram.com in the Instagram app
//         → add #_ fragment (iOS Universal Links do NOT intercept URLs with fragments)
app.get('/auth/instagram', (req, res) => {
  // instagram_business_manage_insights is optional — it requires Advanced Access
  // via Meta App Review. Include it in the scope request; Instagram will grant
  // what it can. Users without Advanced Access will still connect with basic access.
  const scopes = [
    'instagram_business_basic',
    'instagram_business_manage_insights'
  ].join(',');

  const authUrl = `https://www.instagram.com/oauth/authorize?` +
    `enable_fb_login=0` +
    `&force_authentication=1` +
    `&auth_type=reauthenticate` +
    `&client_id=${APP_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(scopes)}`;

  // Android intent:// URL bypasses App Link routing
  const urlWithoutScheme = authUrl.replace('https://', '');
  const intentUrl = `intent://${urlWithoutScheme}#Intent;scheme=https;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;S.browser_fallback_url=${encodeURIComponent(authUrl)};end`;

  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html><html><head>
    <title>Connecting to Instagram...</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      *{box-sizing:border-box;margin:0;padding:0;}
      body{font-family:'Outfit',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0a0a0a;color:#fff;flex-direction:column;gap:20px;padding:24px;text-align:center;}
      .btn{display:inline-block;background:#FF5C00;color:#fff;font-size:1rem;font-weight:700;padding:14px 32px;border-radius:999px;text-decoration:none;margin-top:8px;}
      .sub{color:#888;font-size:0.85rem;max-width:300px;}
    </style>
  </head><body>
    <p style="font-size:1.4rem;">🔗 Connecting to Instagram...</p>
    <p class="sub">If nothing happens, tap the button below.</p>
    <a href="${authUrl}" class="btn" id="manualBtn">Open Instagram Login ↗</a>
    <script>
      const ua = navigator.userAgent || '';
      const isAndroid = /Android/i.test(ua);
      if (isAndroid) {
        // Android: intent URL bypasses App Links — keeps flow in Chrome
        window.location.href = ${JSON.stringify(intentUrl)};
      } else {
        // iOS & Desktop: direct replace
        window.location.replace(${JSON.stringify(authUrl)});
      }
    </script>
  </body></html>`);
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

// ─── Meta Required Pages ─────────────────────────────────────────────────────
app.get('/privacy', (req, res) => {
  res.send(`
    <!DOCTYPE html><html><head><title>Privacy Policy - Creatorly AI</title>
    <style>body{font-family:sans-serif;max-width:800px;margin:40px auto;line-height:1.6;}</style></head>
    <body>
      <h1>Privacy Policy</h1>
      <p>Creatorly AI ("we", "our") does not permanently store your Instagram data. All metrics, insights, and media data are fetched in real-time using the official Instagram Graph API and are temporarily held in your browser session to display your dashboard.</p>
      <p>When you disconnect your account, your session token is immediately destroyed.</p>
      <p>If you have questions, please contact the developer.</p>
    </body></html>
  `);
});

app.get('/delete', (req, res) => {
  res.send(`
    <!DOCTYPE html><html><head><title>Data Deletion - Creatorly AI</title>
    <style>body{font-family:sans-serif;max-width:800px;margin:40px auto;line-height:1.6;}</style></head>
    <body>
      <h1>User Data Deletion Instructions</h1>
      <p>Creatorly AI does not save your data to a database. However, to revoke our application's access to your Instagram account:</p>
      <ol>
        <li>Open the Instagram App.</li>
        <li>Go to <strong>Settings and privacy</strong> > <strong>Website permissions</strong> > <strong>Apps and websites</strong>.</li>
        <li>Find <strong>Creatorly AI</strong> under the Active tab.</li>
        <li>Tap <strong>Remove</strong>.</li>
      </ol>
      <p>Once removed, we will no longer have any access to your account data.</p>
    </body></html>
  `);
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

    // 2. Fetch last 30 posts (industry standard for brand audits)
    // view_count is a direct media field available for videos (most reliable way to get views)
    const mediaData = await graphFetch(
      `${GRAPH_BASE}/me/media?fields=id,media_type,media_product_type,media_url,thumbnail_url,permalink,like_count,comments_count,view_count,timestamp&limit=30&access_token=${accessToken}`
    );
    const posts = mediaData.data || [];

    // 3. Fetch per-post insights robustly
    // We separate base metrics from view metrics so one failing metric doesn't kill the whole response.
    const postsWithInsights = await Promise.all(
      posts.map(async (post) => {
        // Base metrics — reach, saved, impressions work for all post types
        const insightData = await graphFetchSafe(
          `${GRAPH_BASE}/${post.id}/insights?metric=reach,saved,impressions&access_token=${accessToken}`
        );
        const insightMap = {};
        if (insightData && insightData.data) {
          insightData.data.forEach(m => {
            insightMap[m.name] = m.values?.[0]?.value ?? m.value ?? 0;
          });
        }

        // Shares — only available for Reels/Videos, fetch separately so it doesn't break the main call
        let sharesCount = 0;
        if (post.media_type === 'VIDEO' || post.media_product_type === 'REELS') {
          const sharesData = await graphFetchSafe(
            `${GRAPH_BASE}/${post.id}/insights?metric=shares&access_token=${accessToken}`
          );
          if (sharesData && sharesData.data && sharesData.data.length > 0) {
            sharesCount = sharesData.data[0].values?.[0]?.value ?? sharesData.data[0].value ?? 0;
          }
        }


        // Views: try multiple sources in order of reliability
        // The new Instagram Business Login API does not expose view_count directly.
        // We estimate it from watch time metrics: views ≈ total_time / avg_watch_time
        let views = post.view_count || 0;
        if (!views && (post.media_type === 'VIDEO' || post.media_product_type === 'REELS')) {
          // First try direct metric names
          const directMetrics = ['plays', 'video_views'];
          for (const vm of directMetrics) {
            const vData = await graphFetchSafe(
              `${GRAPH_BASE}/${post.id}/insights?metric=${vm}&access_token=${accessToken}`
            );
            if (vData && vData.data && vData.data.length > 0) {
              views = vData.data[0].values?.[0]?.value ?? 0;
              if (views > 0) break;
            }
          }

          // If still no views, estimate from watch time (confirmed to work for Reels)
          if (!views) {
            const watchData = await graphFetchSafe(
              `${GRAPH_BASE}/${post.id}/insights?metric=ig_reels_video_view_total_time,ig_reels_avg_watch_time&access_token=${accessToken}`
            );
            if (watchData && watchData.data) {
              const wMap = {};
              watchData.data.forEach(m => { wMap[m.name] = m.values?.[0]?.value ?? 0; });
              const totalTime = wMap['ig_reels_video_view_total_time'] || 0;
              const avgTime = wMap['ig_reels_avg_watch_time'] || 0;
              if (totalTime > 0 && avgTime > 0) {
                views = Math.round(totalTime / avgTime); // estimated view count
              } else if (totalTime > 0) {
                // Fallback: assume avg Reel watch time of 5 seconds
                views = Math.round(totalTime / 5000);
              }
            }
          }
        }

        return {
          ...post,
          reach: insightMap.reach || 0,
          saved: insightMap.saved || 0,
          shares: sharesCount,
          impressions: insightMap.impressions || 0,
          views: views
        };
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

    // 4.5 Fetch lifetime audience demographics (for Audience Match metric)
    let demoInsights = await graphFetchSafe(
      `${GRAPH_BASE}/me/insights?metric=audience_city,audience_gender_age&period=lifetime&access_token=${accessToken}`
    );
    if (!demoInsights || !demoInsights.data || demoInsights.data.length === 0) {
      demoInsights = await graphFetchSafe(
        `${GRAPH_BASE}/${igUserId}/insights?metric=audience_city,audience_gender_age&period=lifetime&access_token=${accessToken}`
      );
    }

    let audienceMatchStr = null;
    if (demoInsights && demoInsights.data) {
      let topCity = null;
      let topDemo = null;

      const cityData = demoInsights.data.find(m => m.name === 'audience_city');
      if (cityData?.values?.[0]?.value) {
        const sortedCities = Object.entries(cityData.values[0].value).sort((a, b) => b[1] - a[1]);
        if (sortedCities.length > 0) topCity = sortedCities[0][0].split(',')[0]; // Just the city name
      }

      const ageData = demoInsights.data.find(m => m.name === 'audience_gender_age');
      if (ageData?.values?.[0]?.value) {
        const sortedAges = Object.entries(ageData.values[0].value).sort((a, b) => b[1] - a[1]);
        if (sortedAges.length > 0) {
          const parts = sortedAges[0][0].split('.'); // e.g., "M.18-24" -> "M 18-24"
          topDemo = parts.join(' ');
        }
      }

      if (topCity && topDemo) {
        audienceMatchStr = `${topDemo}, ${topCity}`;
      } else if (topDemo) {
        audienceMatchStr = topDemo;
      }
    }

    // 5. Calculate metrics
    const metrics = calculateMetrics(postsWithInsights, profile.followers_count);

    // 6. Detect niche from bio
    const niche = detectNiche(profile.biography || '');

    // 7. Detect creator tier
    const tier = detectTier(profile.followers_count);

    // 8. Calculate smart rate card
    const rateCard = calculateSmartRateCard(profile.followers_count, metrics.engagementRate, niche, tier);

    // 9. Last 12 Reels (what brands specifically look at)
    const allReels = postsWithInsights.filter(
      p => p.media_type === 'VIDEO' || p.media_product_type === 'REELS'
    );
    const recentReels = allReels.slice(0, 12).map(r => ({
      id: r.id,
      url: r.permalink,
      thumbnail: r.thumbnail_url || r.media_url,
      likes: r.like_count || 0,
      comments: r.comments_count || 0,
      saved: r.saved || 0,
      views: r.views || r.video_views || 0,
      reach: r.reach || 0,
      impressions: r.impressions || 0,
      timestamp: r.timestamp
    }));

    // Avg views across Reels (what brands care about most)
    const reelsWithViews = recentReels.filter(r => r.views > 0);
    const avgReelViews = reelsWithViews.length > 0
      ? Math.round(reelsWithViews.reduce((s, r) => s + r.views, 0) / reelsWithViews.length)
      : null;

    // 10. Best performing post (by views for video, by likes+comments+saves for images)
    const bestPost = [...postsWithInsights].sort((a, b) => {
      const scoreA = (a.views || 0) + (a.like_count || 0) * 10 + (a.comments_count || 0) * 20 + (a.saved || 0) * 30;
      const scoreB = (b.views || 0) + (b.like_count || 0) * 10 + (b.comments_count || 0) * 20 + (b.saved || 0) * 30;
      return scoreB - scoreA;
    })[0] || null;

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
      hasRealReach: metrics.hasRealReach,

      // Views (Reels)
      avgReelViews,  // avg views across last 12 Reels — key metric for brands

      // 28-day real data
      reach28: totalReach28,
      impressions28: totalImpressions28,
      profileViews28: totalProfileViews28,

      // Tier & niche
      tier,
      niche,

      // Content
      postsAnalyzed: postsWithInsights.length,  // how many posts were fetched (30)
      reelsAnalyzed: allReels.length,            // how many reels in those 30 posts
      recentReels,                               // last 12 reels with full data
      bestPost: bestPost ? {
        url: bestPost.permalink,
        thumbnail: bestPost.thumbnail_url || bestPost.media_url,
        likes: bestPost.like_count || 0,
        comments: bestPost.comments_count || 0,
        saved: bestPost.saved || 0,
        views: bestPost.views || bestPost.video_views || 0,
        reach: bestPost.reach || 0,
        type: bestPost.media_product_type || bestPost.media_type
      } : null,

      rateCard,
      fetchedAt: new Date().toISOString(),
      topDemographic: audienceMatchStr,

      // Raw per-post data for validation & frontend math
      _raw: postsWithInsights.map(p => ({
        id: p.id,
        type: p.media_product_type || p.media_type,
        timestamp: p.timestamp,
        likes: p.like_count || 0,
        comments: p.comments_count || 0,
        views: p.views || p.video_views || 0,
        saved: p.saved || 0,
        shares: p.shares || 0,
        reach: p.reach || 0,
        impressions: p.impressions || 0,
        url: p.permalink
      }))
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

// Debug: diagnose raw API responses (only accessible when logged in)
app.get('/api/debug', async (req, res) => {
  const accessToken = req.signedCookies.ig_token;
  if (!accessToken) return res.status(401).json({ error: 'Not logged in' });
  try {
    const fetchRaw = async (url) => {
      const { default: f } = await import('node-fetch');
      const r = await f(url);
      return r.json();
    };

    const profile = await graphFetch(`${GRAPH_BASE}/me?fields=id,username,followers_count&access_token=${accessToken}`);
    const media = await graphFetch(`${GRAPH_BASE}/me/media?fields=id,media_type,media_product_type,timestamp&limit=10&access_token=${accessToken}`);

    const firstReel = media.data?.find(p => p.media_type === 'VIDEO' || p.media_product_type === 'REELS');
    const firstImage = media.data?.find(p => p.media_type === 'IMAGE');

    // Test all useful metrics for a Reel
    const reelMetrics = {};
    if (firstReel) {
      const toTest = [
        'reach', 'saved', 'impressions', 'shares',
        'plays', 'video_views', 'ig_reels_video_view_total_time',
        'ig_reels_avg_watch_time', 'clips_replays_count',
        'reach,saved,impressions', 'reach,saved,impressions,shares'
      ];
      for (const m of toTest) {
        reelMetrics[m] = await fetchRaw(
          `${GRAPH_BASE}/${firstReel.id}/insights?metric=${m}&access_token=${accessToken}`
        );
      }
    }

    // Test all useful metrics for an Image
    const imageMetrics = {};
    if (firstImage) {
      const toTest = ['reach', 'saved', 'impressions', 'shares', 'reach,saved,impressions'];
      for (const m of toTest) {
        imageMetrics[m] = await fetchRaw(
          `${GRAPH_BASE}/${firstImage.id}/insights?metric=${m}&access_token=${accessToken}`
        );
      }
    }

    // Account-level insights
    const now = Math.floor(Date.now() / 1000);
    const since28 = now - (28 * 24 * 60 * 60);
    const acctInsights = await fetchRaw(
      `${GRAPH_BASE}/me/insights?metric=reach,impressions,profile_views&period=day&since=${since28}&until=${now}&access_token=${accessToken}`
    );
    const demoInsights = await fetchRaw(
      `${GRAPH_BASE}/me/insights?metric=audience_gender_age,audience_city&period=lifetime&access_token=${accessToken}`
    );

    res.json({
      profile,
      mediaList: media.data,
      firstReel,
      firstImage,
      reelMetrics,
      imageMetrics,
      acctInsights,
      demoInsights,
      note: 'Fields with "error" key = not available. Non-error = works. Check value inside .data[0]'
    });
  } catch (e) {
    res.status(500).json({ error: e.message, stack: e.stack });
  }
});


// ─── Helpers ─────────────────────────────────────────────────────────────────

function calculateMetrics(posts, followers) {
  if (!posts.length) return { engagementRate: null, avgLikes: 0, avgComments: 0, avgSaved: 0, saveRate: null, avgImpressions: null, avgReach: null, hasRealReach: false };
  const n = posts.length;
  const avgLikes = Math.round(posts.reduce((s, p) => s + (p.like_count || 0), 0) / n);
  const avgComments = Math.round(posts.reduce((s, p) => s + (p.comments_count || 0), 0) / n);
  const avgSaved = Math.round(posts.reduce((s, p) => s + (p.saved || 0), 0) / n);

  // Only use real reach from the Insights API — never estimate it
  const realReachData = posts.filter(p => p.reach > 0);
  const hasRealReach = realReachData.length > 0;
  const avgReach = hasRealReach
    ? Math.round(realReachData.reduce((s, p) => s + p.reach, 0) / realReachData.length)
    : null;

  const realImpressionsData = posts.filter(p => p.impressions > 0);
  const avgImpressions = realImpressionsData.length > 0
    ? Math.round(realImpressionsData.reduce((s, p) => s + p.impressions, 0) / realImpressionsData.length)
    : null;

  // ── ENGAGEMENT RATE ──
  // Correct formula: (likes + comments + saves) / reach × 100
  // Only calculate when we have real reach data from the Insights API.
  // Follower-based ER is misleading for viral accounts (where most views come from non-followers).
  let engagementRate = null;
  let saveRate = null;
  if (hasRealReach && avgReach > 0) {
    engagementRate = parseFloat(((avgLikes + avgComments + avgSaved) / avgReach * 100).toFixed(2));
    saveRate = parseFloat((avgSaved / avgReach * 100).toFixed(2));
  }

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
