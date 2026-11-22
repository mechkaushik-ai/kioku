plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Release signing comes from environment variables (set by GitHub Actions from
// repository secrets). Without them, only the debug/test APK is built.
val keystorePath: String? = System.getenv("KIOKU_KEYSTORE")
val hasReleaseKey = !keystorePath.isNullOrBlank() && file(keystorePath!!).exists()

android {
    namespace = "com.kioku.kanakanji"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.kioku.kanakanji"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
    }

    signingConfigs {
        if (hasReleaseKey) {
            create("release") {
                storeFile = file(keystorePath!!)
                storePassword = System.getenv("KIOKU_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("KIOKU_KEY_ALIAS")
                keyPassword = System.getenv("KIOKU_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (hasReleaseKey) signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }

    lint {
        checkReleaseBuilds = false
        abortOnError = false
    }
}
