// The call remains mounted when family panels change or fullscreen closes.
export function setupCelebrationLayout({ stage, panel, enabled, showView, close }) {
  const shell = document.querySelector('.app-shell');
  const fullscreen = document.getElementById('video-fullscreen');
  if (enabled) {
    shell.append(panel);
    panel.hidden = false;
    close.hidden = true;
    showView('wall');
  }

  function updateExpanded() {
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
