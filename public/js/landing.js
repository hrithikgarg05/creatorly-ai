// ── Landing page JS ──────────────────────────────────────────────────────────
// Reads ?error= param from URL and shows appropriate error banner

const ERROR_MESSAGES = {
  no_pages_found: {
    title: 'No Facebook Pages Found',
    desc: 'Your Facebook account has no Pages. Go to facebook.com/pages/create to create one, then link your Instagram account to it.'
  },
  no_instagram_connected: {
    title: 'Instagram Not Linked to a Facebook Page',
    desc: 'Your Instagram Business/Creator account must be connected to a Facebook Page. Go to Instagram Settings → Account → Switch to Professional Account, then link it to your Facebook Page.'
  },
  oauth_denied: {
    title: 'Authorization Cancelled',
    desc: 'You cancelled the Instagram authorization. Click "Connect Instagram" to try again.'
  },
  session_expired: {
    title: 'Session Expired',
    desc: 'Your session has expired. Please reconnect your Instagram account.'
  },
  api_error: {
    title: 'API Error',
    desc: 'An error occurred while fetching your Instagram data. Make sure your account is a Business or Creator account and try again.'
  },
  default: {
    title: 'Something Went Wrong',
    desc: 'An unexpected error occurred. Please try again.'
  }
};

function showError(code) {
  const msg = ERROR_MESSAGES[code] || ERROR_MESSAGES.default;
  const banner = document.getElementById('errorBanner');
  const title = document.getElementById('errorTitle');
  const desc = document.getElementById('errorDesc');

  // Append API message if present
  const urlParams = new URLSearchParams(window.location.search);
  const apiMsg = urlParams.get('msg');
  const fullDesc = apiMsg ? `${msg.desc} (${apiMsg})` : msg.desc;

  title.textContent = msg.title;
  desc.textContent = fullDesc;
  banner.style.display = 'block';
}

// On page load
document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const error = urlParams.get('error');
  if (error) showError(error);

  // Add loading state to Connect button
  const connectBtn = document.getElementById('connectBtn');
  if (connectBtn) {
    connectBtn.addEventListener('click', (e) => {
      connectBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 0.7s linear infinite;">
          <path d="M21 12a9 9 0 11-6.219-8.56"/>
        </svg>
        Connecting…
      `;
      connectBtn.style.opacity = '0.8';
      connectBtn.style.pointerEvents = 'none';
    });
  }
});
