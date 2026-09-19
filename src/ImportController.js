/*
 * ImportController.js
 *
 * Sweet Home 3D, Copyright (c) 2024 Space Mushrooms <info@sweethome3d.com>
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 59 Temple Place, Suite 330, Boston, MA  02111-1307  USA
 */

// Requires SweetHome3D.js
// Requires HomePane.js
// Requires DefaultFurnitureCatalog.js
// Requires DefaultTexturesCatalog.js
// Requires ModelManager.js
// Requires URLContent.js

/**
 * Handles desktop import parity from the furniture catalog's popup menu: furniture/texture
 * libraries (.sh3f/.sh3t) and single 3D models (OBJ/DAE/3DS/KMZ).
 * @param {HomeController} homeController
 * @param {UserPreferences} preferences
 * @constructor
 * @author Claude
 */
function ImportController(homeController, preferences) {
  this.homeController = homeController;
  this.preferences = preferences;
}

ImportController.MAX_ARCHIVE_SIZE = 200 * 1024 * 1024;
ImportController.MAX_ZIP_ENTRIES = 20000;

/**
 * Adds the three import menu items to the furniture catalog's popup menu builder.
 * @param {JSPopupMenu.Builder} builder
 */
ImportController.prototype.addPopupMenuItems = function(builder) {
  var controller = this;
  builder.addSeparator();
  builder.addMenuItem("Import furniture library (.sh3f)...", function() {
      controller.pickFiles(".sh3f", false, function(files) {
          controller.importFurnitureLibrary(files[0]);
        });
    });
  builder.addMenuItem("Import texture library (.sh3t)...", function() {
      controller.pickFiles(".sh3t", false, function(files) {
          controller.importTextureLibrary(files[0]);
        });
    });
  builder.addMenuItem("Import 3D model...", function() {
      // Multiple files accepted so a loose .obj/.dae/.3ds can be selected together with its
      // .mtl/textures - ModelLoader always expects a ZIP, so these get bundled into one below.
      controller.pickFiles(".obj,.dae,.3ds,.kmz", true, function(files) {
          controller.importModel(files);
        });
    });
}

/**
 * Opens a native file picker and invokes callback(FileList) once files are chosen. Creates and
 * discards a fresh hidden input each time to avoid stale .value / stale listener issues.
 * @private
 */
ImportController.prototype.pickFiles = function(accept, multiple, callback) {
  var input = document.createElement("input");
  input.type = "file";
  input.accept = accept;
  if (multiple) {
    input.multiple = true;
  }
  input.style.display = "none";
  document.body.appendChild(input);
  input.addEventListener("change", function() {
      var files = input.files;
      document.body.removeChild(input);
      if (files.length > 0) {
        callback(files);
      }
    });
  input.click();
}

/** @private */
ImportController.prototype.reportImportSuccess = function(message) {
  console.info(message);
  alert(message);
}

/** @private */
ImportController.prototype.reportImportError = function(message) {
  console.error(message);
  alert(message);
}

/**
 * Reads file as an ArrayBuffer.
 * @private
 */
ImportController.prototype.readFileAsArrayBuffer = function(file, onSuccess, onError) {
  var fileReader = new FileReader();
  fileReader.onload = function() {
      onSuccess(fileReader.result);
    };
  fileReader.onerror = function() {
      if (onError) {
        onError(fileReader.error);
      }
    };
  fileReader.readAsArrayBuffer(file);
}

/**
 * Validates file as a ZIP archive (signature, size cap, entry cap, path traversal), then calls
 * onValid(zip, blobUrl) - blobUrl is intentionally not revoked by this method: on success it
 * backs jar:blobUrl!/... URLs that read imported content lazily for the rest of the session.
 * @private
 */
