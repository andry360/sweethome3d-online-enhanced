# SweetHome3DJS — AI Source Map (confirmed facts)

Read `SweetHome3DJS_online_customization_plan.md` (workspace root) first — it has the goal, the "check what's already built" step, and the exact recipe (with every gotcha inlined) for each feature. This file is the supporting technical reference: exact class/method signatures and architecture facts, verified by reading the actual source (`SweetHome3DJS-7.5.2-src/src/`, the transpiled `lib/generated/SweetHome3D.js`, and — where noted — the desktop Java source under `SweetHome3Djava-desktop/`). Re-grep before relying on a specific line number; the live code is the ground truth, this is a map of it.

## Build
- Ant (`build.xml`), target `applicationLibraries` (`applicationBuild` doesn't exist). Full target list: `transpiledLibraries`, `viewerLibraries`, `applicationLibraries`, `jsweetCandy`, `applicationResources`, `viewerConcat`, `applicationConcat`, `recorderWorkerConcat`, `commonLibrariesDistribution`, `viewerDistribution`, `applicationDistribution`, `install-yuicompressor`, `viewerBuild` (default), `applicationJspDeploy(Test)`, `applicationJspBuild`, `applicationPhpDeploy`, `applicationPhpBuild`, `jsdoc`, `install-jsdoc-toolkit-ant-task`, `sourceArchive`.
- No desktop jar build needed — `transpiledLibraries` points JSweet directly at the desktop's Java **source** tree (`../SweetHome3D/src`, expects a sibling junction to `SweetHome3Djava-desktop/SweetHome3D-7.5-src/`).
- JSweet 3.2.0-SNAPSHOT + JDK 17 needs `--add-exports`/`--add-opens` for several `jdk.compiler/com.sun.tools.javac.*` packages (full flag list in the plan doc) — set via `JDK_JAVA_OPTIONS`, not `JAVA_TOOL_OPTIONS` (this JDK build rejects `--add-exports` specifically through that variable: "Unrecognized option").
- Hand-written `src/*.js` files are loaded directly by `<script>` tags in `test/testHome.html` — no rebuild needed after editing them. Only `tools/JSweet`-transpiled content requires `ant applicationLibraries`.
- Browser smoke test: HTTP 200 is not proof of anything — the toolbar/catalog/2D plan/3D view must actually render (verified with a headless-Chromium screenshot in past sessions). Ignore `404` console errors (known baseline) and WebGL `GPU stall` warnings.

## Home lifecycle / recorders
- `HomeRecorder` (`src/HomeRecorder.js`) — plain constructor function, **callback-based, never a class, never async/Promise**. `readHome(url, {homeLoaded, homeError, progression})`; `writeHome(home, homeName, {homeSaved, homeError})` returns `{abort}`. Operates on Blob URLs / in-memory ZIPs (JSZip 2.x) — no server needed.
- `DirectHomeRecorder`/`IncrementalHomeRecorder` are the server-backed variants.
- `SweetHome3DJSApplication.prototype.createHomeController`/`.getHomeRecorder` (`src/SweetHome3DJSApplication.js`) switch on `configuration.readHomeURL`: undefined → `LocalFileHomeController` + plain `HomeRecorder` (local); defined → server-backed controllers.
- The current `test/testHome.html` configuration does not set `readHomeURL`, so its existing Open/Save behavior is local. The shared-project implementation must configure or add a server-backed path; do not treat the current test configuration as a permanent limitation.
- `LocalFileHomeController.prototype.save` renames `.sh3d` → `.sh3x` before writing. This is original upstream behavior; preserve it unless the local fallback is explicitly changed.
- `.sh3d` format: a ZIP with a `Home.xml` entry (SAX-parsed via `HomeXMLHandler`) plus embedded resources resolved as `jar:zipUrl!/entryPath` content URLs (`URLContent`/`BlobURLContent`).

## Shared project UI anchors (current source)
- `SweetHome3DJSApplication.js` builds the Open dialog after `getAvailableHomes()` returns. The dialog root receives class `.open-dialog`; the project list is `.open-dialog .home-list`; each current row is a `div.home-list .item`.
- `JSDialog` supplies `.dialog-buttons`, `.dialog-ok-button`, and `.dialog-cancel-button`. The current Delete control is created with `document.createElement("button")` and inserted immediately before Cancel; it has no stable class or ID.
- The requested Upload control belongs in `.dialog-buttons` between the Open `.dialog-ok-button` and that dynamic Delete control. It must not be placed inside `.home-list`.
- `HomePane.prototype.createToolBar` obtains `#home-pane-toolbar` and creates the standard file actions from its `new-home`, `open`, `save`, and `save-as` classes. The generated action IDs are `#toolbar-button-NEW_HOME`, `#toolbar-button-OPEN`, `#toolbar-button-SAVE`, and `#toolbar-button-SAVE_AS`.
- Current project rows are populated with `innerHTML`; this is an existing implementation detail and must be replaced with safe text/DOM APIs when filenames become server-controlled.

## Catalogs
- `FurnitureCatalog`/`TexturesCatalog` (generated bundle) — base classes with `add(category, piece)`, `delete(piece)`, `addFurnitureListener`/`addTexturesListener`, `getCategories()`, `getCategoriesCount()`, `getCategory(i)`. `FurnitureCategory.getFurniture()`/`getFurnitureCount()`; `TexturesCategory.getTextures()`/`getTexturesCount()`.
- `DefaultFurnitureCatalog`/`DefaultTexturesCatalog` (`src/*.js`) extend the above, adding only parsing: `readFurniture(resourceBundleArray, catalogUrl, resourcesUrlBase, identifiedIdsArray)` / `readTextures(...)` (same shape), plus `readPieceOfFurniture`/`readTexture`, `readFurnitureCategory`/`readTexturesCategory`. `resourceBundleArray` is a plain array of `{key: value}` string dicts (searched in order, Java-locale-fallback style), read via `CoreTools.getStringFromKey`.
- **`preferences.getFurnitureCatalog()`/`getTexturesCatalog()` return a plain `FurnitureCatalog`/`TexturesCatalog`, never `DefaultFurnitureCatalog`/`DefaultTexturesCatalog`.** `RecordedUserPreferences` (`src/UserPreferences.js`) always constructs a plain empty catalog, then (`updateDefaultCatalogs`) builds a *temporary* `DefaultFurnitureCatalog` purely to parse the default JSON catalog and copies its pieces into the live one via `add()`. Any importer must follow the same pattern (see plan Feature 3) — calling `.readFurniture()` on the live catalog throws `"not a function"`.
- `.sh3f`/`.sh3t` archives: a ZIP containing a root `PluginFurnitureCatalog.properties` / `PluginTexturesCatalog.properties` (desktop constants `DefaultFurnitureCatalog.PLUGIN_FURNITURE_CATALOG_FAMILY`/`DefaultTexturesCatalog.PLUGIN_TEXTURES_CATALOG_FAMILY`) plus per-locale variants and the referenced model/icon/texture files. No `.properties` parser exists in the JS port (only JSON-bundle loading) — must be hand-written.
- `CatalogPieceOfFurniture`'s constructor (generated, JSweet-overload-resolved) throws `"invalid overload"` for near-miss argument lists/types. Known-good minimal 18-arg tuple (from `ModelPreviewComponent.js:568-571`): `(id=null, name=null, model, width, depth, height, elevation=0, movable=false, null, null, modelRotation=null, modelFlags=0, null, null, 0, 0, 1, false)` — set name/movability afterward via `HomePieceOfFurniture.prototype.setName`/`setMovable`.

## 3D loaders (no Three.js anywhere in this codebase)
- `ModelLoader` (`src/ModelLoader.js`), base of `OBJLoader`/`DAELoader`/`Max3DSLoader`. `load(url, synchronous, {modelLoaded, modelError, progression})` — `url` is **always** treated as a ZIP (plain zip: auto-picks first entry matching the loader's extension; `jar:zipUrl!/entryName`: uses that entry). No dedicated KMZ loader — it's a ZIP containing a `.dae`, used as-is with `DAELoader`.
- `ModelManager.prototype.loadModel(content, synchronous, observer)` wraps the above and tries each registered loader (`OBJLoader`, `DAELoader`, `Max3DSLoader`) in turn until one succeeds. **Its success callback is `observer.modelUpdated(model)`, not `modelLoaded`** (that name is `ModelLoader`-internal only).
- `ModelManager.prototype.getSize(node)` → `vec3` where `[0]=width(x), [1]=height(y), [2]=depth(z)` (Y-up convention), so a `(width, depth, height)` triple is `[size[0], size[2], size[1]]`.

## Catalog UI (`src/FurnitureCatalogListPanel.js`, `src/toolkit.js`)
- The current filter row is `#furniture-filter`; it contains `#furniture-category-select` and the search input `#furniture-search-field`. A Grid/Tree control should be added alongside the search input, outside it, without changing the input's semantic role.
- `JSTreeTable(container, preferences, model, data)` — generic column-based tree table, already used by `src/FurnitureTablePanel.js` (do not modify that file). Data shape: `{value, children: [{value}, ...]}[]`; `model.renderCell(value, columnName, cellDiv)`; `model.getValueComparator(sortConfig)`; `selectionChanged`/`rowDoubleClicked`/`expandedRowsChanged`/`sortChanged` callbacks must all be functions (even no-ops) or the internal call site throws; `initialState.expandedRowsIndices`/`sort`.
- `setData()` **silently does nothing while the container is `display:none`** (`isDisplayed()` checks computed style). After making a previously-hidden tree container visible, call `setData(getData())` again to force the first real render.
- `setSelectedRowsByValue(values)` (public) expands the ancestors of the given row values and visually selects them, without firing `selectionChanged` — a safe, reusable "make these rows visible" primitive (e.g. search-match auto-expand) that doesn't touch the real furniture selection.
- Single-column tables need `defaultWidth: "100%"` **and** a CSS override forcing `[body]`/`[body] [row]` to `width:100%` (the class defaults are `inline-flex`/`min-width:100%`, which shrink-to-fit with only one column, rendering it at roughly half width).
- `FurnitureCategory`/`CatalogPieceOfFurniture` are real classes (`new FurnitureCategory(name)`, `instanceof` works) — usable directly as tree row values, so object identity is already a unique key.

## Menus / toolbar extension points
- `HomePane.prototype.createPopupMenus`'s `this.furnitureCatalogPopupMenu = new JSPopupMenu(preferences, view, function(builder) {...})` block already exists; `builder.addMenuItem(label, callback)` adds a plain custom item, independent of the `ActionType` enum — the right place for new catalog-related menu items (no generated-code changes needed).
- `HomePane.prototype.createToolBar`'s `new-home`/`open`/`save`/`save-as` blocks (driven by CSS classes on `#home-pane-toolbar` in `test/testHome.html`) must not be touched when adding new toolbar buttons — use `addButtonToToolBar(toolBar, button)` instead (already used elsewhere for the magnetism/lock-plan toggle buttons, which aren't tied to `ActionType` either).
- `FurnitureController.prototype.addFurniture(pieceArray)` (transpiled desktop `FurnitureController.java`) is the correct, undo-aware, selection-updating way to add a new `HomePieceOfFurniture` to the home.

## Localization
Flat key-value JSON, `lib/resources/localization.json` is the English default (`ClassName.propertyKey` keys), `_xx.json` files are per-language overlays. `preferences.getLocalizedString("ClassName", "propertyKey", ...args)`; placeholders are printf-style (`%s`, `%d`), not `{0}`. New keys only need adding to the default file — translating into all ~20 languages is out of scope.

## Format support status (last verified)
| Format | Status |
|---|---|
| `.sh3d` (local open/save) | Works through the upstream local fallback when `readHomeURL` is undefined |
| `.sh3d` (shared list/upload/delete/export) | Not yet verified; requires a configured server-backed recorder/API and persistent storage |
| `.sh3f` (furniture library) | Import implemented and browser-verified with a real fixture |
| `.sh3t` (texture library) | Import implemented and browser-verified with a real fixture |
| `.obj` | Import implemented and browser-verified (geometry-only path, no `.mtl` fixture available) |
| `.dae`, `.3ds`, `.kmz` | Implemented via the same code path as `.obj`, **not empirically tested** (no fixtures) |
