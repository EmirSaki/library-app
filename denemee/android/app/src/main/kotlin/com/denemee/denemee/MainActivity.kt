package com.denemee.denemee

import android.content.ContentValues
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.core.content.FileProvider
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File
import java.io.FileOutputStream

class MainActivity : FlutterActivity() {

    private val CHANNEL = "library_export_channel"

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL)
            .setMethodCallHandler { call, result ->
                if (call.method == "saveFileToDownloads") {
                    try {
                        val fileName = call.argument<String>("fileName")!!
                        val mimeType = call.argument<String>("mimeType")!!
                        val bytes = call.argument<ByteArray>("bytes")!!

                        val savedPath = saveFile(fileName, mimeType, bytes)
                        result.success(savedPath)

                    } catch (e: Exception) {
                        result.error("ERROR", e.message, null)
                    }
                } else {
                    result.notImplemented()
                }
            }
    }

    private fun saveFile(fileName: String, mimeType: String, bytes: ByteArray): String {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            saveWithMediaStore(fileName, mimeType, bytes)
        } else {
            saveLegacy(fileName, mimeType, bytes)
        }
    }

    private fun saveWithMediaStore(
        fileName: String,
        mimeType: String,
        bytes: ByteArray
    ): String {

        val resolver = applicationContext.contentResolver

        val contentValues = ContentValues().apply {
            put(MediaStore.Downloads.DISPLAY_NAME, fileName)
            put(MediaStore.Downloads.MIME_TYPE, mimeType)
            put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
        }

        val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, contentValues)
            ?: throw Exception("MediaStore insert başarısız")

        resolver.openOutputStream(uri)?.use {
            it.write(bytes)
            it.flush()
        } ?: throw Exception("Dosya yazılamadı")

        openFile(uri, mimeType)

        return uri.toString()
    }

    private fun saveLegacy(
        fileName: String,
        mimeType: String,
        bytes: ByteArray
    ): String {

        val file = File(
            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
            fileName
        )

        FileOutputStream(file).use {
            it.write(bytes)
            it.flush()
        }

        val uri = FileProvider.getUriForFile(
            this,
            "${applicationContext.packageName}.fileprovider",
            file
        )

        openFile(uri, mimeType)

        return file.absolutePath
    }

    private fun openFile(uri: Uri, mimeType: String) {
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, mimeType)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }

        startActivity(Intent.createChooser(intent, "Dosyayı aç"))
    }
}