ImportController.prototype.readAndValidateZip = function(file, onValid) {
  var controller = this;
  if (file.size <= 0 || file.size > ImportController.MAX_ARCHIVE_SIZE) {
    controller.reportImportError("\"" + file.name + "\" is too large or empty to import.");
    return;
  }
  this.readFileAsArrayBuffer(file, function(buffer) {
      var signature = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength));
      if (signature.length < 4 || signature[0] !== 0x50 || signature[1] !== 0x4B
          || signature[2] !== 0x03 || signature[3] !== 0x04) {
        controller.reportImportError("\"" + file.name + "\" is not a valid zip archive.");
        return;
      }
      var blobUrl = URL.createObjectURL(new Blob([buffer]));
      ZIPTools.getZIP(blobUrl, {
          zipReady: function(zip) {
            var entries = zip.file(/.*/);
            if (entries.length > ImportController.MAX_ZIP_ENTRIES) {
              controller.reportImportError("\"" + file.name + "\" contains too many entries.");
              URL.revokeObjectURL(blobUrl);
              return;
            }
            for (var i = 0; i < entries.length; i++) {
              if (entries[i].name.indexOf("..") !== -1) {
                controller.reportImportError("\"" + file.name + "\" contains unsafe entry paths.");
                URL.revokeObjectURL(blobUrl);
                return;
              }
            }
            onValid(zip, blobUrl);
          },
          zipError: function(error) {
            console.error(error);
            controller.reportImportError("\"" + file.name + "\" could not be read as a zip archive.");
            URL.revokeObjectURL(blobUrl);
          }
        });
    }, function() {
      controller.reportImportError("Could not read \"" + file.name + "\".");
    });
}

/**
 * Imports every piece of furniture described in a .sh3f archive into the live furniture catalog.
 */
ImportController.prototype.importFurnitureLibrary = function(file) {
  var controller = this;
  this.readAndValidateZip(file, function(zip, blobUrl) {
      var propertiesEntry = zip.file("PluginFurnitureCatalog.properties");
      if (propertiesEntry === null) {
        controller.reportImportError("\"" + file.name + "\" doesn't contain a furniture library.");
        URL.revokeObjectURL(blobUrl);
        return;
      }
      try {
        var properties = ImportController.parseProperties(propertiesEntry.asText());
        // preferences.getFurnitureCatalog() returns a plain FurnitureCatalog, which has no
        // readFurniture() of its own ("not a function") - only DefaultFurnitureCatalog can
        // parse a resource bundle, so read into a throwaway instance of it, then copy the
        // parsed pieces into the live catalog via its own (inherited) add(category, piece).
        var reader = Object.create(DefaultFurnitureCatalog.prototype);
        FurnitureCatalog.call(reader);
        reader.libraries = [];
        reader.readFurniture([properties], null, "jar:" + blobUrl + "!/", []);

        var liveCatalog = controller.preferences.getFurnitureCatalog();
        var categories = reader.getCategories();
        var pieceCount = 0;
        for (var i = 0; i < categories.length; i++) {
          var category = categories[i];
          var pieces = category.getFurniture();
          for (var j = 0; j < pieces.length; j++) {
            liveCatalog.add(category, pieces[j]);
            pieceCount++;
          }
        }
        if (pieceCount === 0) {
          controller.reportImportError("\"" + file.name + "\" doesn't contain any furniture.");
          URL.revokeObjectURL(blobUrl);
        } else {
          // Never revoke: imported models/icons are read lazily via jar:blobUrl!/... URLs
          // for as long as the imported pieces exist in the catalog.
          controller.reportImportSuccess(pieceCount + " furniture piece(s) imported from \"" + file.name + "\".");
        }
      } catch (ex) {
        console.error(ex);
        controller.reportImportError("Could not import \"" + file.name + "\": " + ex.message);
        URL.revokeObjectURL(blobUrl);
      }
    });
}

/**
 * Imports every texture described in a .sh3t archive into the live textures catalog.
 */
ImportController.prototype.importTextureLibrary = function(file) {
  var controller = this;
  this.readAndValidateZip(file, function(zip, blobUrl) {
      var propertiesEntry = zip.file("PluginTexturesCatalog.properties");
      if (propertiesEntry === null) {
        controller.reportImportError("\"" + file.name + "\" doesn't contain a texture library.");
        URL.revokeObjectURL(blobUrl);
        return;
      }
      try {
        var properties = ImportController.parseProperties(propertiesEntry.asText());
        var reader = Object.create(DefaultTexturesCatalog.prototype);
        TexturesCatalog.call(reader);
        reader.libraries = [];
        reader.readTextures([properties], null, "jar:" + blobUrl + "!/", []);

        var liveCatalog = controller.preferences.getTexturesCatalog();
        var categories = reader.getCategories();
        var textureCount = 0;
        for (var i = 0; i < categories.length; i++) {
          var category = categories[i];
          var textures = category.getTextures();
          for (var j = 0; j < textures.length; j++) {
            liveCatalog.add(category, textures[j]);
            textureCount++;
          }
        }
        if (textureCount === 0) {
          controller.reportImportError("\"" + file.name + "\" doesn't contain any texture.");
          URL.revokeObjectURL(blobUrl);
        } else {
          controller.reportImportSuccess(textureCount + " texture(s) imported from \"" + file.name + "\".");
        }
      } catch (ex) {
        console.error(ex);
        controller.reportImportError("Could not import \"" + file.name + "\": " + ex.message);
        URL.revokeObjectURL(blobUrl);
      }
    });
}

