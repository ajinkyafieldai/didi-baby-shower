import { applyUtilityIcons } from './utility-icons.js';
// The call remains mounted when family panels change or fullscreen closes.
export function setupCelebrationLayout({ stage, panel, enabled, showView, close }) {
  const shell = document.querySelector('.app-shell');
  const fullscreen = document.getElementById('video-fullscreen');
  const activities = document.createElement('div');
  activities.className = 'activity-bar';
  activities.setAttribute('aria-label', 'Celebration activities');
  const games = stage.querySelector('.game-actions');
  const photo = stage.querySelector('.photo-button');
  if (games) activities.append(games);
  if (photo) activities.append(photo);
  shell.append(activities);
  if (enabled) {
    shell.append(panel);
    panel.hidden = false;
    close.hidden = true;
    showView('wall');
  }

  const back = document.createElement('button');
  back.className = 'back-to-call'; back.type = 'button'; back.hidden = true;
  back.textContent = '↑ Back to call'; document.body.append(back);
  back.onclick = () => { stage.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); };
  function updateReturnButton() { back.hidden = !stage.classList.contains('in-call') || stage.getBoundingClientRect().bottom > 80 || !!document.fullscreenElement || stage.classList.contains('video-expanded'); }
  const visibilityObserver = new IntersectionObserver(updateReturnButton, { threshold: [0, .1] }); visibilityObserver.observe(stage);
  const callObserver = new MutationObserver(updateReturnButton); callObserver.observe(stage, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('scroll', updateReturnButton, { passive: true });
  window.addEventListener('pagehide', () => { visibilityObserver.disconnect(); callObserver.disconnect(); window.removeEventListener('scroll', updateReturnButton); }, { once: true });

  applyUtilityIcons();

  function updateExpanded() {
    updateReturnButton();
    const expanded = document.fullscreenElement === stage || stage.classList.contains('video-expanded');
    fullscreen.setAttribute('aria-pressed', String(expanded));
    fullscreen.setAttribute('aria-label', expanded ? 'Exit fullscreen video' : 'Expand video');
    fullscreen.querySelector('span').textContent = expanded ? 'Exit fullscreen' : 'Fullscreen';
  }

  fullscreen.addEventListener('click', async () => {
    if (document.fullscreenElement === stage) {
      await document.exitFullscreen();
    } else if (stage.classList.contains('video-expanded')) {
      stage.classList.remove('video-expanded');
      document.body.classList.remove('video-expanded-open');
    } else {
      try {
        if (!stage.requestFullscreen) throw new Error('Fullscreen unavailable');
        await stage.requestFullscreen();
      } catch {
        stage.classList.add('video-expanded');
        document.body.classList.add('video-expanded-open');
      }
    }
    updateExpanded();
  });
  document.addEventListener('fullscreenchange', updateExpanded);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && stage.classList.contains('video-expanded')) {
      stage.classList.remove('video-expanded');
      document.body.classList.remove('video-expanded-open');
      updateExpanded();
    }
  });

}
