package playlist

import (
	"encoding/base64"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"time"

	"github.com/dhowden/tag"
	"github.com/tcolgate/mp3"
)

func LoadPlaylists(dataDir string) ([]Playlist, error) {
	var playlists []Playlist

	entries, err := os.ReadDir(dataDir)
	if err != nil {
		return nil, err
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		playlistName := entry.Name()
		playlistPath := filepath.Join(dataDir, playlistName)

		var tracks []Track

		err := filepath.WalkDir(playlistPath, func(path string, d fs.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if d.IsDir() || filepath.Ext(d.Name()) != ".mp3" {
				return nil
			}

			f, err := os.Open(path)
			if err != nil {
				return nil
			}
			defer f.Close()

			m, err := tag.ReadFrom(f)
			if err != nil {
				return nil
			}

			title := m.Title()
			if title == "" {
				title = d.Name()
			}

			dur, err := getMP3Duration(path)
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
				Filename:    d.Name(),
				Title:       title,
				Duration:    duration,
				CoverBase64: cover,
			})

			return nil
		})

		if err != nil {
			return nil, err
		}

		playlists = append(playlists, Playlist{
			Name:   playlistName,
			Tracks: tracks,
		})
	}

	return playlists, nil
}

func getMP3Duration(path string) (time.Duration, error) {
	f, err := os.Open(path)
	if err != nil {
		return 0, err
	}
	defer f.Close()

	d := mp3.NewDecoder(f)
	var frame mp3.Frame
	var skipped int
	var duration time.Duration

	for {
		err := d.Decode(&frame, &skipped)
		if err != nil {
			if err == io.EOF {
				break
			}
			return 0, err
		}
		duration += frame.Duration()
	}
	return duration, nil
}
