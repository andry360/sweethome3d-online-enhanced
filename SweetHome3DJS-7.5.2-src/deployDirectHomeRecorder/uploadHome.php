<?php
  /*
   * uploadHome.php 19 sept 2026
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

  // Accepts one multipart .sh3d upload in the "file" field and stores it as
  // data/<basename>.sh3x, matching the extension convention writeData.php/listHomes.php/
  // deleteHome.php already use for shared homes. Never overwrites: responds 409 if a home
  // with the same name already exists.
  $dataDir = "data";
  $maxSize = 100 * 1024 * 1024; // 100 MB

  function fail($status, $message) {
    http_response_code($status);
    header("Content-Type: text/plain");
    echo $message;
    exit;
  }

  if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
    fail(400, "Missing or invalid upload");
  }

  $upload = $_FILES['file'];
  if ($upload['size'] <= 0 || $upload['size'] > $maxSize) {
    fail(400, "Invalid file size");
  }

  // Basename only: reject any path separator or traversal sequence in the original name.
  $originalName = basename(str_replace("\\", "/", $upload['name']));
  if ($originalName !== $upload['name']
      || strpos($originalName, "..") !== false
      || !preg_match('/^[^\\/\\\\]+\\.sh3d$/i', $originalName)) {
    fail(400, "File name must be a plain .sh3d file name");
  }

  $homeName = substr($originalName, 0, -strlen(".sh3d"));
  if ($homeName === "") {
    fail(400, "Invalid file name");
  }

  // Cheap signature check: a .sh3d is a ZIP, which always starts with a local file header.
  $handle = fopen($upload['tmp_name'], 'rb');
  $signature = $handle !== false ? fread($handle, 4) : false;
  if ($handle !== false) {
    fclose($handle);
  }
  if ($signature !== "PK\x03\x04") {
    fail(400, "Not a valid .sh3d (zip) file");
  }

  if (!is_dir($dataDir)) {
    mkdir($dataDir);
  }
  $targetFile = $dataDir . "/" . $homeName . ".sh3x";
  if (file_exists($targetFile)) {
    fail(409, "A project named \"" . $homeName . "\" already exists");
  }

  if (!move_uploaded_file($upload['tmp_name'], $targetFile)) {
    fail(500, "Could not save uploaded file");
  }

  http_response_code(200);
?>
