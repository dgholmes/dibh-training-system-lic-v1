package com.thepict.dibhtraining;

import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyInfo;
import android.security.keystore.KeyProperties;
import android.security.keystore.KeyPermanentlyInvalidatedException;
import android.security.keystore.StrongBoxUnavailableException;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.security.KeyStore;
import java.security.UnrecoverableKeyException;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.GCMParameterSpec;

/**
 * MFDS DC-03 — encryption key management.
 *
 * The app encrypts patient PII with a 256-bit AES-GCM data key (the DEK) held by the web
 * layer. That DEK must never sit on disk in the clear. This plugin supplies a key-encryption
 * key (the KEK) that is generated inside the Android Keystore and, on hardware that provides
 * it, never leaves the TEE or StrongBox: the KEK material cannot be read by this app, by a
 * rooted shell, or by anything that copies /data. Only wrap/unwrap operations are possible,
 * and only for this app's own signing identity and package name.
 *
 * The web layer therefore stores nothing but the wrapped DEK, and asks this plugin to unwrap
 * it once at startup.
 *
 * Wrapped blob format: [12-byte GCM IV][ciphertext || 16-byte GCM tag], Base64 (NO_WRAP).
 *
 * Failure policy is deliberately fail-closed. If the KEK is gone or invalidated (app data
 * restored onto different hardware, keystore reset, secure lock screen removed), unwrap
 * reports UNWRAP_FAILED and the caller must surface it. Silently minting a fresh DEK would
 * leave every previously encrypted record permanently unreadable while looking healthy.
 */
@CapacitorPlugin(name = "SecureKey")
public class SecureKeyPlugin extends Plugin {

    private static final String ANDROID_KEYSTORE = "AndroidKeyStore";
    private static final String KEK_ALIAS = "dibh_kek_v1";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int GCM_IV_BYTES = 12;
    private static final int GCM_TAG_BITS = 128;

    /** Reports whether a hardware-backed KEK is available, for audit logging. */
    @PluginMethod
    public void getKeyInfo(PluginCall call) {
        try {
            SecretKey kek = getOrCreateKek();
            JSObject result = new JSObject();
            result.put("available", true);
            result.put("alias", KEK_ALIAS);
            result.put("securityLevel", describeSecurityLevel(kek));
            call.resolve(result);
        } catch (Exception e) {
            JSObject result = new JSObject();
            result.put("available", false);
            result.put("securityLevel", "unavailable");
            result.put("error", String.valueOf(e.getMessage()));
            call.resolve(result);
        }
    }