/**
 * Imports a single 3D model (OBJ/DAE/3DS/KMZ) - files is the FileList from the file picker,
 * which may contain a loose .obj/.dae/.3ds plus its .mtl/textures selected alongside it.
 */
ImportController.prototype.importModel = function(files) {
  var controller = this;
  var fileArray = Array.prototype.slice.call(files);
  var mainFile = null;
  for (var i = 0; i < fileArray.length; i++) {
    if (/\.(obj|dae|3ds|kmz)$/i.test(fileArray[i].name)) {
      mainFile = fileArray[i];
      break;
    }
  }
  if (mainFile === null) {
    controller.reportImportError("Select a .obj, .dae, .3ds or .kmz file.");
    return;
  }

  if (/\.kmz$/i.test(mainFile.name)) {
    // .kmz is already a ZIP containing a .dae - use its blob URL directly, no re-bundling.
    controller.readFileAsArrayBuffer(mainFile, function(buffer) {
        var blobUrl = URL.createObjectURL(new Blob([buffer]));
        controller.loadModelAndAddToHome(blobUrl, mainFile.name, false);
      }, function() {
        controller.reportImportError("Could not read \"" + mainFile.name + "\".");
      });
    return;
  }

  // Loose .obj/.dae/.3ds: ModelLoader always expects a ZIP, so bundle every selected file
  // into a fresh in-memory one (same JSZip API HomeRecorder.js uses for .sh3d saving).
  var isLoneObjWithoutMaterial = /\.obj$/i.test(mainFile.name)
      && !fileArray.some(function(f) { return /\.mtl$/i.test(f.name); });
  var zip = new JSZip();
  var pending = fileArray.length;
  var failed = false;
  fileArray.forEach(function(f) {
      controller.readFileAsArrayBuffer(f, function(buffer) {
          if (failed) {
            return;
          }
          zip.file(f.name, new Uint8Array(buffer), {binary: true});
          if (--pending === 0) {
            var zipBlobUrl = URL.createObjectURL(zip.generate({type: "blob", compression: "STORE"}));
            controller.loadModelAndAddToHome("jar:" + zipBlobUrl + "!/" + mainFile.name, mainFile.name, isLoneObjWithoutMaterial);
          }
        }, function() {
          if (!failed) {
            failed = true;
            controller.reportImportError("Could not read \"" + f.name + "\".");
          }
        });
    });
}

/**
 * Loads modelUrl and adds it as a new piece of furniture to the current home (not the catalog).
 * @private
 */
ImportController.prototype.loadModelAndAddToHome = function(modelUrl, mainFileName, geometryOnly) {
  var controller = this;
  var modelManager = ModelManager.getInstance();
  var modelContent = URLContent.fromURL(modelUrl);
  modelManager.loadModel(modelContent, false, {
      // ModelManager re-wraps ModelLoader's internal modelLoaded/modelError callbacks as
      // modelUpdated/modelError - using modelLoaded here would silently do nothing.
      modelUpdated: function(loadedModelRoot) {
        var size = modelManager.getSize(loadedModelRoot);
        // Verbatim 18-argument tuple (ModelPreviewComponent.js:568-571) - any deviation risks
        // a JSweet "invalid overload" runtime error. size is [width(x), height(y), depth(z)];
        // the constructor wants (width, depth, height), i.e. [size[0], size[2], size[1]].
        // CRITICAL: the 3rd argument is the URLContent reference (what ModelPreviewComponent.js
        // calls "model", its own outer setModel() parameter), NOT the loaded Group3D scene node
        // this callback receives (ModelPreviewComponent.js's "modelRoot", used only for
        // getSize() there too) - passing the loaded node here throws "invalid overload"
        // because the constructor's model parameter is typed as Content, not a scene node.
        var piece = new HomePieceOfFurniture(
            new CatalogPieceOfFurniture(null, null, modelContent, size[0], size[2], size[1], 0, false, null, null,
                null, 0, null, null, 0, 0, 1, false));
        piece.setName(mainFileName);
        piece.setMovable(true);
        controller.homeController.getFurnitureController().addFurniture([piece]);
        if (geometryOnly) {
          controller.reportImportSuccess("\"" + mainFileName + "\" imported (geometry only - no material file was provided).");
        } else {
          controller.reportImportSuccess("\"" + mainFileName + "\" imported.");
        }
      },
      modelError: function(error) {
        console.error(error);
        controller.reportImportError("Could not import \"" + mainFileName + "\": " + error);
      }
    });
}

