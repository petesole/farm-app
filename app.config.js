// Existing Farm app configuration is preserved unless explicitly building the sprayer APK.
module.exports=({config})=>process.env.EXPO_PUBLIC_APP_VARIANT==='sprayer'?{
 ...config,name:'JSPL Sprayer',scheme:'jspl-sprayer',userInterfaceStyle:'light',
 android:{...config.android,package:'com.jspl.sprayer'},
 extra:{...config.extra,APP_VARIANT:'sprayer'},
 // Field data sync is manual. App-package updates are installed separately over Wi-Fi.
 updates:{...config.updates,enabled:false},
}:config;
