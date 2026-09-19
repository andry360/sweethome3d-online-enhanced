// local-server/server.js
//
// Local dev stand-in for deployDirectHomeRecorder/*.php, used to exercise the shared-projects
// feature (list/read/write/delete/upload of .sh3d homes stored as .sh3x) against test/testHome.html
// without needing a PHP install. Serves the whole SweetHome3DJS-7.5.2-src tree statically and
// layers the same route names/query contract the production PHP scripts use, so
// test/testHome.html's server config only needs a different urlBase to switch between this and
// the real deployment. Runtime data lives in local-server/data/ (gitignored), never under
// deployDirectHomeRecorder/data/.
//
// No third-party dependencies: run with `node local-server/server.js` from anywhere, or
// `node server.js` from this directory.

const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = process.env.PORT || 8000;
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(__dirname, "data");
const MAX_UPLOAD_SIZE = 100 * 1024 * 1024; // 100 MB

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".sh3d": "application/octet-stream",
  ".sh3x": "application/octet-stream",
  ".sh3f": "application/octet-stream",
  ".sh3t": "application/octet-stream",
};

function send(res, status, body, headers) {
  res.writeHead(status, Object.assign({ "Content-Type": "text/plain; charset=utf-8" }, headers || {}));
  res.end(body || "");
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (limit !== undefined && size > limit) {
        reject(Object.assign(new Error("Payload too large"), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// Minimal multipart/form-data parser: returns the first part named "file" as
// { filename, data } or null. Only handles what a FormData-driven upload sends.
function parseMultipartFile(buffer, contentType) {
  const boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || "");
  if (!boundaryMatch) {
    return null;
  }
  const boundary = "--" + (boundaryMatch[1] || boundaryMatch[2]).trim();
  const boundaryBuffer = Buffer.from("\r\n" + boundary);
  let start = buffer.indexOf(Buffer.from(boundary));
  if (start < 0) {
    return null;
  }
  start += boundary.length;
  while (start < buffer.length) {
    if (buffer.slice(start, start + 2).toString() === "--") {
      break; // final boundary
    }
    let partStart = start;
    if (buffer.slice(partStart, partStart + 2).toString() === "\r\n") {
      partStart += 2;
    }
    const headerEnd = buffer.indexOf("\r\n\r\n", partStart);
    if (headerEnd < 0) {
      break;
    }
    const header = buffer.slice(partStart, headerEnd).toString("utf8");
    const bodyStart = headerEnd + 4;
    let bodyEnd = buffer.indexOf(boundaryBuffer, bodyStart);
    if (bodyEnd < 0) {
      bodyEnd = buffer.length;
    }
    const nameMatch = /name="([^"]*)"/i.exec(header);
    const filenameMatch = /filename="([^"]*)"/i.exec(header);
    if (nameMatch && nameMatch[1] === "file" && filenameMatch) {
      return { filename: filenameMatch[1], data: buffer.slice(bodyStart, bodyEnd) };
    }
    start = bodyEnd + boundaryBuffer.length;
  }
  return null;
}

function sanitizeSh3dBasename(name) {
  // Basename only, no path separators or traversal, must end in .sh3d.
  if (typeof name !== "string" || name.length === 0) {
    return null;
  }
  const base = path.posix.basename(name.replace(/\\/g, "/"));
  if (base !== name || base.indexOf("..") !== -1 || !/^[^/\\]+\.sh3d$/i.test(base)) {
    return null;
  }
  return base.slice(0, -".sh3d".length);
}

async function handleListHomes(req, res) {
  let files = [];
  try {
    files = fs.readdirSync(DATA_DIR);
  } catch (ex) {
    // No data directory yet == no homes yet.
  }
  const homes = files.filter((f) => f.toLowerCase().endsWith(".sh3x")).map((f) => f.slice(0, -".sh3x".length));
  send(res, 200, JSON.stringify(homes), { "Content-Type": "application/json; charset=utf-8" });
}

async function handleWriteData(req, res, query) {
  const relPath = query.get("path");
  if (!relPath || relPath.indexOf("..") !== -1 || relPath.indexOf("/") !== -1 || relPath.indexOf("\\") !== -1) {
    return send(res, 400, "Invalid path");
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const body = await readBody(req, MAX_UPLOAD_SIZE);
  fs.writeFileSync(path.join(DATA_DIR, relPath), body);
  send(res, 200, "");
}

async function handleDeleteHome(req, res, query) {
  const home = query.get("home");
  if (!home || home.indexOf("..") !== -1 || home.indexOf("/") !== -1 || home.indexOf("\\") !== -1) {
    return send(res, 400, "Invalid home name");
  }
  const target = path.join(DATA_DIR, home + ".sh3x");
  try {
    fs.unlinkSync(target);
  } catch (ex) {
    // Deleting a home that no longer exists is not an error for this test harness.
  }
  send(res, 200, "");
}

async function handleUploadHome(req, res) {
  const body = await readBody(req, MAX_UPLOAD_SIZE + 64 * 1024).catch((err) => {
    send(res, err.statusCode || 500, err.message);
    return null;
  });
  if (body === null) {
    return;
  }
  const part = parseMultipartFile(body, req.headers["content-type"]);
  if (!part) {
    return send(res, 400, "Missing or invalid upload");
  }
  const homeName = sanitizeSh3dBasename(part.filename);
  if (!homeName) {
    return send(res, 400, "File name must be a plain .sh3d file name");
  }
  if (part.data.length === 0 || part.data.length > MAX_UPLOAD_SIZE) {
    return send(res, 400, "Invalid file size");
  }
  if (part.data.slice(0, 4).toString("latin1") !== "PK\x03\x04") {
    return send(res, 400, "Not a valid .sh3d (zip) file");
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const targetFile = path.join(DATA_DIR, homeName + ".sh3x");
  if (fs.existsSync(targetFile)) {
    return send(res, 409, "A project named \"" + homeName + "\" already exists");
  }
  fs.writeFileSync(targetFile, part.data);
  send(res, 200, "");
}

function serveStatic(req, res, pathname) {
  let filePath;
  if (pathname === "/" || pathname === "") {
    filePath = path.join(ROOT, "test", "testHome.html");
  } else if (pathname.startsWith("/data/")) {
    filePath = path.join(DATA_DIR, decodeURIComponent(pathname.slice("/data/".length)));
  } else {
    filePath = path.join(ROOT, decodeURIComponent(pathname));
  }
  if (!filePath.startsWith(ROOT) && !filePath.startsWith(DATA_DIR)) {
    return send(res, 403, "Forbidden");
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      return send(res, 404, "Not found: " + pathname);
    }
    const ext = path.extname(filePath).toLowerCase();
    // No caching: this is a dev server for actively-edited files - a stale cached CSS/JS file
    // after an edit is a worse failure mode than re-reading from disk on every request.
    res.writeHead(200, {
      "Content-Type": CONTENT_TYPES[ext] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://" + req.headers.host);
  const pathname = url.pathname;
  const handler = {
    "/listHomes.php": handleListHomes,
    "/writeData.php": handleWriteData,
    "/deleteHome.php": handleDeleteHome,
    "/uploadHome.php": handleUploadHome,
  }[pathname];
  if (handler) {
    Promise.resolve(handler(req, res, url.searchParams)).catch((err) => {
      console.error(err);
      send(res, 500, "Internal error: " + err.message);
    });
    return;
  }
  serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  console.log("Local shared-projects dev server running at http://127.0.0.1:" + PORT + "/");
  console.log("Open http://127.0.0.1:" + PORT + "/test/testHome.html?skipTests=true&sharedProjects=true");
});
