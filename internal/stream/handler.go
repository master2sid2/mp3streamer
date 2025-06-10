package stream

import (
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

func StreamMP3Handler(c *gin.Context) {
	playlist := c.Param("playlist")
	filename := c.Param("filename")

	fullPath := filepath.Join("data", playlist, filename)

	file, err := os.Open(fullPath)
	if err != nil {
		c.String(http.StatusNotFound, "file not found")
		return
	}
	defer file.Close()

	fi, err := file.Stat()
	if err != nil {
		c.String(http.StatusInternalServerError, "could not stat file")
		return
	}

	// Обработка Range-заголовков
	rangeHeader := c.GetHeader("Range")
	if rangeHeader == "" {
		c.Header("Content-Type", "audio/mpeg")
		c.Header("Content-Length", strconv.FormatInt(fi.Size(), 10))
		http.ServeContent(c.Writer, c.Request, filename, fi.ModTime(), file)
		return
	}

	// Парсим заголовок Range: bytes=start-end
	var start, end int64
	start, end = 0, fi.Size()-1
	if strings.HasPrefix(rangeHeader, "bytes=") {
		ranges := strings.Split(strings.TrimPrefix(rangeHeader, "bytes="), "-")
		start, _ = strconv.ParseInt(ranges[0], 10, 64)
		if len(ranges) == 2 && ranges[1] != "" {
			end, _ = strconv.ParseInt(ranges[1], 10, 64)
		}
	}

	if start > end || start < 0 || end >= fi.Size() {
		c.Header("Content-Range", "bytes */"+strconv.FormatInt(fi.Size(), 10))
		c.Status(http.StatusRequestedRangeNotSatisfiable)
		return
	}

	length := end - start + 1
	c.Header("Content-Type", "audio/mpeg")
	c.Header("Accept-Ranges", "bytes")
	c.Header("Content-Range", "bytes "+strconv.FormatInt(start, 10)+"-"+strconv.FormatInt(end, 10)+"/"+strconv.FormatInt(fi.Size(), 10))
	c.Header("Content-Length", strconv.FormatInt(length, 10))
	c.Status(http.StatusPartialContent)

	file.Seek(start, 0)
	http.ServeContent(c.Writer, c.Request, filename, fi.ModTime(), file)
}
