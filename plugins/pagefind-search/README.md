# pagefind-search

Local Quartz v5 component plugin. Replaces `@quartz-community/search` / `./plugins/search`.

Requires a postbuild Pagefind index at `/pagefind/` (see `scripts/annotate-pagefind.mjs` + `npx pagefind --site public`).

Keyboard: Ctrl/Cmd+K opens, Esc closes. Results use Pagefind `sub_results` with `#anchor` links.
