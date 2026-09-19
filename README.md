# Sweet Home 3D JS — Online Enhanced

An enhanced fork of [Sweet Home 3D JS](http://www.sweethome3d.com) 7.5.2 (the official
HTML5/WebGL viewer and editor for Sweet Home 3D projects), with three features added on top
of the upstream browser app for running it as a small self-hosted, shared, multi-user service:

- **Shared server-backed projects** — list, upload, open, delete and export `.sh3d` home
  projects stored on the server, with no user accounts required.
- **Furniture catalog Grid/Tree toggle** — browse the furniture catalog as the original icon
  grid or as a searchable, sortable tree table, remembered across sessions.
- **Desktop import parity** — import `.sh3f` furniture libraries, `.sh3t` texture libraries,
  and single 3D models (`.obj`, `.dae`, `.3ds`, `.kmz`) directly from the browser, matching
  what the Sweet Home 3D desktop application already supports.

This repository *is* the buildable project (no nested version-named source folder to dig
into) — it's meant to be usable directly as the source for a self-hosted deployment, for
example as the fetch target of a Proxmox VE LXC install script.

## Repository layout

```
build.xml                    Ant build file (targets described below)
src/                          Sweet Home 3D JS application source (JSweet-transpiled)
lib/                          Third-party JS libraries and stylesheets
test/                         Browser-based test/demo pages (test/testHome.html is the main one)
docs/                         Developer/AI-agent notes on the codebase and the three added features
deployDirectHomeRecorder/     PHP endpoints for the shared-projects feature (production deploy)
deployIncrementalHomeRecorder/  JSP endpoints for the upstream incremental-save deploy mode
local-server/                 Dependency-free Node.js server for local development/testing,
                               standing in for deployDirectHomeRecorder's PHP endpoints
install/                      Files for the standalone Sweet Home 3D JS Viewer distribution
tools/                        Build-time JSweet/JSON transpiling helpers
```

## Building

Requirements: JDK 17+ (`JAVA_HOME` must point at the JDK **root** directory, not the `javac`
executable), [Apache Ant](https://ant.apache.org/), and Node.js.

From the repository root:

```sh
ant applicationLibraries   # transpiles the Java-derived JS into lib/generated - run this once
                           # (or after a source change) so test/testHome.html has what it needs
ant applicationPhpDeploy   # builds a full deployable PHP-backed distribution under install/
                           # (pulls in applicationLibraries automatically via its dependency chain)
```

Run `ant -p` (or read `build.xml`) for the full list of targets, including `viewerLibraries`
for the read-only viewer distribution and `applicationJspBuild`/`applicationJspDeploy` for a
JSP-backed deploy instead of PHP.

## Running locally

No PHP install needed for local development — `local-server/server.js` is a small,
dependency-free Node.js server that mirrors the PHP endpoints used by the shared-projects
feature:

```sh
node local-server/server.js
```

Then open `http://127.0.0.1:8000/test/testHome.html` in a browser. Append `?skipTests=true`
to skip the bundled self-tests and load straight into the editor.

## Deployment

`deployDirectHomeRecorder/` contains the PHP endpoints (`listHomes.php`, `writeData.php`,
`deleteHome.php`, `uploadHome.php`) that back the shared-projects feature in production —
point your web server at the output of `ant applicationPhpDeploy` and ensure the configured
data directory is writable by the PHP process.

## License

Sweet Home 3D and Sweet Home 3D JS are Copyright (c) Space Mushrooms / eTeks, distributed
under the GNU General Public License v2 — see `COPYING.TXT` and `LICENSE.TXT`. Third-party
components used by this project are listed and licensed individually in the
`THIRDPARTY-LICENSE-*.TXT` files.

## Contributing

Please don't commit personal or machine-specific files — in particular `.claude/settings.json`
and any local test fixtures under `import-materials-for-tests/` are intentionally gitignored;
keep it that way in any changes you contribute.
