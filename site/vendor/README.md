# Vendored browser dependency

`purify.min.js` is DOMPurify **3.4.17**, downloaded from its pinned official
[release](https://github.com/cure53/DOMPurify/releases/tag/3.4.17). The original
license is in `DOMPurify-LICENSE.txt`.

SHA-256: `cd37898f9782adf54820c413191b5691803f0f137c799d6edcfd38523b4c2c31`.

It is served locally and cached with the application shell; rendering does not
depend on a third-party CDN. `../sanitize.js` contains the site's policy for
authored Markdown and editor previews. Upgrade this file from a pinned upstream
release and rerun browser rendering and editor security tests together.
