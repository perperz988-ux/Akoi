plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.akoi.launcher"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.zper.os"
        minSdk = 26
        targetSdk = 34
        // En GitHub Actions la versión sube sola en cada compilación,
        // así Android deja instalar el APK nuevo encima del anterior.
        val run = (System.getenv("GITHUB_RUN_NUMBER") ?: "0").toInt()
        versionCode = 100 + run
        versionName = "2.$run"
    }

    // Llave fija (no secreta, solo para pruebas): todas las compilaciones se firman igual
    // y se pueden instalar como actualización sin desinstalar.
    signingConfigs {
        getByName("debug") {
            storeFile = rootProject.file("zperos-debug.keystore")
            storePassword = "zperos123"
            keyAlias = "zperos"
            keyPassword = "zperos123"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-ktx:1.9.2")
    implementation("androidx.recyclerview:recyclerview:1.3.2")
    implementation("androidx.dynamicanimation:dynamicanimation:1.0.0")
}
