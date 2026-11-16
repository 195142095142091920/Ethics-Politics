# explorer-toc

Local Quartz v5 component for 414.onl. Removes the need for the right-hand
Table of Contents by nesting the current page's h2/h3 headings under that
page's entry in the left Explorer. Headings are expanded only for the
page you are on, update on SPA navigation, and close the mobile Explorer
after a heading tap.

Also inserts a top Explorer entry labeled "Worldview" that links to `/`.
Quartz's file trie swallows `index.md` into the root and would hide the
home page from the list; the site title still goes home, but people may
not know to click it. When you are on the home page, that Worldview
entry is marked active and the page headings expand under it.
