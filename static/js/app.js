document.addEventListener("DOMContentLoaded", async () => {
  const playlistList = document.getElementById("playlist-list");
  const trackList = document.getElementById("track-list");
  const player = document.getElementById("audio-player");
  const coverImg = document.getElementById("cover-image");
  const currentTitle = document.getElementById("current-title");

  let currentTrackRow = null;
  let currentPlaylist = null;
  let currentTrackIndex = -1;
  

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

    // Сохраняем выделение только если это текущий плейлист И трек играет
    if (currentPlaylist && currentPlaylist.name === pl.name && currentTrackIndex >= 0) {
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
      
      // Сбрасываем текущий трек только если переключились на другой плейлист
      if (!currentPlaylist || currentPlaylist.name !== pl.name) {
        currentTrackIndex = -1;
      }
    });

    playlistList.appendChild(li);
  });
}

function renderTracks(pl) {
  trackList.innerHTML = "";
  currentTrackRow = null;

  const tracks = Array.isArray(pl.tracks) ? pl.tracks : [];
  const currentFilename = currentTrackIndex >= 0 && tracks[currentTrackIndex] 
    ? tracks[currentTrackIndex].filename 
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

    // Восстанавливаем выделение только если трек из текущего плейлиста
    if (currentPlaylist && currentPlaylist.name === pl.name && 
        currentFilename && track.filename === currentFilename) {
      row.classList.add('is-active', 'is-selected');
      currentTrackRow = row;
      currentTrackIndex = index;
    }

    row.addEventListener("click", () => {
      playTrack(index);
    });
  });

  // Если трек не найден в этом плейлисте, сбрасываем выделение
  if (currentFilename && !tracks.some(t => t.filename === currentFilename)) {
    currentTrackIndex = -1;
    currentTitle.textContent = "Choose track";
    coverImg.src = "/static/img/default.png";
    player.pause();
    player.src = "";
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

  // Плавная смена обложки
  coverImg.classList.add('fade-out');
  setTimeout(() => {
    if (track.cover_base64) {
      coverImg.src = track.cover_base64;
    } else {
      coverImg.src = "/static/img/default.png";
    }
    coverImg.classList.remove('fade-out');
  }, 300);

  // Обновление активных элементов
  playlistList.querySelectorAll("a").forEach(el => {
    el.classList.remove('is-active', 'is-selected');
    if (el.dataset.name === currentPlaylist.name) {
      el.classList.add('is-active', 'is-selected');
    }
  });

  const rows = trackList.querySelectorAll("tr");
  rows.forEach(row => row.classList.remove('is-active', 'is-selected'));
  if (rows[index]) {
    rows[index].classList.add('is-active', 'is-selected');
    currentTrackRow = rows[index];
  }

  currentTrackIndex = index;
}

  player.addEventListener("ended", () => {
    if (!currentPlaylist) return;
    const tracks = Array.isArray(currentPlaylist.tracks) ? currentPlaylist.tracks : [];
    let nextIndex = currentTrackIndex + 1;
    if (nextIndex >= tracks.length) {
      nextIndex = 0;
    }
    playTrack(nextIndex);
  });

  // --- Оптимизированная WebSocket-логика ---
  function setupWebSocket() {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${wsProtocol}://${window.location.host}/ws`);

    ws.onopen = () => {
      console.log("WebSocket connected");
    };

ws.onmessage = (event) => {
  console.log("Received update from server:", event.data);
  console.time("WS message processing");

  const playlists = JSON.parse(event.data);
  
  // Сохраняем текущие данные перед обновлением
  const prevPlaylistName = currentPlaylist ? currentPlaylist.name : null;
  const prevTrackFilename = currentTrackIndex >= 0 && currentPlaylist && currentPlaylist.tracks[currentTrackIndex] 
    ? currentPlaylist.tracks[currentTrackIndex].filename 
    : null;

  renderPlaylists(playlists);

  if (prevPlaylistName) {
    const pl = playlists.find(p => p.name === prevPlaylistName);
    if (pl) {
      currentPlaylist = pl;
      renderTracks(pl);

      // Восстанавливаем выделение трека, если он был в этом плейлисте
      if (prevTrackFilename) {
        const newIndex = pl.tracks.findIndex(t => t.filename === prevTrackFilename);
        if (newIndex >= 0) {
          currentTrackIndex = newIndex;
          const rows = trackList.querySelectorAll("tr");
          rows.forEach(row => row.classList.remove('is-active', 'is-selected'));
          if (rows[newIndex]) {
            rows[newIndex].classList.add('is-active', 'is-selected');
            currentTrackRow = rows[newIndex];
          }
        } else {
          currentTrackIndex = -1;
        }
      }
    } else {
      currentPlaylist = null;
      trackList.innerHTML = "";
      currentTitle.textContent = "Choose track";
      coverImg.src = "/static/img/default.png";
      currentTrackIndex = -1;
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