    /** Wraps raw key bytes (Base64) with the Keystore KEK. */
    @PluginMethod
    public void wrap(PluginCall call) {
        String dataB64 = call.getString("data");
        if (dataB64 == null) {
            call.reject("MISSING_DATA", "wrap() requires a base64 'data' value");
            return;
        }
        try {
            byte[] plaintext = Base64.decode(dataB64, Base64.NO_WRAP);
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKek());

            byte[] iv = cipher.getIV();
            if (iv == null || iv.length != GCM_IV_BYTES) {
                call.reject("WRAP_FAILED", "unexpected GCM IV length");
                return;
            }
            byte[] ciphertext = cipher.doFinal(plaintext);

            byte[] out = new byte[iv.length + ciphertext.length];
            System.arraycopy(iv, 0, out, 0, iv.length);
            System.arraycopy(ciphertext, 0, out, iv.length, ciphertext.length);

            JSObject result = new JSObject();
            result.put("wrapped", Base64.encodeToString(out, Base64.NO_WRAP));
            call.resolve(result);
        } catch (Exception e) {
            call.reject("WRAP_FAILED", String.valueOf(e.getMessage()), e);
        }
    }

    /** Unwraps a blob previously produced by wrap(). */
    @PluginMethod
    public void unwrap(PluginCall call) {
        String wrappedB64 = call.getString("wrapped");
        if (wrappedB64 == null) {
            call.reject("MISSING_DATA", "unwrap() requires a base64 'wrapped' value");
            return;
        }
        try {
            byte[] blob = Base64.decode(wrappedB64, Base64.NO_WRAP);
            if (blob.length <= GCM_IV_BYTES) {
                call.reject("UNWRAP_FAILED", "wrapped blob is too short to contain an IV");
                return;
            }

            SecretKey kek = loadExistingKek();
            if (kek == null) {
                // Creating a new KEK here would silently orphan every encrypted record.
                call.reject("KEK_MISSING", "the Keystore key that wrapped this data no longer exists");
                return;
            }

            byte[] iv = new byte[GCM_IV_BYTES];
            byte[] ciphertext = new byte[blob.length - GCM_IV_BYTES];
            System.arraycopy(blob, 0, iv, 0, GCM_IV_BYTES);
            System.arraycopy(blob, GCM_IV_BYTES, ciphertext, 0, ciphertext.length);

            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, kek, new GCMParameterSpec(GCM_TAG_BITS, iv));
            byte[] plaintext = cipher.doFinal(ciphertext);

            JSObject result = new JSObject();
            result.put("data", Base64.encodeToString(plaintext, Base64.NO_WRAP));
            call.resolve(result);
        } catch (KeyPermanentlyInvalidatedException e) {
            call.reject("KEK_INVALIDATED", "the Keystore key was invalidated by a device security change", e);
        } catch (UnrecoverableKeyException e) {
            call.reject("KEK_MISSING", "the Keystore key could not be loaded", e);
        } catch (Exception e) {
            call.reject("UNWRAP_FAILED", String.valueOf(e.getMessage()), e);
        }
    }

    /** Returns the existing KEK, or null when the alias is absent. Never creates one. */
    private SecretKey loadExistingKek() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(ANDROID_KEYSTORE);
        keyStore.load(null);
        if (!keyStore.containsAlias(KEK_ALIAS)) {
            return null;
        }
        return (SecretKey) keyStore.getKey(KEK_ALIAS, null);
    }

    private SecretKey getOrCreateKek() throws Exception {
        SecretKey existing = loadExistingKek();
        if (existing != null) {
            return existing;
        }
        // StrongBox (a discrete secure element) is preferred but only exists on some devices.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            try {
                return generateKek(true);
            } catch (StrongBoxUnavailableException ignored) {
                // fall through to a TEE-backed key
            }
        }
        return generateKek(false);
    }

    private SecretKey generateKek(boolean useStrongBox) throws Exception {
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE);
        KeyGenParameterSpec.Builder builder = new KeyGenParameterSpec.Builder(
                        KEK_ALIAS,
                        KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                // Forces a fresh IV per wrap; prevents IV reuse under the same key.
                .setRandomizedEncryptionRequired(true);

        // No setUserAuthenticationRequired(): the app must be able to decrypt patient data
        // during a treatment session without a lock-screen prompt on every launch. Access
        // control is enforced by the app's own login (IA-02/IA-05), while the KEK stays
        // non-exportable and bound to this package's signing identity.
        if (useStrongBox && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            builder.setIsStrongBoxBacked(true);
        }
        generator.init(builder.build());
        return generator.generateKey();
    }

    /** "strongbox" | "hardware" | "software" — recorded in the audit log, never a secret. */
    private String describeSecurityLevel(SecretKey key) {
        try {
            SecretKeyFactory factory = SecretKeyFactory.getInstance(key.getAlgorithm(), ANDROID_KEYSTORE);
            KeyInfo info = (KeyInfo) factory.getKeySpec(key, KeyInfo.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                switch (info.getSecurityLevel()) {
                    case KeyProperties.SECURITY_LEVEL_STRONGBOX:
                        return "strongbox";
                    case KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT:
                        return "hardware";
                    case KeyProperties.SECURITY_LEVEL_SOFTWARE:
                    case KeyProperties.SECURITY_LEVEL_UNKNOWN:
                    case KeyProperties.SECURITY_LEVEL_UNKNOWN_SECURE:
                    default:
                        return "software";
                }
            }
            return info.isInsideSecureHardware() ? "hardware" : "software";
        } catch (Exception e) {
            return "unknown";
        }
    }
}
