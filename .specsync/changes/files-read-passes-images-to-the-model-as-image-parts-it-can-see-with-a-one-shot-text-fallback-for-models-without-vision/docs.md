---
change: files-read-passes-images-to-the-model-as-image-parts-it-can-see-with-a-one-shot-text-fallback-for-models-without-vision
artifact: docs
---

# Docs

- `.env.example`: next to `CORVIDINHO_LLM_MODEL`, a note that images the
  agent opens with files-read go to the model as image parts and a model
  without vision gets a text note instead (one retry after its HTTP 400).
- `files-read` tool description (what the model sees in the catalog) says a
  PNG/JPEG/GIF/WebP up to 20 MB is shown as a picture.
- Specs: plugins / agent / discord invariants, scenarios, error cases,
  change logs; testing companions.
- No README / STATUS / CHANGELOG version section (release PRs own those).
