package playlist

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"github.com/dhowden/tag"
)

func ExtractCover(playlistName, filename string) ([]byte, string, error) {
	path := filepath.Join("data", playlistName, filename)

	f, err := os.Open(path)
	if err != nil {
		return nil, "", fmt.Errorf("failed to open file: %w", err)
	}
	defer f.Close()

	m, err := tag.ReadFrom(f)
	if err != nil {
		return nil, "", fmt.Errorf("failed to read tags: %w", err)
	}

	pic := m.Picture()
	if pic == nil || len(pic.Data) == 0 {
		return nil, "", errors.New("no picture in tags")
	}

	contentType := pic.MIMEType
	if contentType == "" {
		contentType = "image/jpeg" // fallback
	}

	return pic.Data, contentType, nil
}
