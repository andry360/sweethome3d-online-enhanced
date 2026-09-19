# SweetHome3DJS — AI Source Map (confirmed facts)

Read `SweetHome3DJS_online_customization_plan.md` (workspace root) first — it has the goal, the "check what's already built" step, and the exact recipe (with every gotcha inlined) for each feature. This file is the supporting technical reference: exact class/method signatures and architecture facts, verified by reading the actual source (`SweetHome3DJS-7.5.2-src/src/`, the transpiled `lib/generated/SweetHome3D.js`, and — where noted — the desktop Java source under `SweetHome3Djava-desktop/`). Re-grep before relying on a specific line number; the live code is the ground truth, this is a map of it.

**As of 2026-09-19: all three features are done and browser-verified against real fixtures —
see the plan doc's "Status" section and each feature's own section for what was actually built
(don't re-derive it from the architecture notes below alone). `.dae`/`.3ds`/`.kmz` import share
Feature 3's `.obj` code path but have no test fixture, so remain unverified — say so if asked.
An earlier version of this same file's "Format support status" table once falsely claimed
`.sh3f`/`.sh3t`/`.obj` import was "browser-verified" with zero corresponding code anywhere in
the repo — a pure fabrication from some prior session. Don't trust status claims in this file
(including this one, going forward) without re-checking the actual source first.**

## Build
- Ant (`build.xml`), target `applicationLibraries` (`applicationBuild` doesn't exist). Full target list: `transpiledLibraries`, `viewerLibraries`, `applicationLibraries`, `jsweetCandy`, `applicationResources`, `viewerConcat`, `applicationConcat`, `recorderWorkerConcat`, `commonLibrariesDistribution`, `viewerDistribution`, `applicationDistribution`, `install-yuicompressor`, `viewerBuild` (default), `applicationJspDeploy(Test)`, `applicationJspBuild`, `applicationPhpDeploy`, `applicationPhpBuild`, `jsdoc`, `install-jsdoc-toolkit-ant-task`, `sourceArchive`.
- No desktop jar build needed — `transpiledLibraries` points JSweet directly at the desktop's Java **source** tree (`../SweetHome3D/src`, expects a sibling junction to `SweetHome3Djava-desktop/SweetHome3D-7.5-src/` — this junction already exists in this checkout).
- JSweet 3.2.0-SNAPSHOT + JDK 17 needs `--add-exports`/`--add-opens` for several `jdk.compiler/com.sun.tools.javac.*` packages (full flag list in the plan doc) — set via `JDK_JAVA_OPTIONS`, not `JAVA_TOOL_OPTIONS` (this JDK build rejects `--add-exports` specifically through that variable: "Unrecognized option").
- `JAVA_HOME` must be the JDK root (e.g. `C:\Program Files\Java\jdk-17`), not a path to
  `javac.exe` — a wrong value breaks Ant's launcher with `cd: ... Not a directory`. This user
  account's `JAVA_HOME` had exactly that bug and was fixed permanently on 2026-09-19.
- Verified working end-to-end 2026-09-19: JDK 17.0.12, `ant applicationLibraries` → BUILD
  SUCCESSFUL in ~33s, transpilation "successfully completed with no errors and no warnings".
  Produces `lib/generated/{SweetHome3D,geom,batik-svgpathparser,swingundo}.js` and, via a
  separate step in the same target (`com.eteks.sweethome3d.json.PropertiesToJson`),
  `lib/resources/*.json` (furniture/textures catalogs + `localization*.json` per-locale
  bundles). **Both `lib/generated/` and `lib/resources/` are gitignored build output — a fresh
  checkout of this repo has neither until you run the build.** `lib/resources/localization.json`
  (the English default, extensionless) is where new UI-string keys should be added per the
  "Localization" section below, but only once it actually exists.
- **PHP is installed on this machine, just not on `PATH`.** An initial `command -v php`/
  `Get-Command php` check found nothing and wrongly got written up as "PHP not installed" —
  corrected 2026-09-19 after the user pointed it out. Real binaries exist via Laragon
  (`C:\laragon\bin\php\php-8.3.33-Win32-vs16-x64\php.exe`, several versions available) and via
  a `winget` install (`PHP.PHP.8.4`, not found on disk by a quick search but listed installed).
  The Laragon binary was used to run `deployDirectHomeRecorder/*.php` for real (`php -S
  127.0.0.1:9000` from that directory) and confirmed `uploadHome.php`/`listHomes.php`/
  `deleteHome.php` all work correctly against genuine PHP — 200 on valid upload, 409 on
  duplicate, correct byte-for-byte download, 200 on delete. Prefer this over
  `local-server/server.js` when verifying server-side behavior — it's the real thing, not a
  mirror. `local-server/server.js` (dependency-free Node stand-in, added 2026-09-19; see the
  plan doc's "Workspace layout") remains useful for iterating without invoking PHP's path each
  time, but don't repeat the "PHP isn't installed" mistake — it is.
- Hand-written `src/*.js` files are loaded directly by `<script>` tags in `test/testHome.html` — no rebuild needed after editing them. Only `tools/JSweet`-transpiled content requires `ant applicationLibraries`. A **new** hand-written file additionally needs a `<script src="src/X.js">` line in `test/testHome.html` and a `<file name="X.js"/>` entry in the relevant `build.xml` concat target (both are explicit per-file lists, not wildcards/globs).
- Browser smoke test: HTTP 200 is not proof of anything — the toolbar (`#home-pane-toolbar`)/catalog (`#furniture-catalog-list`)/2D plan (`#home-plan`)/3D view (`#home-3D-view` canvas) must actually render (verified with real Playwright+Chromium runs, not just a screenshot, on 2026-09-19 — `chromium-cli` isn't available on this machine, so `npm install playwright` + `npx playwright install chromium` in a scratch dir is the fallback). Ignore `404` console errors (known baseline) and WebGL `GPU stall` warnings; zero tolerance for `pageerror`. **Force `browser.newContext({ locale: 'en-US' })`** before asserting on any UI text — this machine's default Chromium/OS locale is French, compounding with the locale-leak bug below.

## Known vanilla SweetHome3DJS bugs (found and fixed 2026-09-19)
Pre-existing bugs in the unmodified upstream code, unrelated to any of the three features but
hit while building/testing Feature 2. Both are fixed in this checkout already.
- **`test/testHome.html` leaks the global locale.** `testLocalization(); testLengthUnit();
  testFurnitureCatalog(); testGeom(); testHome();` run **unconditionally** at parse time (only
  the later, interactive `testHomeModifications()` is gated by `?skipTests=true`).
  `testFurnitureCatalog()` (around line 752) did `preferences.setLanguage("fr")` to test
  catalog localization and never restored it. Since `Locale.setDefault`/`Locale.getDefault`
  (`src/core.js:810-837`) go through one global `window.defaultLocaleLanguageAndCountry`
  override, and `UserPreferences.prototype.getResourceBundles` (`src/UserPreferences.js:364-380`)
  lazily loads+caches resource bundles on a preferences object's *first* `getLocalizedString`
  call using whatever `Locale.getDefault()` returns *at that moment* — every load of
  `testHome.html`, in any browser/OS locale, silently rendered the whole app in French. Fixed:
  `Locale.setDefault("en_US");` added at the end of `testFurnitureCatalog()`.
- **Open dialog unreachable with zero shared homes.** `DirectRecordingHomeController.prototype.
  open`'s `selectHome()` (`src/SweetHome3DJSApplication.js`) used to do
  `if (homes.length == 0) { alert(...) } else { /* build .open-dialog */ }` — meaning a fresh
  shared server with no projects yet could never show the dialog that Upload now lives inside.
  Fixed by always building the dialog regardless of `homes.length`.

## Home lifecycle / recorders
- `HomeRecorder` (`src/HomeRecorder.js`) — plain constructor function, **callback-based, never a class, never async/Promise**. `readHome(url, {homeLoaded, homeError, progression})`; `writeHome(home, homeName, {homeSaved, homeError})` returns `{abort}`. Operates on Blob URLs / in-memory ZIPs (JSZip 2.x) — no server needed. `new HomeRecorder()` (no config) always produces a local blob via `homeSaved(home, blob)` regardless of what recorder the app is actually configured with — this is how Feature 2's Export re-uses it (`HomeController.prototype.exportHome`, added in `src/SweetHome3DJSApplication.js`).
- `DirectHomeRecorder` (`src/DirectHomeRecorder.js`) — server-backed, config-URL-driven: `readHome`/`writeHome`/`getAvailableHomes`/`deleteHome` all just format one of `readHomeURL`/`writeHomeURL`/`listHomesURL`/`deleteHomeURL`/`writeResourceURL`/`readResourceURL` and do a plain XHR (or `localstorage:`/`indexeddb:` URL schemes). No upload endpoint of its own — Feature 2 added a new `uploadHomeURL` config key and client-side `FormData`/multipart POST for that, read directly off `recorder.configuration.uploadHomeURL`.
- `IncrementalHomeRecorder` is a *different* server-backed variant (auto-save of live edits via `writeHomeEditsURL`, used by the disabled `useServer` block in `test/testHome.html` against `.jsp` endpoints) — don't confuse it with `DirectHomeRecorder`, they have different config shapes and aren't interchangeable.
- `SweetHome3DJSApplication.prototype.createHomeController`/`.getHomeRecorder` (`src/SweetHome3DJSApplication.js`) switch on `configuration.readHomeURL`: undefined → `LocalFileHomeController` + plain `HomeRecorder` (local); defined → server-backed controllers (`writeHomeEditsURL` present → `IncrementalHomeRecorder`, else `DirectHomeRecorder`).
- **Production config already exists and works**: `deployDirectHomeRecorder/index.html:1614-1638` (what `ant applicationPhpDeploy` actually ships to the LXC) configures `DirectHomeRecorder` against `deployDirectHomeRecorder/{listHomes,deleteHome,writeData,uploadHome}.php` and starts with `application.addHome(application.createHome())` — no `readHome` bootstrap, by design (a fresh install starts with a new, unsaved home; the user opens a shared project via the dialog). `test/testHome.html`'s own `useServer`/`false` branches are unrelated dev-only configs (JSP-based / fully local respectively) — as of 2026-09-19 there's also a third, `?sharedProjects=true` branch that mirrors the production `DirectHomeRecorder` config against `local-server/server.js` for quick local testing (real PHP via `php -S` also works — see "PHP is installed on this machine" above).
- `LocalFileHomeController.prototype.save` renames `.sh3d` → `.sh3x` before writing — this is the general upstream convention (`.sh3x` = server/auto-save storage extension, `.sh3d` = user-facing import/export extension for the *same* ZIP format), not something specific to the local fallback. Feature 2's Upload/Export follow the same convention rather than inventing a new one.
- `.sh3d`/`.sh3x` format: a ZIP with a `Home.xml` entry (SAX-parsed via `HomeXMLHandler`) plus embedded resources resolved as `jar:zipUrl!/entryPath` content URLs (`URLContent`/`BlobURLContent`). A `.sh3d` upload is validated server-side by its ZIP local-file-header signature (`PK\x03\x04`), not by trusting the extension alone.

## Shared project UI anchors (current source, post-Feature-2)
- `SweetHome3DJSApplication.js` builds the Open dialog (now unconditionally, regardless of
  `getAvailableHomes()`'s result length — see "Known vanilla bugs" above) after
  `getAvailableHomes()` returns. The dialog root receives class `.open-dialog`; the project
  list is `.open-dialog .home-list`; each row is a `div.home-list .item`, rendered with
  `textContent` (not `innerHTML` — fixed as part of Feature 2).
- `JSDialog` supplies `.dialog-buttons`, `.dialog-ok-button`, and `.dialog-cancel-button`. The
  Delete control is created with `document.createElement("button")` and inserted immediately
  before Cancel; it has no stable class or ID (localized text: "Delete..." in English,
  `AppletContentManager.showOpenDialog.delete` key). Clicking it opens a *second* `JSDialog`
  (`confirmDeleteHome`, `AppletContentManager.confirmDeleteHome.*` keys) whose own OK button
  reads exactly "Delete" (no ellipsis) — the two are easy to conflate when scripting a test.
- **Upload** (added 2026-09-19): a `<button>Upload</button>` (plain hardcoded English, not a
  localized string — see "Localization" below) plus a hidden `<input type=file accept=".sh3d">`,
  both inserted into `.dialog-buttons` between `.dialog-ok-button` and the dynamic Delete
  button, never inside `.home-list`. POSTs `FormData` to `recorder.configuration.uploadHomeURL`;
  `200` → appends a new `.home-list .item`; `409` → `alert()`s and lets the user pick another
  file. Delete is correctly `disabled` when the selected row's name matches the currently-open
  home's name (`controller.home.getName()`) — this is intentional, not a bug, if it trips up a
  future test script.
- `HomePane.prototype.createToolBar` obtains `#home-pane-toolbar` and creates the standard file
  actions from its `new-home`, `open`, `save`, and `save-as` classes. The generated action IDs
  are `#toolbar-button-NEW_HOME`, `#toolbar-button-OPEN`, `#toolbar-button-SAVE`, and
  `#toolbar-button-SAVE_AS`. **Export** (added 2026-09-19, id `#toolbar-button-EXPORT_HOME`) is
  appended right after the `save-as` block via `HomePane.prototype.createExportHomeButton` — a
  plain button (no `ActionType`/icon), styled via `.toolbar-text-button` in
  `lib/sweethome3djs.css`.

## Catalogs
- `FurnitureCatalog`/`TexturesCatalog` (generated bundle) — base classes with `add(category, piece)`, `delete(piece)`, `addFurnitureListener`/`addTexturesListener`, `getCategories()`, `getCategoriesCount()`, `getCategory(i)`. `FurnitureCategory.getFurniture()`/`getFurnitureCount()`; `TexturesCategory.getTextures()`/`getTexturesCount()`. **Confirmed in the generated bundle**: `add(category, piece)` binary-searches `this.categories` by name and either reuses the existing category object or creates a new `FurnitureCategory(category.getName())`, then calls `category.add(piece)` and fires `CollectionEvent.Type.ADD` — so importing into an existing category name merges correctly, and the catalog UI's own `addFurnitureListener` picks up the change with no extra plumbing (verified: importing `.sh3f` makes new categories appear live in both the grid and an already-open Feature 1 tree view).
- `DefaultFurnitureCatalog`/`DefaultTexturesCatalog` (`src/*.js`) extend the above, adding only parsing: `readFurniture(resourceBundleArray, catalogUrl, resourcesUrlBase, identifiedIdsArray)` / `readTextures(...)` (same shape), plus `readPieceOfFurniture`/`readTexture`, `readFurnitureCategory`/`readTexturesCategory`. `resourceBundleArray` is a plain array of `{key: value}` string dicts (searched in order, Java-locale-fallback style), read via `CoreTools.getStringFromKey`.
- **`preferences.getFurnitureCatalog()`/`getTexturesCatalog()` return a plain `FurnitureCatalog`/`TexturesCatalog`, never `DefaultFurnitureCatalog`/`DefaultTexturesCatalog`.** `RecordedUserPreferences` (`src/UserPreferences.js`) always constructs a plain empty catalog, then (`updateDefaultCatalogs`) builds a *temporary* `DefaultFurnitureCatalog` purely to parse the default JSON catalog and copies its pieces into the live one via `add()`. Feature 3's `ImportController.js` follows the same throwaway-reader pattern — calling `.readFurniture()` on the live catalog throws `"not a function"`.
- `.sh3f`/`.sh3t` archives: a ZIP containing a root `PluginFurnitureCatalog.properties` / `PluginTexturesCatalog.properties` — **confirmed exact, case-sensitive filenames** by unzipping the real `import-materials-for-tests/KatorLegaz.sh3f`/`Contributions.sh3t` fixtures (plus ignorable per-locale variants like `PluginFurnitureCatalog_fr.properties`). The desktop-only constants `DefaultFurnitureCatalog.PLUGIN_FURNITURE_CATALOG_FAMILY`/`DefaultTexturesCatalog.PLUGIN_TEXTURES_CATALOG_FAMILY` don't exist in the JS port — `ImportController.js` just hardcodes the literal filenames. **`.properties` parser: implemented in `ImportController.parseProperties`/`splitPropertyLine`/`unescapeProperty`** (comments, `\`-continuation, `=`/`:`/whitespace separators, `\uXXXX` and other backslash escapes) — unit-tested against the real `KatorLegaz.sh3f` fixture (1517 keys parsed correctly, matching the raw file byte-for-byte on spot checks) plus synthetic edge cases, before ever wiring it into the browser.
- **`CatalogPieceOfFurniture`'s constructor** (generated, JSweet merges all ~18 Java overloads from `CatalogPieceOfFurniture.java` into one function with positional+type-based dispatch) throws `"invalid overload"` for a near-miss argument list/types — and near-misses are easy to make, because the merged function reuses the *longest* overload's parameter names (`id, name, description, information, license, tags, ..., icon, planIcon, model, width, ...`) for internal bookkeeping, which do not line up positionally with a shorter overload's own real meaning. The working 18-arg overload (confirmed against the desktop Java source) is:
  `(String name, Content icon, Content model, float width, depth, height, elevation, boolean movable, String staircaseCutOutShape, Integer color, float[][] modelRotation, int modelFlags, Long modelSize, String creator, float iconYaw, iconPitch, iconScale, boolean proportional)`
  — **no `id` parameter** (it's hardcoded `null` internally); call as
  `(null, null, modelContent, width, depth, height, elevation=0, movable=false, null, null, modelRotation, modelFlags, null, null, iconYaw=0, iconPitch=0, iconScale=1, proportional=false)`, then set name/movability afterward via `HomePieceOfFurniture.prototype.setName`/`setMovable`.
  **Bug found and fixed 2026-09-19**: the 3rd argument (`model`) must be the `URLContent` reference you pass into `ModelManager.loadModel(...)`, *not* the `Group3D` scene node that load's own `modelUpdated(loadedModelRoot)` callback hands you (that node is typed as a plain object client-side, not a `Content`, so the constructor's type check for that slot fails and the whole dispatch falls through to `"invalid overload"`). This exact confusion is baked into `ModelPreviewComponent.js:568-571`'s own code if read in isolation — there, the identifier `model` in the `new CatalogPieceOfFurniture(null, null, model, ...)` call refers to `setModel`'s *outer* parameter (a `URLContent`, per its JSDoc), a different variable from the `modelUpdated` callback's own parameter (named `modelRoot` there). Keep the `URLContent` in its own named variable and pass *that* — don't reuse the callback parameter. Found by testing against a real model file, not by code review.

## 3D loaders (no Three.js anywhere in this codebase)
- `ModelLoader` (`src/ModelLoader.js`), base of `OBJLoader`/`DAELoader`/`Max3DSLoader`. `load(url, synchronous, {modelLoaded, modelError, progression})` — `url` is **always** treated as a ZIP (plain zip: auto-picks first entry matching the loader's extension; `jar:zipUrl!/entryName`: uses that entry). No dedicated KMZ loader — it's a ZIP containing a `.dae`, used as-is with `DAELoader`.
- `ModelManager.prototype.loadModel(content, synchronous, observer)` wraps the above and tries each registered loader (`OBJLoader`, `DAELoader`, `Max3DSLoader`) in turn until one succeeds. **Its success callback is `observer.modelUpdated(model)`, not `modelLoaded`** (that name is `ModelLoader`-internal only).
- `ModelManager.prototype.getSize(node)` → `vec3` where `[0]=width(x), [1]=height(y), [2]=depth(z)` (Y-up convention), so a `(width, depth, height)` triple is `[size[0], size[2], size[1]]`.

## Catalog UI (`src/FurnitureCatalogListPanel.js`, `src/toolkit.js`) — Feature 1 done 2026-09-19
- The filter row is `#furniture-filter`; it contains `#furniture-category-select` and the search input `#furniture-search-field`, followed now by `#furniture-catalog-view-mode-switch` (two plain `.furniture-catalog-view-mode-button` elements, "Grid"/"Tree", `.selected` toggled). Every direct child of `#furniture-filter` defaults to `width: calc(100% - 3px)` (one per row) — both the search field and the switch needed explicit narrower widths to share a row.
- `JSTreeTable(container, preferences, model, data)` — generic column-based tree table, already used by `src/FurnitureTablePanel.js` (do not modify that file). Data shape: `{value, children: [{value}, ...]}[]`; `model.renderCell(value, columnName, cellDiv)`; `model.getValueComparator(sortConfig)`; `selectionChanged`/`rowDoubleClicked`/`expandedRowsChanged`/`sortChanged` callbacks must all be functions (even no-ops) or the internal call site throws; `initialState.expandedRowsIndices`/`sort`.
- `setData()` **silently does nothing while the container is `display:none`** (`isDisplayed()` checks computed style). After making a previously-hidden tree container visible, call `setData(getData())` again to force the first real render. The catalog's Grid/Tree switch does exactly this on every switch to Tree (cheap enough to just always do, no staleness-tracking flag needed).
- Groups (rows with `children`) **default to `collapsed: true`** (`src/toolkit.js`, `sortedListItem.collapsed = true` when building the sorted tree) unless `initialState.expandedRowsIndices`/`expandedRowsValues` says otherwise — confirmed live: 8 visible top-level rows out of 108 total DOM rows before any click (`JSTreeTable` renders every row up front and hides collapsed descendants with CSS/a `hidden` flag, so a raw DOM `[row]` count is not the same as a `:visible` count).
- **Expand/collapse only responds to a click within the row's first 16px** (`ev.clientX < 16` in `JSTreeTable.prototype.generateRowElement`) — clicking elsewhere on the row just selects it. Existing, unmodified behavior; don't "fix" it, and don't assume a plain `.click()` on a row will expand it in a test.
- `JSTreeTable.prototype.fireSortChanged` (fired when a column header is clicked) only calls the model's `sortChanged(sort)` hook — **it does not itself re-render**. `FurnitureTablePanel`'s `sortChanged` gets away without calling `setData` directly because it round-trips through `Home`'s own sort properties, which triggers a property-change listener that calls `setModel` (which does re-render). A model with no such external state (like the catalog tree) must call `treeTable.setData(treeTable.getData())` directly inside its own `sortChanged`.
- `setSelectedRowsByValue(values)` (public) expands the ancestors of the given row values and visually selects them, without firing `selectionChanged` — a safe, reusable "make these rows visible" primitive (e.g. search-match auto-expand) that doesn't touch the real furniture selection. Wired into the catalog's existing `filterCatalog` method (which already computes the matching-pieces-per-category list for the grid; the tree call is one extra line in the same loop).
- Single-column tables need `defaultWidth: "100%"` **and** a CSS override forcing `[body]`/`[body] [row]` to `width:100%` (the class defaults are `inline-flex`/`min-width:100%`, which shrink-to-fit with only one column, rendering it at roughly half width).
- `FurnitureCategory`/`CatalogPieceOfFurniture` are real classes (`new FurnitureCategory(name)`, `instanceof` works) — usable directly as tree row values, so object identity is already a unique key.
- The tree's container (`treeContainer.className = "furniture-catalog-list furniture-catalog-tree"`) deliberately shares the `furniture-catalog-list` class with the grid to inherit its scrolling/sizing CSS for free — safe because every existing lookup does `getElementsByClassName("furniture-catalog-list")[0]` and the grid stays index `[0]` as long as the tree container is inserted after it in the DOM (checked every call site before reusing the class).

## Menus / toolbar extension points
- `HomePane.prototype.createPopupMenus`'s `this.furnitureCatalogPopupMenu = new JSPopupMenu(preferences, view, function(builder) {...})` block already exists; `builder.addMenuItem(label, callback)` adds a plain custom item, independent of the `ActionType` enum — the right place for new catalog-related menu items (no generated-code changes needed). **Feature 3 uses this**: `homePane.importController = new ImportController(controller, preferences)` (created once, lazily, right before the `JSPopupMenu` is built) then `homePane.importController.addPopupMenuItems(builder)` adds a separator plus the three import menu items, right after the two existing `addActionToMenu` calls.
- `HomePane.prototype.createToolBar`'s `new-home`/`open`/`save`/`save-as` blocks (driven by CSS classes on `#home-pane-toolbar` in `test/testHome.html`) must not be touched when adding new toolbar buttons — use `addButtonToToolBar(toolBar, button)` instead (already used elsewhere for the magnetism/lock-plan toggle buttons, which aren't tied to `ActionType` either).
- `FurnitureController.prototype.addFurniture(pieceArray)` (transpiled desktop `FurnitureController.java`) is the correct, undo-aware, selection-updating way to add a new `HomePieceOfFurniture` to the home. `homeController.getFurnitureController()` is how `ImportController` (constructed with the `HomeController`, not the furniture controller directly) reaches it.

## Localization
Flat key-value JSON, `lib/resources/localization.json` is the English default (`ClassName.propertyKey` keys), `_xx.json` files are per-language overlays. `preferences.getLocalizedString("ClassName", "propertyKey", ...args)`; placeholders are printf-style (`%s`, `%d`), not `{0}`. New keys only need adding to the default file — translating into all ~20 languages is out of scope. **Caveat confirmed 2026-09-19**: `lib/resources/` is gitignored build output that doesn't exist until `ant applicationLibraries` runs — a fresh, unbuilt checkout has nothing to add keys to. Feature 2's new UI strings (Upload button, upload-error alerts) were therefore left as hardcoded English string literals in `src/SweetHome3DJSApplication.js`/`src/HomePane.js` rather than localization keys; migrate them once a build exists if full i18n is wanted. Resource bundles are also **lazy and cached per-preferences-object**: `UserPreferences.prototype.getResourceBundles` (`src/UserPreferences.js:364-380`) only loads on a preferences object's first `getLocalizedString` call, using `Locale.getDefault()` *at that moment* — see the locale-leak bug above for why that matters.

## Format support status (last verified 2026-09-19, by direct source inspection and real browser testing — not by trusting a prior version of this table)
| Format | Status |
|---|---|
| `.sh3d` (local open/save) | Works through the upstream local fallback when `readHomeURL` is undefined — unmodified upstream behavior |
| `.sh3d` (shared list/upload/delete/export) | **Done, browser-verified 2026-09-19** (Playwright + real PHP via `php -S`). See the plan doc's "Feature 2" section and "Shared project UI anchors" above |
| Catalog Grid/Tree toggle | **Done, browser-verified 2026-09-19.** See the plan doc's "Feature 1" section and "Catalog UI" above |
| `.sh3f` (furniture library) | **Done, browser-verified 2026-09-19** against the real `import-materials-for-tests/KatorLegaz.sh3f` fixture — 90 pieces imported, new categories appeared live in both Grid and Tree |
| `.sh3t` (texture library) | **Done, browser-verified 2026-09-19** against the real `import-materials-for-tests/Contributions.sh3t` fixture — 57 textures imported |
| `.obj` | **Done, browser-verified 2026-09-19** against the real `import-materials-for-tests/MurphyBed.obj` fixture (no `.mtl` — correctly reported "geometry only"), added to the home and visually confirmed in the furniture list |
| `.dae`, `.3ds`, `.kmz` | **Implemented, sharing `.obj`'s exact code path past the `.kmz`-is-already-a-zip branch — but genuinely not empirically tested, no fixture exists for any of them.** Say so if asked; don't claim verification that wasn't done |
