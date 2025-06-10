package playlist

type Track struct {
	Filename    string `json:"filename"`
	Title       string `json:"title"`
	Duration    string `json:"duration"`
	CoverBase64 string `json:"cover_base64,omitempty"` // опционально, если есть
}

type Playlist struct {
	Name   string  `json:"name"`
	Tracks []Track `json:"tracks"`
}
