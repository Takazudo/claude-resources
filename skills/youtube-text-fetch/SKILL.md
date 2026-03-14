---
name: youtube-text-fetch
description: >-
  Fetch transcript/caption text from YouTube videos using youtube-transcript-api Python package. Use
  when: (1) User wants to get text from a YouTube video, (2) User provides YouTube URLs and needs
  transcript data, (3) User says 'fetch youtube text', 'get captions', 'youtube transcript'. Outputs
  plain text transcript saved to ~/cclogs/{slug}/.
user_invocable: true
argument_description: YouTube URL(s) — space-separated if multiple
---

# YouTube Text Fetch

Fetch transcript/caption text from YouTube videos.

## Prerequisites

Requires `youtube-transcript-api` Python package:

```bash
pip3 install youtube-transcript-api
```

If not installed, install it automatically before proceeding.

## Workflow

### 1. Parse Video IDs

Extract video IDs from provided URLs. Supported formats:
- `https://youtu.be/<ID>`
- `https://youtu.be/<ID>?si=...`
- `https://www.youtube.com/watch?v=<ID>`
- `https://youtube.com/watch?v=<ID>&...`

### 2. Fetch Transcripts

For each video ID, run:

```bash
python3 -c "
from youtube_transcript_api import YouTubeTranscriptApi
snippets = YouTubeTranscriptApi().fetch('VIDEO_ID')
for s in snippets:
    print(s.text)
"
```

If the default language fails, try fetching with specific language codes:

```bash
python3 -c "
from youtube_transcript_api import YouTubeTranscriptApi
snippets = YouTubeTranscriptApi().fetch('VIDEO_ID', languages=['en', 'ja'])
for s in snippets:
    print(s.text)
"
```

### 3. Save Output

Determine the log directory first:

```bash
LOGDIR=$(node ~/.claude/scripts/get-logdir.js)
mkdir -p "$LOGDIR"
```

Save each transcript to `$LOGDIR/youtube-<VIDEO_ID>.txt`.

If multiple videos are provided, also create a combined file `$LOGDIR/youtube-combined.txt` with clear separators between each video's transcript.

### 4. Report

Print a summary of what was fetched:
- Video ID
- Language detected
- Approximate word/character count
- Output file path
