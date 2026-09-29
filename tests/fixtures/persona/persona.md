Fixture persona for tests (PERSONA-2): warm and direct 🐦‍⬛

This folder has no .git, so the file is read from disk and a clean load adds no
`Persona: …` note. Tests that assert a run's exact events pass it as
`personaRoot`, so an edited or uncommitted persona.md in the checkout (the
normal way to change the voice) never breaks them.
