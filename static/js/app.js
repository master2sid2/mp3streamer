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
    try {
      const response = await fetch("/api/playlists");
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const playlists = await response.json();
      console.log("Loaded playlists:", playlists);
      renderPlaylists(playlists);
      // Устанавливаем первый плейлист как текущий, если он существует
      if (playlists.length > 0 && !currentPlaylist) {
        currentPlaylist = playlists[0];
        renderTracks(currentPlaylist);
        playlistList.querySelector(`a[data-name="${currentPlaylist.name}"]`)?.classList.add("is-active", "is-selected");
      }
    } catch (error) {
      console.error("Error loading playlists:", error);
    }
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

      // Выделяем плейлист, если он текущий или воспроизводимый
      if (currentPlaylist && currentPlaylist.name === pl.name) {
        a.classList.add("is-active", "is-selected");
      } else if (playingPlaylist && playingPlaylist.name === pl.name && playingTrackIndex >= 0) {
        a.classList.add("is-playing");
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

      // Восстанавливаем выделение, если трек из воспроизводимого плейлиста
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

    // Сбрасываем currentTrackIndex для отображаемого плейлиста, если он не воспроизводимый
    if (playingPlaylist && playingPlaylist.name !== pl.name) {
      currentTrackIndex = -1;
    }
  }

  function playTrack(index) {
    if (!currentPlaylist) return;
    playTrackFromPlaylist(currentPlaylist, index);
  }

  function playTrackFromPlaylist(playlist, index) {
    const tracks = Array.isArray(playlist.tracks) ? playlist.tracks : [];
    if (index < 0 || index >= tracks.length) return;

    const track = tracks[index];

    player.src = `/stream/${encodeURIComponent(playlist.name)}/${encodeURIComponent(track.filename)}`;
    player.play();

    currentTitle.textContent = track.title || track.filename;

    // Плавная смена обложки
    coverImg.classList.add("fade-out");
    setTimeout(() => {
      if (track.cover_base64) {
        coverImg.src = track.cover_base64;
      } else {
        coverImg.src = "/static/img/default.png";
      }
      coverImg.classList.remove("fade-out");
    }, 300);

    // Обновляем воспроизведение
    playingTrackIndex = index;
    playingPlaylist = playlist;

    // Если текущий плейлист совпадает с воспроизводимым, обновляем выделение треков
    if (currentPlaylist && currentPlaylist.name === playlist.name) {
      const rows = trackList.querySelectorAll("tr");
      rows.forEach(row => row.classList.remove("is-active", "is-selected"));
      if (rows[index]) {
        rows[index].classList.add("is-active", "is-selected");
        currentTrackRow = rows[index];
        currentTrackIndex = index;
      }
    }

    // Обновляем выделение плейлиста
    playlistList.querySelectorAll("a").forEach(el => {
      el.classList.remove("is-playing");
      if (el.dataset.name === playlist.name && playingTrackIndex >= 0) {
        el.classList.add("is-playing");
      }
    });
  }

  player.addEventListener("ended", () => {
    if (!playingPlaylist) return;
    const tracks = Array.isArray(playingPlaylist.tracks) ? playingPlaylist.tracks : [];
    let nextIndex = playingTrackIndex + 1;
    if (nextIndex >= tracks.length) {
      nextIndex = 0;
    }

    // Воспроизводим следующий трек без изменения currentPlaylist
    playTrackFromPlaylist(playingPlaylist, nextIndex);
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

      // Обновляем плейлисты
      renderPlaylists(playlists);

      // Если текущий плейлист существует, обновляем его треки
      if (currentPlaylist) {
        const updatedCurrentPlaylist = playlists.find(p => p.name === currentPlaylist.name);
        if (updatedCurrentPlaylist) {
          currentPlaylist = updatedCurrentPlaylist;
          renderTracks(currentPlaylist);
        } else {
          currentPlaylist = playlists.length > 0 ? playlists[0] : null;
          if (currentPlaylist) {
            renderTracks(currentPlaylist);
            playlistList.querySelector(`a[data-name="${currentPlaylist.name}"]`)?.classList.add("is-active", "is-selected");
          } else {
            trackList.innerHTML = "";
          }
        }
      }

      // Восстанавливаем playingPlaylist, если он существует
      if (prevPlaylistName) {
        const pl = playlists.find(p => p.name === prevPlaylistName);
        if (pl) {
          playingPlaylist = pl;

          // Если текущий плейлист совпадает с воспроизводимым, обновляем выделение
          if (currentPlaylist && currentPlaylist.name === pl.name) {
            renderTracks(pl);
          }

          // Восстанавливаем выделение трека
          if (prevTrackFilename) {
            const newIndex = pl.tracks.findIndex(t => t.filename === prevTrackFilename);
            if (newIndex >= 0) {
              playingTrackIndex = newIndex;
              if (currentPlaylist && currentPlaylist.name === pl.name) {
                currentTrackIndex = newIndex;
                const rows = trackList.querySelectorAll("tr");
                rows.forEach(row => row.classList.remove("is-active", "is-selected"));
                if (rows[newIndex]) {
                  rows[newIndex].classList.add("is-active", "is-selected");
                  currentTrackRow = rows[newIndex];
                }
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
          playingTrackIndex = -1;
          currentTrackIndex = -1;
          player.pause();
          player.src = "";
          currentTitle.textContent = "Choose track";
          coverImg.src = "/static/img/default.png";
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

  // Инициализация
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