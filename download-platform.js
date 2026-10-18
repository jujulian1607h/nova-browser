(function () {
  const downloads = {
    windows: {
      url: 'https://github.com/jujulian1607h/nova-browser/releases/download/v1.1.0/Night-Browser-Setup-1.1.0.exe',
      label: 'Télécharger pour Windows',
      info: 'Version 1.1.0 · Windows 10/11 · 64 bits'
    },
    linux: {
      url: 'https://github.com/jujulian1607h/nova-browser/releases/download/v1.1.0/Night-Browser-1.1.0-x86_64.AppImage',
      label: 'Télécharger pour Linux (AppImage)',
      info: 'Version 1.1.0 · Linux x86_64 · AppImage'
    },
    deb: {
      url: 'https://github.com/jujulian1607h/nova-browser/releases/download/v1.1.0/Night-Browser-1.1.0-amd64.deb',
      label: 'Télécharger pour Debian / Ubuntu (.deb)',
      info: 'Version 1.1.0 · Debian / Ubuntu · x86_64'
    }
  };

  function detectPlatform(platform) {
    if (/windows|win32|win64/i.test(platform)) return 'windows';
    if (/linux|x11/i.test(platform)) return 'linux';
    return 'unknown';
  }

  function getDownload(platform) {
    return downloads[platform] || null;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { detectPlatform, getDownload };
    return;
  }

  const browserPlatform = navigator.userAgentData?.platform || navigator.platform || navigator.userAgent;
  const platform = detectPlatform(browserPlatform);
  const choice = getDownload(platform) || downloads.windows;
  const primaryDownload = document.getElementById('primaryDownload');
  const footerDownload = document.getElementById('footerDownload');

  for (const link of [primaryDownload, footerDownload]) {
    link.href = choice.url;
    link.setAttribute('aria-label', choice.label);
  }
  primaryDownload.firstChild.textContent = choice.label + ' ';
  document.getElementById('footerDownloadInfo').textContent = choice.info;
  document.getElementById('platformInfo').textContent = platform === 'unknown'
    ? 'Choisissez votre système. Night Browser est disponible pour Windows et Linux x86_64.'
    : choice.info;
})();
