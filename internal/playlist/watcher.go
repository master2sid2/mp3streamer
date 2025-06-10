package playlist

import (
	"encoding/base64"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/dhowden/tag"
	"github.com/fsnotify/fsnotify"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

// WatcherManager следит за rootDir и всеми плейлистами внутри
type WatcherManager struct {
	rootDir     string
	mu          sync.RWMutex
	playlists   map[string]Playlist
	dirWatchers map[string]*fsnotify.Watcher

	rootWatcher *fsnotify.Watcher
	quit        chan struct{}

	// для WebSocket
	clients   map[*websocket.Conn]struct{}
	clientsMu sync.Mutex
}

// NewWatcherManager создаёт новый менеджер
func NewWatcherManager(rootDir string) (*WatcherManager, error) {
	wm := &WatcherManager{
		rootDir:     rootDir,
		playlists:   make(map[string]Playlist),
		dirWatchers: make(map[string]*fsnotify.Watcher),
		quit:        make(chan struct{}),
		clients:     make(map[*websocket.Conn]struct{}),
	}

	var err error
	wm.rootWatcher, err = fsnotify.NewWatcher()
	if err != nil {
		return nil, err
	}

	return wm, nil
}

// Start запускает watcher-ы и начальное сканирование
func (wm *WatcherManager) Start() error {
	err := wm.rootWatcher.Add(wm.rootDir)
	if err != nil {
		return err
	}

	entries, err := os.ReadDir(wm.rootDir)
	if err != nil {
		return err
	}

	for _, entry := range entries {
		if entry.IsDir() {
			wm.addPlaylistWatcher(entry.Name())
		}
	}

	go wm.handleRootEvents()
	go wm.broadcastUpdates()

	return nil
}

// Stop закрывает все watcher-ы и WebSocket клиентов
func (wm *WatcherManager) Stop() {
	close(wm.quit)

	wm.rootWatcher.Close()

	wm.mu.Lock()
	for _, w := range wm.dirWatchers {
		w.Close()
	}
	wm.mu.Unlock()

	wm.clientsMu.Lock()
	for client := range wm.clients {
		client.Close()
	}
	wm.clientsMu.Unlock()
}

// GetPlaylists возвращает копию текущих плейлистов
func (wm *WatcherManager) GetPlaylists() []Playlist {
	wm.mu.RLock()
	defer wm.mu.RUnlock()

	result := make([]Playlist, 0, len(wm.playlists))
	for _, pl := range wm.playlists {
		result = append(result, pl)
	}
	return result
}

func (wm *WatcherManager) addPlaylistWatcher(name string) {
	wm.mu.Lock()
	defer wm.mu.Unlock()

	if _, exists := wm.dirWatchers[name]; exists {
		return
	}

	path := filepath.Join(wm.rootDir, name)
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		log.Printf("ERROR: cannot create watcher for %s: %v", path, err)
		return
	}

	err = watcher.Add(path)
	if err != nil {
		log.Printf("ERROR: cannot watch %s: %v", path, err)
		watcher.Close()
		return
	}

	pl, err := LoadSinglePlaylist(path, name)
	if err != nil {
		log.Printf("ERROR: loading playlist %s failed: %v", name, err)
		pl = Playlist{Name: name, Tracks: nil}
	}

	wm.playlists[name] = pl
	wm.dirWatchers[name] = watcher

	go wm.handlePlaylistEvents(name, watcher)
}

func (wm *WatcherManager) removePlaylistWatcher(name string) {
	wm.mu.Lock()
	defer wm.mu.Unlock()

	if watcher, ok := wm.dirWatchers[name]; ok {
		watcher.Close()
		delete(wm.dirWatchers, name)
	}

	delete(wm.playlists, name)
}

func (wm *WatcherManager) handleRootEvents() {
	for {
		select {
		case event, ok := <-wm.rootWatcher.Events:
			if !ok {
				return
			}

			if event.Op&(fsnotify.Create|fsnotify.Remove|fsnotify.Rename) == 0 {
				continue
			}

			fi, err := os.Stat(event.Name)
			switch {
			case err == nil && fi.IsDir() && event.Op&fsnotify.Create != 0:
				name := filepath.Base(event.Name)
				log.Printf("New playlist directory detected: %s", name)
				wm.addPlaylistWatcher(name)

			case event.Op&(fsnotify.Remove|fsnotify.Rename) != 0:
				name := filepath.Base(event.Name)
				log.Printf("Playlist directory removed or renamed: %s", name)
				wm.removePlaylistWatcher(name)
			}

		case err, ok := <-wm.rootWatcher.Errors:
			if !ok {
				return
			}
			log.Printf("ERROR root watcher: %v", err)

		case <-wm.quit:
			return
		}
	}
}

