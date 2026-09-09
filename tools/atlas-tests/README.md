# Website regression checks

Use Node 24 and pnpm 11.19.0. In this directory run
`pnpm install --frozen-lockfile`, then `pnpm exec playwright install chromium`.
An installed Chrome can instead be selected with `CHROME_PATH`.

Build with `python tools/build_site.py --no-vault` from the repository root and
serve `_site` on port 8899. Run `pnpm test`, `pnpm run test:audits`, and
`pnpm run test:features`. Set `ATLAS_TEST_URL` for another preview URL.
Browser tests capture runtime errors on every page they open.

Legacy render tools resolve the same Playwright installation (or NODE_PATH)
through `tools/browser.js`. They do not require an /opt installation.
The PR workflow runs these checks; Pages runs them before deployment.