/**
 * Parses Java .properties syntax (comments, "\" line continuation, "="/":"/whitespace
 * separators, "\uXXXX" and other backslash escapes) into a flat {key: value} object - the
 * shape DefaultFurnitureCatalog.readFurniture()/DefaultTexturesCatalog.readTextures() expect
 * as one entry of their resourceBundle array. The JS port has no properties parser of its own,
 * only JSON-bundle loading.
 */
ImportController.parseProperties = function(text) {
  var lines = text.split(/\r\n|\r|\n/);
  var logicalLines = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    while (ImportController.endsWithOddBackslashes(line) && i + 1 < lines.length) {
      i++;
      line = line.substring(0, line.length - 1) + lines[i].replace(/^[ \t\f]+/, "");
    }
    logicalLines.push(line);
  }
  var properties = {};
  for (var i = 0; i < logicalLines.length; i++) {
    var line = logicalLines[i].replace(/^[ \t\f]+/, "");
    if (line.length === 0 || line.charAt(0) === "#" || line.charAt(0) === "!") {
      continue;
    }
    var entry = ImportController.splitPropertyLine(line);
    properties[entry.key] = entry.value;
  }
  return properties;
}

/** @private */
ImportController.endsWithOddBackslashes = function(line) {
  var count = 0;
  for (var i = line.length - 1; i >= 0 && line.charAt(i) === "\\"; i--) {
    count++;
  }
  return count % 2 === 1;
}

/**
 * Splits an unescaped logical line into its raw key/value parts, then unescapes each - done in
 * that order so an escaped separator (\=, \:, \ ) inside the key isn't mistaken for the real one.
 * @private
 */
ImportController.splitPropertyLine = function(line) {
  var i = 0;
  var keyEnd = -1;
  while (i < line.length) {
    var c = line.charAt(i);
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === "=" || c === ":" || c === " " || c === "\t" || c === "\f") {
      keyEnd = i;
      break;
    }
    i++;
  }
  var rawKey, rawValue;
  if (keyEnd === -1) {
    rawKey = line;
    rawValue = "";
  } else {
    rawKey = line.substring(0, keyEnd);
    var rest = line.substring(keyEnd);
    var j = 0;
    while (j < rest.length && (rest.charAt(j) === " " || rest.charAt(j) === "\t" || rest.charAt(j) === "\f")) {
      j++;
    }
    if (j < rest.length && (rest.charAt(j) === "=" || rest.charAt(j) === ":")) {
      j++;
      while (j < rest.length && (rest.charAt(j) === " " || rest.charAt(j) === "\t" || rest.charAt(j) === "\f")) {
        j++;
      }
    }
    rawValue = rest.substring(j);
  }
  return {key: ImportController.unescapeProperty(rawKey), value: ImportController.unescapeProperty(rawValue)};
}

/** @private */
ImportController.unescapeProperty = function(text) {
  var result = "";
  for (var i = 0; i < text.length; i++) {
    var c = text.charAt(i);
    if (c === "\\" && i + 1 < text.length) {
      var next = text.charAt(i + 1);
      if (next === "u") {
        var hex = text.substring(i + 2, i + 6);
        result += String.fromCharCode(parseInt(hex, 16));
        i += 5;
      } else if (next === "n") {
        result += "\n";
        i++;
      } else if (next === "t") {
        result += "\t";
        i++;
      } else if (next === "r") {
        result += "\r";
        i++;
      } else if (next === "f") {
        result += "\f";
        i++;
      } else {
        // \\, \:, \=, \#, \!, \ (space), or any other char: the backslash is dropped.
        result += next;
        i++;
      }
    } else {
      result += c;
    }
  }
  return result;
}