func (wm *WatcherManager) handlePlaylistEvents(name string, watcher *fsnotify.Watcher) {
	debounce := time.NewTimer(0)
	<-debounce.C

	for {
		select {
		case event, ok := <-watcher.Events:
			if !ok {
				return
			}

			if filepath.Ext(event.Name) == ".mp3" || event.Op&(fsnotify.Create|fsnotify.Remove|fsnotify.Rename) != 0 {
				if !debounce.Stop() {
					select {
					case <-debounce.C:
					default:
					}
				}
				debounce.Reset(500 * time.Millisecond)
			}

		case <-debounce.C:
			path := filepath.Join(wm.rootDir, name)
			pl, err := LoadSinglePlaylist(path, name)
			if err != nil {
				log.Printf("ERROR: reloading playlist %s failed: %v", name, err)
				continue
			}
			wm.mu.Lock()
			wm.playlists[name] = pl
			wm.mu.Unlock()
			wm.notifyClients() // уведомляем WebSocket клиентов

		case err, ok := <-watcher.Errors:
			if !ok {
				return
			}
			log.Printf("ERROR watcher for %s: %v", name, err)

		case <-wm.quit:
			return
		}
	}
}

func LoadSinglePlaylist(path, name string) (Playlist, error) {
	var tracks []Track

	entries, err := os.ReadDir(path)
	if err != nil {
		return Playlist{}, err
	}

	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".mp3" {
			continue
		}

		fullPath := filepath.Join(path, entry.Name())
		f, err := os.Open(fullPath)
		if err != nil {
			continue
		}

		m, err := tag.ReadFrom(f)
		f.Close()
		if err != nil {
			continue
		}

		title := m.Title()
		if title == "" {
			title = entry.Name()
		}

		dur, err := getMP3Duration(fullPath)
		if err != nil {
			dur = 0
		}
		duration := dur.Truncate(time.Second).String()

		var cover string
		pic := m.Picture()
		if pic != nil {
			cover = "data:" + pic.MIMEType + ";base64," + base64.StdEncoding.EncodeToString(pic.Data)
		}

		tracks = append(tracks, Track{
			Filename:    entry.Name(),
			Title:       title,
			Duration:    duration,
			CoverBase64: cover,
		})
	}

	return Playlist{
		Name:   name,
		Tracks: tracks,
	}, nil
}

// --- WebSocket часть ---

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

// ServeWS обрабатывает подключение WebSocket
func (wm *WatcherManager) ServeWS(c *gin.Context) {
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Println("Failed to upgrade websocket:", err)
		return
	}

	// Регистрируем клиента
	wm.registerClient(conn)
	defer wm.unregisterClient(conn)

	// При подключении сразу отправляем плейлисты
	playlists := wm.GetPlaylists()
	err = conn.WriteJSON(playlists)
	if err != nil {
		log.Println("Failed to send playlists on connect:", err)
		return
	}

	// Просто читаем, чтобы поддерживать соединение живым
	for {
		_, _, err := conn.ReadMessage()
		if err != nil {
			break
		}
	}
}

// registerClient добавляет клиента в список
func (wm *WatcherManager) registerClient(conn *websocket.Conn) {
	wm.clientsMu.Lock()
	defer wm.clientsMu.Unlock()
	wm.clients[conn] = struct{}{}
}

// unregisterClient удаляет клиента
func (wm *WatcherManager) unregisterClient(conn *websocket.Conn) {
	wm.clientsMu.Lock()
	defer wm.clientsMu.Unlock()
	delete(wm.clients, conn)
	conn.Close()
}

// notifyClients отправляет обновления всем клиентам
func (wm *WatcherManager) notifyClients() {
	wm.clientsMu.Lock()
	defer wm.clientsMu.Unlock()

	playlists := wm.GetPlaylists()
	for client := range wm.clients {
		err := client.WriteJSON(playlists)
		if err != nil {
			log.Println("Error writing to client websocket:", err)
			client.Close()
			delete(wm.clients, client)
		}
	}
}

// broadcastUpdates — для периодической рассылки (опционально)
func (wm *WatcherManager) broadcastUpdates() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			wm.notifyClients()
		case <-wm.quit:
			return
		}
	}
}
