(function () {
  const slug = document.body.dataset.showcaseSlug;
  if (!slug) return;

  const storageKey = `catech-showcase-visitor-${slug}`;
  let visitorId = localStorage.getItem(storageKey);
  if (!visitorId) {
    visitorId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    localStorage.setItem(storageKey, visitorId);
  }

  let sessionId = null;
  const seenSections = new Set();
  let locationPayload = {};

  function endpoint(path) {
    return `/vitrine/${encodeURIComponent(slug)}/analytics/${path}`;
  }

  function payload(extra) {
    return {
      visitorId,
      sessionId,
      path: window.location.pathname,
      referrer: document.referrer,
      language: navigator.language || "",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
      screen: `${window.screen.width || 0}x${window.screen.height || 0}`,
      ...locationPayload,
      ...extra,
    };
  }

  async function post(path, data) {
    try {
      const response = await fetch(endpoint(path), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        keepalive: true,
      });
      return response.ok ? response.json() : null;
    } catch {
      return null;
    }
  }

  function beacon(path, data) {
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(endpoint(path), new Blob([JSON.stringify(data)], { type: "application/json" }));
      } else {
        post(path, data);
      }
    } catch {
      post(path, data);
    }
  }

  function track(type, label, details) {
    if (!sessionId) return;
    beacon("event", payload({ type, label, details }));
  }

  async function start() {
    await loadGrantedLocation();
    const data = await post("session", payload({}));
    if (!data || !data.sessionId) return;
    sessionId = data.sessionId;
  }

  async function loadGrantedLocation() {
    if (!navigator.geolocation || !navigator.permissions) return;
    try {
      const permission = await navigator.permissions.query({ name: "geolocation" });
      if (permission.state !== "granted") return;
      await new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            locationPayload = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            };
            resolve();
          },
          () => resolve(),
          { maximumAge: 24 * 60 * 60 * 1000, timeout: 1200, enableHighAccuracy: false }
        );
      });
    } catch {
      // Localização é opcional e depende da permissão do visitante.
    }
  }

  function heartbeat() {
    if (!sessionId) return;
    beacon("heartbeat", payload({}));
  }

  document.addEventListener("click", (event) => {
    const tracked = event.target.closest("[data-analytics-click]");
    if (tracked) {
      track("click", tracked.dataset.analyticsClick, tracked.getAttribute("href") || "");
    }

    const youtubePlay = event.target.closest("[data-youtube-play]");
    if (youtubePlay) {
      const player = youtubePlay.closest("[data-youtube-player]");
      const embed = player?.dataset.youtubeEmbed || "";
      if (player && embed) {
        const separator = embed.includes("?") ? "&" : "?";
        player.innerHTML = `<iframe src="${embed}${separator}autoplay=1" title="Vídeo do gatil" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;
        track("video_play", "Vídeo do gatil", embed);
      }
    }

    const gallery = event.target.closest(".gallery-trigger");
    if (gallery) {
      track("gallery_open", gallery.getAttribute("aria-label") || "Abriu foto", `Foto ${Number(gallery.dataset.index || 0) + 1}`);
    }
  });

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const label = entry.target.dataset.analyticsView;
        if (!label || seenSections.has(label)) return;
        seenSections.add(label);
        track("view_section", label);
      });
    }, { threshold: 0.45 });

    document.querySelectorAll("[data-analytics-view]").forEach((section) => observer.observe(section));
  }

  start().then(() => {
    heartbeat();
    window.setInterval(heartbeat, 15000);
  });

  window.addEventListener("pagehide", () => {
    if (sessionId) {
      beacon("event", payload({ type: "leave", label: "Saiu da vitrine" }));
    }
  });
})();
