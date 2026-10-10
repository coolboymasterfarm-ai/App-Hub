// Renderer process for App Hub

// Handle tab switching between Home and ClipForge

const homeView = document.getElementById('home-view');
const clipforgeView = document.getElementById('clipforge-view');
const tabHome = document.getElementById('tab-home');
const tabClipforge = document.getElementById('tab-clipforge');

function showView(view) {
  if (view === 'home') {
    homeView.style.display = 'block';
    clipforgeView.style.display = 'none';
    tabHome.classList.add('active');
    tabClipforge.classList.remove('active');
  } else if (view === 'clipforge') {
    homeView.style.display = 'none';
    clipforgeView.style.display = 'block';
    tabClipforge.classList.add('active');
    tabHome.classList.remove('active');
  }
}

// Initial view
showView('home');

// Tab button listeners
if (tabHome) {
  tabHome.addEventListener('click', () => showView('home'));
}
if (tabClipforge) {
  tabClipforge.addEventListener('click', () => showView('clipforge'));
}

// Listen for IPC to switch tabs (from main process)
window.electronAPI.onSwitchTab((tab) => {
  if (tab === 'clipforge') showView('clipforge');
});

// Optional: log errors when iframe fails to load
const clipforgeFrame = document.getElementById('clipforge-frame');
if (clipforgeFrame) {
  clipforgeFrame.addEventListener('error', (e) => {
    console.error('ClipForge iframe error:', e);
  });
}
