package com.mcmusic.app;

import android.Manifest;
import android.app.DownloadManager;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.content.BroadcastReceiver;
import android.content.IntentFilter;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.util.Iterator;
import java.util.Locale;

/**
 * Descarga archivos de medios con DownloadManager de Android e inserta inmediatamente en la Galeria (DCIM/MC-Music).
 */
@CapacitorPlugin(
    name = "MediaDownloader",
    permissions = {
        @Permission(
            alias = "storage",
            strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE }
        )
    }
)
public class MediaDownloaderPlugin extends Plugin {

    private BroadcastReceiver downloadReceiver;
    private final java.util.Map<Long, JSObject> directDownloadStates = new java.util.concurrent.ConcurrentHashMap<>();

    @Override
    public void load() {
        super.load();
        downloadReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (DownloadManager.ACTION_DOWNLOAD_COMPLETE.equals(intent.getAction())) {
                    long downloadId = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                    if (downloadId != -1) {
                        scanAndRegisterDownload(downloadId);
                    }
                }
            }
        };
        IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getContext().registerReceiver(downloadReceiver, filter, Context.RECEIVER_EXPORTED);
        } else {
            getContext().registerReceiver(downloadReceiver, filter);
        }
    }

    @Override
    protected void handleOnDestroy() {
        if (downloadReceiver != null) {
            try {
                getContext().unregisterReceiver(downloadReceiver);
            } catch (Exception ignored) {}
        }
        super.handleOnDestroy();
    }

    @PluginMethod
    public void download(PluginCall call) {
        if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.P
            && getPermissionState("storage") != PermissionState.GRANTED) {
            requestPermissionForAlias("storage", call, "downloadAfterPermission");
            return;
        }
        processDownloadCall(call);
    }

    @PermissionCallback
    private void downloadAfterPermission(PluginCall call) {
        if (getPermissionState("storage") != PermissionState.GRANTED) {
            call.reject("Se necesita permiso para guardar el archivo en la Galeria y Descargas.");
            return;
        }
        processDownloadCall(call);
    }

    private void processDownloadCall(PluginCall call) {
        String platform = call.getString("platform", "").toLowerCase(Locale.ROOT);
        if ("tiktok".equals(platform)) {
            downloadDirectly(call);
        } else {
            enqueueDownload(call);
        }
    }

    private void downloadDirectly(PluginCall call) {
        new Thread(() -> {
            String rawUrl = call.getString("url", "").trim();
            String requestedName = call.getString("fileName", "descarga.bin");
            String mimeType = call.getString("mimeType", "application/octet-stream");
            String title = call.getString("title", requestedName);
            JSObject headers = call.getObject("headers");

            long id = System.currentTimeMillis();
            JSObject directState = new JSObject();
            directState.put("state", "running");
            directState.put("downloadedBytes", 0);
            directState.put("totalBytes", -1);
            directDownloadStates.put(id, directState);

            String sanitized = sanitizeFileName(requestedName);
            String fileName = chooseAvailableFileName(sanitized, mimeType);

            // Devolver ID inmediatamente para que el JS empiece a consultar getStatus
            JSObject result = new JSObject();
            result.put("id", id);
            result.put("fileName", fileName);
            call.resolve(result);

            try {
                // 1. Resolver redirecciones
                String resolvedUrl = resolveRedirects(rawUrl, headers, "tiktok");
                
                // 2. Establecer la conexión HTTP
                java.net.URL url = new java.net.URL(resolvedUrl);
                java.net.HttpURLConnection conn = (java.net.HttpURLConnection) url.openConnection();
                conn.setRequestMethod("GET");
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(15000);

                // Cabeceras indispensables según dominio de destino
                conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36");
                String lowerUrl = rawUrl.toLowerCase(Locale.ROOT);
                if (lowerUrl.contains("tikwm.com")) {
                    conn.setRequestProperty("Referer", "https://www.tikwm.com/");
                } else if (lowerUrl.contains("tiktok.com") || lowerUrl.contains("akamaized") || lowerUrl.contains("byteoversea") || lowerUrl.contains("ibyteimg")) {
                    conn.setRequestProperty("Referer", "https://www.tiktok.com/");
                } else if (lowerUrl.contains("youtube") || lowerUrl.contains("googlevideo")) {
                    conn.setRequestProperty("Referer", "https://www.youtube.com/");
                } else if (lowerUrl.contains("instagram") || lowerUrl.contains("cdninstagram")) {
                    conn.setRequestProperty("Referer", "https://www.instagram.com/");
                } else if (lowerUrl.contains("facebook") || lowerUrl.contains("fbcdn")) {
                    conn.setRequestProperty("Referer", "https://www.facebook.com/");
                }

                // Añadir cabeceras adicionales si existen
                if (headers != null) {
                    Iterator<String> headerNames = headers.keys();
                    while (headerNames.hasNext()) {
                        String key = headerNames.next();
                        if (!"User-Agent".equalsIgnoreCase(key) && !"Referer".equalsIgnoreCase(key)) {
                            conn.setRequestProperty(key, String.valueOf(headers.opt(key)));
                        }
                    }
                }

                int responseCode = conn.getResponseCode();
                if (responseCode != java.net.HttpURLConnection.HTTP_OK) {
                    directState.put("state", "failed");
                    directState.put("message", "El servidor de TikTok respondió con error HTTP " + responseCode);
                    return;
                }

                long totalBytes = conn.getContentLength();
                directState.put("totalBytes", totalBytes);

                // 3. Crear el archivo de destino en Movies/MC-Music o Music/MC-Music
                String dirType = mimeType.startsWith("video") ? Environment.DIRECTORY_MOVIES : Environment.DIRECTORY_MUSIC;
                File publicDir = Environment.getExternalStoragePublicDirectory(dirType);
                File mcMusicDir = new File(publicDir, "MC-Music");
                if (!mcMusicDir.exists()) mcMusicDir.mkdirs();
                File targetFile = new File(mcMusicDir, fileName);

                // 4. Descargar el archivo
                long downloaded = 0;
                try (java.io.InputStream in = new java.io.BufferedInputStream(conn.getInputStream());
                     java.io.OutputStream out = new java.io.FileOutputStream(targetFile)) {
                    byte[] buffer = new byte[8192];
                    int bytesRead;
                    while ((bytesRead = in.read(buffer)) != -1) {
                        // Verificar si se canceló la descarga
                        if ("failed".equals(directState.getString("state"))) {
                            try { targetFile.delete(); } catch (Exception ignored) {}
                            return;
                        }
                        out.write(buffer, 0, bytesRead);
                        downloaded += bytesRead;
                        directState.put("downloadedBytes", downloaded);
                    }
                    out.flush();
                }
                conn.disconnect();

                // 5. Indexar en la Galería (MediaStore)
                ContentValues values = new ContentValues();
                values.put(MediaStore.MediaColumns.DISPLAY_NAME, targetFile.getName());
                values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
                values.put(MediaStore.MediaColumns.SIZE, targetFile.length());

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    values.put(MediaStore.MediaColumns.IS_PENDING, 0);
                    values.put(MediaStore.MediaColumns.RELATIVE_PATH, dirType + "/MC-Music");
                }

                Uri collection;
                if (mimeType.startsWith("video")) {
                    values.put(MediaStore.Video.Media.DATA, targetFile.getAbsolutePath());
                    collection = MediaStore.Video.Media.EXTERNAL_CONTENT_URI;
                } else {
                    values.put(MediaStore.Audio.Media.DATA, targetFile.getAbsolutePath());
                    collection = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
                }

                try {
                    getContext().getContentResolver().insert(collection, values);
                } catch (Exception ignored) {}

                try {
                    MediaScannerConnection.scanFile(
                        getContext(),
                        new String[]{ targetFile.getAbsolutePath() },
                        new String[]{ mimeType },
                        null
                    );
                } catch (Exception ignored) {}

                // Guardar éxito
                directState.put("state", "successful");
                directState.put("downloadedBytes", targetFile.length());
                directState.put("totalBytes", targetFile.length());

            } catch (Exception e) {
                android.util.Log.e("MediaDownloader", "Fallo descarga directa: " + e.getMessage());
                directState.put("state", "failed");
                directState.put("message", "Fallo la conexion de red: " + e.getMessage());
            }
        }).start();
    }

    private void enqueueDownload(PluginCall call) {
        new Thread(() -> {
            String rawUrl = call.getString("url", "").trim();
            String requestedName = call.getString("fileName", "descarga.bin");
            String mimeType = call.getString("mimeType", "application/octet-stream");
            String title = call.getString("title", requestedName);
            String platform = call.getString("platform", "").toLowerCase(Locale.ROOT);

            Uri uri;
            try {
                uri = Uri.parse(rawUrl);
            } catch (Exception error) {
                call.reject("La URL de descarga no es valida.");
                return;
            }
            String scheme = uri.getScheme();
            if (uri.getHost() == null
                || !("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme))) {
                call.reject("La descarga solo admite direcciones HTTP o HTTPS.");
                return;
            }

            JSObject headers = call.getObject("headers");
            
            // Resolver redirecciones de red en Java de forma asíncrona antes de pasar la URL a DownloadManager
            String resolvedUrl = resolveRedirects(rawUrl, headers, platform);
            Uri resolvedUri = Uri.parse(resolvedUrl);

            String sanitized = sanitizeFileName(requestedName);
            String fileName = chooseAvailableFileName(sanitized, mimeType);

            DownloadManager manager = getDownloadManager();
            long id = -1;

            try {
                DownloadManager.Request request = buildRequest(resolvedUri, title, mimeType, fileName, headers, resolvedUrl, platform);
                id = manager.enqueue(request);
            } catch (Exception primaryError) {
                String uniqueFileName = createTimestampedFileName(sanitized);
                try {
                    DownloadManager.Request fallbackRequest = buildRequest(resolvedUri, title, mimeType, uniqueFileName, headers, resolvedUrl, platform);
                    id = manager.enqueue(fallbackRequest);
                    fileName = uniqueFileName;
                } catch (Exception secondaryError) {
                    call.reject("Android no pudo iniciar la descarga: " + safeMessage(secondaryError), secondaryError);
                    return;
                }
            }

            // Registrar el ID y el nombre de archivo real en disco de forma persistente
            if (id >= 0) {
                saveDownloadMapping(id, fileName);
            }

            JSObject result = new JSObject();
            result.put("id", id);
            result.put("fileName", fileName);
            call.resolve(result);
        }).start();
    }

    private void saveDownloadMapping(long id, String fileName) {
        try {
            SharedPreferences prefs = getContext().getSharedPreferences("MC_Music_Downloads", Context.MODE_PRIVATE);
            prefs.edit().putString(String.valueOf(id), fileName).apply();
        } catch (Exception ignored) {}
    }

    private String getDownloadMapping(long id) {
        try {
            SharedPreferences prefs = getContext().getSharedPreferences("MC_Music_Downloads", Context.MODE_PRIVATE);
            return prefs.getString(String.valueOf(id), null);
        } catch (Exception e) {
            return null;
        }
    }

    private void removeDownloadMapping(long id) {
        try {
            SharedPreferences prefs = getContext().getSharedPreferences("MC_Music_Downloads", Context.MODE_PRIVATE);
            prefs.edit().remove(String.valueOf(id)).apply();
        } catch (Exception ignored) {}
    }

    private String resolveRedirects(String urlString, JSObject headers, String platform) {
        int maxRedirects = 3;
        String currentUrl = urlString;
        for (int i = 0; i < maxRedirects; i++) {
            try {
                java.net.URL url = new java.net.URL(currentUrl);
                java.net.HttpURLConnection conn = (java.net.HttpURLConnection) url.openConnection();
                conn.setInstanceFollowRedirects(false);
                conn.setRequestMethod("HEAD");
                conn.setConnectTimeout(2500);
                conn.setReadTimeout(2500);

                if (headers != null) {
                    Iterator<String> headerNames = headers.keys();
                    while (headerNames.hasNext()) {
                        String key = headerNames.next();
                        Object value = headers.opt(key);
                        if (value != null) {
                            conn.setRequestProperty(key, String.valueOf(value));
                        }
                    }
                }

                conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36");

                if ("tiktok".equals(platform)) {
                    conn.setRequestProperty("Referer", "https://www.tiktok.com/");
                } else {
                    String lowerUrl = currentUrl.toLowerCase(Locale.ROOT);
                    if (lowerUrl.contains("tiktok") || lowerUrl.contains("akamaized") || lowerUrl.contains("tikwm") || lowerUrl.contains("byteoversea") || lowerUrl.contains("ibyteimg")) {
                        conn.setRequestProperty("Referer", "https://www.tiktok.com/");
                    } else if (lowerUrl.contains("youtube") || lowerUrl.contains("googlevideo")) {
                        conn.setRequestProperty("Referer", "https://www.youtube.com/");
                    } else if (lowerUrl.contains("instagram") || lowerUrl.contains("cdninstagram")) {
                        conn.setRequestProperty("Referer", "https://www.instagram.com/");
                    } else if (lowerUrl.contains("facebook") || lowerUrl.contains("fbcdn")) {
                        conn.setRequestProperty("Referer", "https://www.facebook.com/");
                    }
                }

                int responseCode = conn.getResponseCode();
                if (responseCode >= 300 && responseCode <= 399) {
                    String loc = conn.getHeaderField("Location");
                    conn.disconnect();
                    if (loc == null || loc.trim().isEmpty()) {
                        break;
                    }
                    if (loc.startsWith("/")) {
                        java.net.URL parent = new java.net.URL(currentUrl);
                        loc = parent.getProtocol() + "://" + parent.getHost() + loc;
                    }
                    currentUrl = loc;
                } else {
                    conn.disconnect();
                    break;
                }
            } catch (Exception e) {
                android.util.Log.w("MediaDownloader", "Fallo ligero al resolver redirección: " + e.getMessage());
                break;
            }
        }
        return currentUrl;
    }

    private DownloadManager.Request buildRequest(Uri uri, String title, String mimeType, String fileName, JSObject headers, String rawUrl, String platform) {
        // Para garantizar indexación inmediata en la Galería de CUALQUIER fabricante Android (Samsung, Xiaomi, Motorola, Huawei, Pixel):
        // - Los VIDEOS se guardan en Environment.DIRECTORY_MOVIES + "/MC-Music" (o DIRECTORY_DCIM)
        // - Los AUDIOS MP3 se guardan en Environment.DIRECTORY_MUSIC + "/MC-Music"
        String dirType = (mimeType != null && mimeType.startsWith("video"))
            ? Environment.DIRECTORY_MOVIES
            : Environment.DIRECTORY_MUSIC;
        String subPath = "MC-Music/" + fileName;

        DownloadManager.Request request = new DownloadManager.Request(uri)
            .setTitle(title)
            .setDescription("MC-Music guardando en tu Galería")
            .setMimeType(mimeType)
            .setAllowedOverMetered(true)
            .setAllowedOverRoaming(true)
            .setNotificationVisibility(
                DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED
            )
            .setDestinationInExternalPublicDir(dirType, subPath);

        try {
            request.allowScanningByMediaScanner();
        } catch (Exception ignored) {}

        boolean hasUserAgent = false;
        boolean hasReferer = false;

        if (headers != null) {
            Iterator<String> headerNames = headers.keys();
            while (headerNames.hasNext()) {
                String key = headerNames.next();
                Object value = headers.opt(key);
                if (value != null) {
                    request.addRequestHeader(key, String.valueOf(value));
                    if ("User-Agent".equalsIgnoreCase(key)) hasUserAgent = true;
                    if ("Referer".equalsIgnoreCase(key)) hasReferer = true;
                }
            }
        }

        if (!hasUserAgent) {
            request.addRequestHeader("User-Agent", "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36");
        }
        if (!hasReferer) {
            String lowerUrl = rawUrl.toLowerCase(Locale.ROOT);
            if (lowerUrl.contains("tikwm.com")) {
                request.addRequestHeader("Referer", "https://www.tikwm.com/");
            } else if (lowerUrl.contains("tiktok.com") || lowerUrl.contains("akamaized") || lowerUrl.contains("byteoversea") || lowerUrl.contains("ibyteimg")) {
                request.addRequestHeader("Referer", "https://www.tiktok.com/");
            } else if (lowerUrl.contains("youtube") || lowerUrl.contains("googlevideo")) {
                request.addRequestHeader("Referer", "https://www.youtube.com/");
            } else if (lowerUrl.contains("instagram") || lowerUrl.contains("cdninstagram")) {
                request.addRequestHeader("Referer", "https://www.instagram.com/");
            } else if (lowerUrl.contains("facebook") || lowerUrl.contains("fbcdn")) {
                request.addRequestHeader("Referer", "https://www.facebook.com/");
            }
        }

        return request;
    }

    private String createTimestampedFileName(String requestedName) {
        int extensionIndex = requestedName.lastIndexOf('.');
        String base = extensionIndex > 0 ? requestedName.substring(0, extensionIndex) : requestedName;
        String extension = extensionIndex > 0 ? requestedName.substring(extensionIndex) : "";
        return base + "_" + (System.currentTimeMillis() % 100000) + extension;
    }

    private Long parseId(PluginCall call) {
        Long id = call.getLong("id");
        if (id != null) return id;
        Integer intId = call.getInt("id");
        if (intId != null) return intId.longValue();
        Double doubleId = call.getDouble("id");
        if (doubleId != null) return doubleId.longValue();
        String strId = call.getString("id");
        if (strId != null && !strId.trim().isEmpty()) {
            try {
                return Long.parseLong(strId.trim());
            } catch (NumberFormatException ignored) {}
        }
        return null;
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        Long id = parseId(call);
        if (id == null || id < 0) {
            call.reject("Identificador de descarga no valido.");
            return;
        }

        // Consultar descargas directas primero
        JSObject directState = directDownloadStates.get(id);
        if (directState != null) {
            call.resolve(directState);
            String stateStr = directState.getString("state");
            if ("successful".equals(stateStr) || "failed".equals(stateStr)) {
                directDownloadStates.remove(id);
            }
            return;
        }

        DownloadManager.Query query = new DownloadManager.Query().setFilterById(id);
        try (Cursor cursor = getDownloadManager().query(query)) {
            if (cursor == null || !cursor.moveToFirst()) {
                JSObject missing = new JSObject();
                missing.put("state", "not_found");
                missing.put("message", "La descarga ya no existe en Android.");
                call.resolve(missing);
                return;
            }

            int status = getInt(cursor, DownloadManager.COLUMN_STATUS, DownloadManager.STATUS_FAILED);
            long downloadedBytes = getLong(cursor, DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR, 0);
            long totalBytes = getLong(cursor, DownloadManager.COLUMN_TOTAL_SIZE_BYTES, -1);
            int reason = getInt(cursor, DownloadManager.COLUMN_REASON, 0);
            String localUri = getString(cursor, DownloadManager.COLUMN_LOCAL_URI, "");

            if (status == DownloadManager.STATUS_SUCCESSFUL) {
                if (downloadedBytes > 0 && downloadedBytes <= 1024) {
                    JSObject blocked = new JSObject();
                    blocked.put("state", "failed");
                    blocked.put("message", "El archivo descargado esta vacio o fue rechazado por el servidor del video.");
                    call.resolve(blocked);
                    return;
                }

                // Insercion directa e instantanea en MediaStore de Android (Galeria/Fotos en DCIM/MC-Music)
                scanAndRegisterDownload(id);
            }

            JSObject result = new JSObject();
            result.put("state", stateName(status));
            result.put("downloadedBytes", Math.max(0, downloadedBytes));
            result.put("totalBytes", totalBytes);
            result.put("reason", reason);
            result.put("localUri", localUri);
            if (status == DownloadManager.STATUS_FAILED) {
                result.put("message", failureMessage(reason));
            }
            call.resolve(result);
        } catch (Exception error) {
            call.reject("No se pudo consultar el progreso: " + safeMessage(error), error);
        }
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        Long id = parseId(call);
        if (id == null || id < 0) {
            call.reject("Identificador de descarga no valido.");
            return;
        }

        // Intentar cancelar descarga directa
        JSObject directState = directDownloadStates.get(id);
        if (directState != null) {
            directState.put("state", "failed");
            directState.put("message", "Descarga cancelada por el usuario.");
            JSObject result = new JSObject();
            result.put("cancelled", true);
            call.resolve(result);
            return;
        }

        try {
            int removed = getDownloadManager().remove(id);
            JSObject result = new JSObject();
            result.put("cancelled", removed > 0);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("No se pudo cancelar la descarga: " + safeMessage(error), error);
        }
    }

    private DownloadManager getDownloadManager() {
        return (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
    }

    private String getFilePathFromUri(Context context, Uri uri) {
        if (uri == null) return null;
        String scheme = uri.getScheme();
        if ("file".equalsIgnoreCase(scheme)) {
            return uri.getPath();
        } else if ("content".equalsIgnoreCase(scheme)) {
            String[] projection = { MediaStore.MediaColumns.DATA };
            try (Cursor cursor = context.getContentResolver().query(uri, projection, null, null, null)) {
                if (cursor != null && cursor.moveToFirst()) {
                    int columnIndex = cursor.getColumnIndex(MediaStore.MediaColumns.DATA);
                    if (columnIndex >= 0) {
                        return cursor.getString(columnIndex);
                    }
                }
            } catch (Exception ignored) {}
        }
        return null;
    }

    private String chooseAvailableFileName(String requestedName, String mimeType) {
        String dirType = (mimeType != null && mimeType.startsWith("video"))
            ? Environment.DIRECTORY_DCIM
            : Environment.DIRECTORY_MUSIC;
        File publicDir = Environment.getExternalStoragePublicDirectory(dirType);
        File mcMusicDir = new File(publicDir, "MC-Music");
        if (!mcMusicDir.exists()) mcMusicDir.mkdirs();

        File requestedFile = new File(mcMusicDir, requestedName);
        if (!requestedFile.exists()) return requestedName;

        int extensionIndex = requestedName.lastIndexOf('.');
        String base = extensionIndex > 0 ? requestedName.substring(0, extensionIndex) : requestedName;
        String extension = extensionIndex > 0 ? requestedName.substring(extensionIndex) : "";
        for (int index = 1; index < 10_000; index++) {
            String candidate = String.format(Locale.ROOT, "%s (%d)%s", base, index, extension);
            if (!new File(mcMusicDir, candidate).exists()) return candidate;
        }
        return System.currentTimeMillis() + "_" + requestedName;
    }

    private String sanitizeFileName(String value) {
        String clean = value == null ? "descarga.bin" : value;
        clean = clean.replaceAll("[\\x00-\\x1f\\x7f/\\\\?%*:|\"<>]", "_")
            .replaceAll("\\s+", " ")
            .replaceAll("[. ]+$", "")
            .trim();
        if (clean.isEmpty()) clean = "descarga.bin";
        return clean.length() > 160 ? clean.substring(0, 160) : clean;
    }

    private int getInt(Cursor cursor, String column, int fallback) {
        int index = cursor.getColumnIndex(column);
        return index >= 0 ? cursor.getInt(index) : fallback;
    }

    private long getLong(Cursor cursor, String column, long fallback) {
        int index = cursor.getColumnIndex(column);
        return index >= 0 ? cursor.getLong(index) : fallback;
    }

    private String getString(Cursor cursor, String column, String fallback) {
        int index = cursor.getColumnIndex(column);
        if (index < 0 || cursor.isNull(index)) return fallback;
        return cursor.getString(index);
    }

    private String stateName(int status) {
        switch (status) {
            case DownloadManager.STATUS_PENDING: return "pending";
            case DownloadManager.STATUS_RUNNING: return "running";
            case DownloadManager.STATUS_PAUSED: return "paused";
            case DownloadManager.STATUS_SUCCESSFUL: return "successful";
            case DownloadManager.STATUS_FAILED: return "failed";
            default: return "unknown";
        }
    }

    private String failureMessage(int reason) {
        switch (reason) {
            case DownloadManager.ERROR_INSUFFICIENT_SPACE:
                return "No hay espacio suficiente en el telefono.";
            case DownloadManager.ERROR_DEVICE_NOT_FOUND:
                return "Android no encontro el almacenamiento de destino.";
            case DownloadManager.ERROR_FILE_ALREADY_EXISTS:
                return "Ya existe un archivo con ese nombre.";
            case DownloadManager.ERROR_HTTP_DATA_ERROR:
            case DownloadManager.ERROR_TOO_MANY_REDIRECTS:
            case DownloadManager.ERROR_UNHANDLED_HTTP_CODE:
                return "El servidor interrumpio la transferencia del archivo.";
            case DownloadManager.ERROR_CANNOT_RESUME:
                return "Android no pudo reanudar la descarga.";
            default:
                if (reason >= 400 && reason <= 599) {
                    return "El servidor rechazo la descarga (HTTP " + reason + ").";
                }
                return "Android no pudo guardar el archivo (codigo " + reason + ").";
        }
    }

    private void scanAndRegisterDownload(long id) {
        if (id < 0) return;
        DownloadManager manager = getDownloadManager();
        DownloadManager.Query query = new DownloadManager.Query().setFilterById(id);
        try (Cursor cursor = manager.query(query)) {
            if (cursor == null || !cursor.moveToFirst()) return;

            int status = getInt(cursor, DownloadManager.COLUMN_STATUS, DownloadManager.STATUS_FAILED);
            if (status != DownloadManager.STATUS_SUCCESSFUL) return;

            long downloadedBytes = getLong(cursor, DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR, 0);
            if (downloadedBytes > 0 && downloadedBytes <= 1024) return;

            String localUri = getString(cursor, DownloadManager.COLUMN_LOCAL_URI, "");
            if (localUri.isEmpty()) return;

            Uri parsedUri = Uri.parse(localUri);
            String path = null;
            
            // 1. Intentar recuperar el nombre real de archivo usando SharedPreferences (solución definitiva)
            String savedFileName = getDownloadMapping(id);
            if (savedFileName != null) {
                String lower = savedFileName.toLowerCase(Locale.ROOT);
                boolean isAudio = lower.endsWith(".mp3") || lower.endsWith(".m4a") || lower.endsWith(".wav") || lower.endsWith(".ogg");
                String dirType = isAudio ? Environment.DIRECTORY_MUSIC : Environment.DIRECTORY_DCIM;
                File dir = new File(Environment.getExternalStoragePublicDirectory(dirType), "MC-Music");
                File file = new File(dir, savedFileName);
                if (file.exists()) {
                    path = file.getAbsolutePath();
                }
            }

            // 2. Si no estaba mapeado o no existe el archivo mapeado, consultar la URI local
            if (path == null) {
                path = getFilePathFromUri(getContext(), parsedUri);
            }

            // 3. Fallback en Android 10+ si la consulta directa retorna null
            if (path == null) {
                String title = getString(cursor, DownloadManager.COLUMN_TITLE, "");
                if (title != null && !title.trim().isEmpty()) {
                    File videoDir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DCIM), "MC-Music");
                    File fallbackVideo = new File(videoDir, title);
                    if (fallbackVideo.exists()) {
                        path = fallbackVideo.getAbsolutePath();
                    } else {
                        File musicDir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MUSIC), "MC-Music");
                        File fallbackMusic = new File(musicDir, title);
                        if (fallbackMusic.exists()) {
                            path = fallbackMusic.getAbsolutePath();
                        }
                    }
                }
            }

            if (path == null) {
                try {
                    int filenameIdx = cursor.getColumnIndex("local_filename");
                    if (filenameIdx >= 0) {
                        String localFilename = cursor.getString(filenameIdx);
                        if (localFilename != null && !localFilename.isEmpty()) {
                            File f = new File(localFilename);
                            if (f.exists()) {
                                path = f.getAbsolutePath();
                            }
                        }
                    }
                } catch (Exception ignored) {}
            }

            if (path == null) {
                try {
                    if ("content".equalsIgnoreCase(parsedUri.getScheme())) {
                        try (Cursor c = getContext().getContentResolver().query(parsedUri, new String[]{MediaStore.MediaColumns.DISPLAY_NAME}, null, null, null)) {
                            if (c != null && c.moveToFirst()) {
                                String displayName = c.getString(0);
                                if (displayName != null && !displayName.isEmpty()) {
                                    String mimeType = getString(cursor, DownloadManager.COLUMN_MEDIA_TYPE, "");
                                    String dirType = (mimeType != null && mimeType.startsWith("video"))
                                        ? Environment.DIRECTORY_MOVIES
                                        : Environment.DIRECTORY_MUSIC;
                                    File dir = new File(Environment.getExternalStoragePublicDirectory(dirType), "MC-Music");
                                    File file = new File(dir, displayName);
                                    if (file.exists()) {
                                        path = file.getAbsolutePath();
                                    }
                                }
                            }
                        }
                    }
                } catch (Exception ignored) {}
            }

            if (path != null) {
                File targetFile = new File(path);
                if (targetFile.exists()) {
                    String mimeType = getContext().getContentResolver().getType(parsedUri);
                    if (mimeType == null || mimeType.isEmpty()) {
                        mimeType = targetFile.getName().endsWith(".mp3") ? "audio/mpeg" : "video/mp4";
                    }

                    ContentValues values = new ContentValues();
                    values.put(MediaStore.MediaColumns.DISPLAY_NAME, targetFile.getName());
                    values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
                    values.put(MediaStore.MediaColumns.SIZE, targetFile.length());

                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        values.put(MediaStore.MediaColumns.IS_PENDING, 0);
                        if (mimeType.startsWith("video")) {
                            values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_MOVIES + "/MC-Music");
                        } else {
                            values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_MUSIC + "/MC-Music");
                        }
                    }

                    Uri collection;
                    if (mimeType.startsWith("video")) {
                        values.put(MediaStore.Video.Media.DATA, targetFile.getAbsolutePath());
                        collection = MediaStore.Video.Media.EXTERNAL_CONTENT_URI;
                    } else if (mimeType.startsWith("audio")) {
                        values.put(MediaStore.Audio.Media.DATA, targetFile.getAbsolutePath());
                        collection = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
                    } else {
                        values.put(MediaStore.Files.FileColumns.DATA, targetFile.getAbsolutePath());
                        collection = MediaStore.Files.getContentUri("external");
                    }

                    try {
                        getContext().getContentResolver().insert(collection, values);
                        removeDownloadMapping(id);
                    } catch (Exception ignored) {}

                    try {
                        MediaScannerConnection.scanFile(
                            getContext(),
                            new String[]{ targetFile.getAbsolutePath() },
                            new String[]{ mimeType },
                            null
                        );
                    } catch (Exception ignored) {}

                    try {
                        Intent mediaScanIntent = new Intent(Intent.ACTION_MEDIA_SCANNER_SCAN_FILE);
                        mediaScanIntent.setData(Uri.fromFile(targetFile));
                        getContext().sendBroadcast(mediaScanIntent);
                    } catch (Exception ignored) {}
                }
            }
        } catch (Exception error) {
            android.util.Log.e("MediaDownloader", "Error registrando descarga: " + error.getMessage(), error);
        }
    }

    private String safeMessage(Exception error) {
        String message = error.getMessage();
        return message == null || message.trim().isEmpty()
            ? error.getClass().getSimpleName()
            : message;
    }
}
