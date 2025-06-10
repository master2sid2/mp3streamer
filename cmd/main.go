package main

import (
	"log"
	"mp3server/internal/playlist"
	"mp3server/internal/stream"

	"github.com/gin-gonic/gin"
)

func main() {
	r := gin.Default()

	r.LoadHTMLGlob("templates/*")
	r.Static("/static", "./static")

	// Создаём watcher менеджер
	watcherManager, err := playlist.NewWatcherManager("data")
	if err != nil {
		log.Fatalf("Failed to start watcher: %v", err)
	}

	err = watcherManager.Start()
	if err != nil {
		log.Fatalf("Failed to start watcher manager: %v", err)
	}
	defer watcherManager.Stop()

	r.GET("/", func(c *gin.Context) {
		c.HTML(200, "index.html", nil)
	})

	r.GET("/stream/:playlist/:filename", stream.StreamMP3Handler)

	r.GET("/api/playlists", func(c *gin.Context) {
		playlistsData := watcherManager.GetPlaylists()
		c.JSON(200, playlistsData)
	})

	r.GET("/stream/:playlist/:filename/cover", func(c *gin.Context) {
		playlistName := c.Param("playlist")
		filename := c.Param("filename")

		data, mime, err := playlist.ExtractCover(playlistName, filename)
		if err != nil {
			c.File("static/img/default.png")
			return
		}

		c.Data(200, mime, data)
	})

	// Добавляем WebSocket endpoint
	r.GET("/ws", func(c *gin.Context) {
		watcherManager.ServeWS(c)
	})

	r.Run(":8085")
}
