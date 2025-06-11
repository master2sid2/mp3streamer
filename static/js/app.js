document.addEventListener("DOMContentLoaded", async () => {
  const playlistList = document.getElementById("playlist-list");
  const trackList = document.getElementById("track-list");
  const player = document.getElementById("audio-player");
  const coverImg = document.getElementById("cover-image");
  const currentTitle = document.getElementById("current-title");
  const playlistsTab = document.getElementById("tab-playlists");
  const tracksTab = document.getElementById("tab-tracks");
  const columnsContainer = document.querySelector(".columns.is-mobile");

  let currentTrackRow = null;
  let currentPlaylist = null;
  let playingPlaylist = null;
  let currentTrackIndex = -1;
  let playingTrackIndex = -1;

  // Функция переключения табов (для мобильных устройств)
  function switchTab(activeTab, inactiveTab, showTracks) {
    activeTab.parentElement.classList.add("is-active");
    inactiveTab.parentElement.classList.remove("is-active");
    if (showTracks) {
      columnsContainer.classList.add("tracks-visible");
    } else {
      columnsContainer.classList.remove("tracks-visible");
    }
  }

  // Обработчики кликов по табам
  if (playlistsTab && tracksTab) {
    playlistsTab.addEventListener("click", (e) => {
      e.preventDefault();
      switchTab(playlistsTab, tracksTab, false);
    });

    tracksTab.addEventListener("click", (e) => {
      e.preventDefault();
      switchTab(tracksTab, playlistsTab, true);
    });
  }

  // Первоначальная загрузка плейлистов
  async function loadPlaylists() {
    const playlists = await fetch("/api/playlists").then(res => res.json());
    renderPlaylists(playlists);
  }

  function renderPlaylists(pls) {
    playlistList.innerHTML = "";
    pls.sort((a, b) => a.name.localeCompare(b.name));

    pls.forEach(pl => {
      const tracks = Array.isArray(pl.tracks) ? pl.tracks : [];

      const li = document.createElement("li");
      const container = document.createElement("div");
      container.classList.add("playlist-item");

      const a = document.createElement("a");
      a.textContent = pl.name;
      a.href = "#";
      a.dataset.name = pl.name;

      if (playingPlaylist && playingPlaylist.name === pl.name && playingTrackIndex >= 0) {
        a.classList.add("is-active", "is-selected");
      }

      const countSpan = document.createElement("span");
      countSpan.classList.add("track-count");
      countSpan.textContent = tracks.length;

      container.appendChild(a);
      container.appendChild(countSpan);
      li.appendChild(container);

      a.addEventListener("click", (e) => {
        e.preventDefault();
        playlistList.querySelectorAll("a").forEach(el => el.classList.remove("is-active", "is-selected"));
        a.classList.add("is-active", "is-selected");

        currentPlaylist = pl;
        renderTracks(pl);

        if (window.innerWidth <= 767 && tracksTab && playlistsTab) {
          switchTab(tracksTab, playlistsTab, true);
        }
      });

      playlistList.appendChild(li);
    });
  }

  function renderTracks(pl) {
    trackList.innerHTML = "";
    currentTrackRow = null;

    const tracks = Array.isArray(pl.tracks) ? pl.tracks : [];
    const currentFilename = playingTrackIndex >= 0 && playingPlaylist && playingPlaylist.tracks[playingTrackIndex]
      ? playingPlaylist.tracks[playingTrackIndex].filename
      : null;

    tracks.forEach((track, index) => {
      const row = document.createElement("tr");

      const titleCell = document.createElement("td");
      titleCell.textContent = track.title || track.filename;
      titleCell.style.cursor = "pointer";

      const durationCell = document.createElement("td");
      durationCell.textContent = track.duration || "";

      row.appendChild(titleCell);
      row.appendChild(durationCell);
      trackList.appendChild(row);

      if (
        playingPlaylist &&
        playingPlaylist.name === pl.name &&
        currentFilename &&
        track.filename === currentFilename
      ) {
        row.classList.add("is-active", "is-selected");
        currentTrackRow = row;
        currentTrackIndex = index;
      }

      row.addEventListener("click", () => {
        playTrack(index);
      });
    });

    if (playingPlaylist && playingPlaylist.name !== pl.name) {
      currentTrackIndex = -1;
    }
  }

  function playTrack(index) {
    if (!currentPlaylist) return;
    const tracks = Array.isArray(currentPlaylist.tracks) ? currentPlaylist.tracks : [];
    if (index < 0 || index >= tracks.length) return;

    const track = tracks[index];

    player.src = `/stream/${encodeURIComponent(currentPlaylist.name)}/${encodeURIComponent(track.filename)}`;
    player.play();

    currentTitle.textContent = track.title || track.filename;

    coverImg.classList.add("fade-out");
    setTimeout(() => {
      if (track.cover_base64) {
        coverImg.src = track.cover_base64;
      } else {
        coverImg.src = "/static/img/default.png";
      }
      coverImg.classList.remove("fade-out");
    }, 300);

    playlistList.querySelectorAll("a").forEach(el => {
      el.classList.remove("is-active", "is-selected");
      if (el.dataset.name === currentPlaylist.name) {
        el.classList.add("is-active", "is-selected");
      }
    });

    const rows = trackList.querySelectorAll("tr");
    rows.forEach(row => row.classList.remove("is-active", "is-selected"));
    if (rows[index]) {
      rows[index].classList.add("is-active", "is-selected");
      currentTrackRow = rows[index];
    }

    currentTrackIndex = index;
    playingTrackIndex = index;
    playingPlaylist = currentPlaylist;
  }

  player.addEventListener("ended", () => {
    if (!playingPlaylist) return;
    const tracks = Array.isArray(playingPlaylist.tracks) ? playingPlaylist.tracks : [];
    let nextIndex = playingTrackIndex + 1;
    if (nextIndex >= tracks.length) {
      nextIndex = 0;
    }

    currentPlaylist = playingPlaylist;
    renderTracks(currentPlaylist);
    playTrack(nextIndex);
  });

  function setupWebSocket() {
    const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${wsProtocol}://${window.location.host}/ws`);

    ws.onopen = () => {
      console.log("WebSocket connected");
    };

    ws.onmessage = (event) => {
      console.log("Received update from server:", event.data);
      console.time("WS message processing");

      const playlists = JSON.parse(event.data);

      const prevPlaylistName = playingPlaylist ? playingPlaylist.name : null;
      const prevTrackFilename =
        playingTrackIndex >= 0 && playingPlaylist && playingPlaylist.tracks[playingTrackIndex]
          ? playingPlaylist.tracks[playingTrackIndex].filename
          : null;

      renderPlaylists(playlists);

      if (prevPlaylistName) {
        const pl = playlists.find(p => p.name === prevPlaylistName);
        if (pl) {
          playingPlaylist = pl;
          currentPlaylist = pl;
          renderTracks(pl);

          if (prevTrackFilename) {
            const newIndex = pl.tracks.findIndex(t => t.filename === prevTrackFilename);
            if (newIndex >= 0) {
              playingTrackIndex = newIndex;
              currentTrackIndex = newIndex;
              const rows = trackList.querySelectorAll("tr");
              rows.forEach(row => row.classList.remove("is-active", "is-selected"));
              if (rows[newIndex]) {
                rows[newIndex].classList.add("is-active", "is-selected");
                currentTrackRow = rows[newIndex];
              }
            } else {
              playingTrackIndex = -1;
              currentTrackIndex = -1;
              player.pause();
              player.src = "";
              currentTitle.textContent = "Choose track";
              coverImg.src = "/static/img/default.png";
            }
          }
        } else {
          playingPlaylist = null;
          currentPlaylist = null;
          trackList.innerHTML = "";
          currentTitle.textContent = "Choose track";
          coverImg.src = "/static/img/default.png";
          playingTrackIndex = -1;
          currentTrackIndex = -1;
          player.pause();
          player.src = "";
        }
      }

      console.timeEnd("WS message processing");
    };

    ws.onclose = () => {
      console.log("WebSocket disconnected, reconnecting in 3s...");
      setTimeout(setupWebSocket, 3000);
    };

    ws.onerror = (err) => {
      console.error("WebSocket error:", err);
      ws.close();
    };
  }

  await loadPlaylists();
  setupWebSocket();
});

window.addEventListener("resize", () => {
  if (window.innerWidth > 767) {
    columnsContainer.classList.remove("tracks-visible");
    document.querySelectorAll(".column").forEach(col => {
      col.style.display = "block";
      col.style.opacity = "1";
    });
  }
});