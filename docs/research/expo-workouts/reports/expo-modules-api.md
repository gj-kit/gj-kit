# Expo Modules API (SDK 56/57): building, packaging, config plugin and autolinking for a native HealthKit / Health Connect module

Research date: 2026-08-22. Every version-specific claim below was checked against a live source (npm registry JSON, tarballs unpacked into the scratchpad, `docs.expo.dev/*.md`, Apple/Android doc endpoints, Google Maven AARs). Where the live source contradicted training memory, the live source wins and the contradiction is called out.

Local evidence paths used (scratchpad): `pk/expo-modules-core-57.0.12`, `pk/expo-modules-autolinking-57.0.10`, `pk/expo-config-plugins-57.0.8`, `pk/expo-template-bare-minimum-{56.0.34,57.0.17}`, `pk/emt` (= `expo-module-template@57.0.8`), `pk/emt56` (= `expo-module-template@56.0.18`), `pk/expo-module-scripts-56.0.3`, `hc/cc-*.aar`, and the monorepo's own `node_modules/.pnpm/expo-modules-core@56.0.24`.

---

## 1. Facts

### 1.1 Versions and toolchain floors

1. npm dist-tags on 2026-08-22: `expo@57.0.15` (latest; `sdk-56` → 56.0.20), `expo-modules-core@57.0.12` (`sdk-56` → 56.0.24), `expo-modules-autolinking@57.0.10`, `@expo/config-plugins@57.0.8`, `create-expo-module@57.0.1`, `expo-module-template@57.0.8` (`sdk-56` → 56.0.18), `expo-module-scripts@56.0.3` (latest; published 2026-05-29, **no 57 line exists**), `react-native@0.87.0` (latest). [source-code] https://registry.npmjs.org/expo , …/expo-modules-core , …/expo-module-scripts , …/expo-module-template
2. SDK 57 (changelog dated JUN 30, 2026): "a small, focused release: it brings React Native 0.86 to Expo"; "The React version is unchanged from SDK 56 — both SDK 56 and SDK 57 use React 19.2"; "expo@57.0.9 updates React Native to 0.86.2, resolving the Hermes V1 memory regression". Bare template 57.0.17 pins `react-native: 0.86.2`, `expo: ~57.0.15`. [official-doc] https://expo.dev/changelog/sdk-57 ; [source-code] `expo-template-bare-minimum@57.0.17/package.json`
3. SDK 56 (changelog MAY 21, 2026): "Minimum Xcode bumped to 26.4. Minimum iOS / tvOS bumped to 16.4, macOS to 13.4. Up from iOS 15.1"; "Xcode 26.4 is required to compile a native iOS project"; "iOS deployment target bump: if you have any Expo modules of your own, update the iOS deployment target to 16.4 in your podspec"; "TypeScript bumped to 6.0.3". **This contradicts older memory (iOS 15.1 / Xcode 16.x); the live page wins.** SDK 57's changelog announces no further bump and `ExpoModulesCore.podspec` is identical in 56.0.24 and 57.0.12: `:ios => '16.4', :osx => '13.4', :tvos => '16.4'`, `s.swift_version = '6.0'`. [official-doc] https://expo.dev/changelog/sdk-56 ; [source-code] `ExpoModulesCore.podspec` (56.0.24, 57.0.12)
4. Prebuild template (both SDK 56.0.34 and 57.0.17): `IPHONEOS_DEPLOYMENT_TARGET = 16.4`; Podfile `platform :ios, podfile_properties['ios.deploymentTarget'] || '16.4'` and `use_expo_modules!`; `gradle.properties` `newArchEnabled=true`, `hermesEnabled=true`; Gradle wrapper 9.3.1 (57). [source-code] `expo-template-bare-minimum@{56.0.34,57.0.17}/android/gradle.properties`, `ios/Podfile`, `ios/HelloWorld.xcodeproj/project.pbxproj`
5. Android SDK levels are **not hard-coded by Expo**; `settings.gradle` calls `expoAutolinking.useExpoVersionCatalog()`, which loads `react-native/gradle/libs.versions.toml` into an `expoLibs` catalog and overlays these gradle.properties keys: `android.buildToolsVersion→buildTools`, `android.minSdkVersion→minSdk`, `android.compileSdkVersion→compileSdk`, `android.targetSdkVersion→targetSdk`, `android.kotlinVersion→kotlin`. `ExpoRootProjectPlugin.defineDefaultProperties` then sets `rootProject.ext.{minSdkVersion,compileSdkVersion,targetSdkVersion,buildToolsVersion,ndkVersion,kotlinVersion,kspVersion}` from the catalog (hard fallbacks 24/35/35/35.0.0/27.1.12297006/2.0.21 are only used when the catalog lacks the key). The app's `android/app/build.gradle` reads `rootProject.ext.minSdkVersion` etc. [source-code] `expo-modules-autolinking@57.0.10/android/expo-gradle-plugin/expo-autolinking-settings-plugin/.../ExpoAutolinkingSettingsExtension.kt` L113-135; `.../expo-autolinking-plugin/.../ExpoRootProjectPlugin.kt` L50-60; template `android/settings.gradle`, `android/app/build.gradle` L88-94
6. React Native's catalog is identical for RN 0.85.3 (SDK 56) and RN 0.86.2 (SDK 57): `minSdk = "24"`, `targetSdk = "36"`, `compileSdk = "36"`, `buildTools = "36.0.0"`, `ndkVersion = "27.1.12297006"`, `agp = "8.12.0"`, `kotlin = "2.1.20"`. So effective defaults for SDK 56 and 57 consumers: **minSdk 24, compileSdk 36, targetSdk 36, AGP 8.12.0, Kotlin 2.1.20.** [source-code] local `react-native@0.85.3/gradle/libs.versions.toml`; https://raw.githubusercontent.com/facebook/react-native/v0.86.2/packages/react-native/gradle/libs.versions.toml
7. Library Gradle side: applying `id 'expo-module-gradle-plugin'` (shipped inside `expo-modules-core/expo-module-gradle-plugin`) auto-applies `com.android.library`, `kotlin-android`, `maven-publish` and the `io.github.lukmccall.pika` Kotlin compiler plugin; adds `compileOnly project(':expo-modules-core')`, `kotlin-stdlib-jdk7:$kotlinVersion`; and `applyDefaultAndroidSdkVersions()` sets the library's `compileSdk/minSdk/targetSdk` from `rootProject.ext` (fallbacks 36/24/36). KSP is looked up from Kotlin (`"2.1.20" to "2.1.20-2.0.1"`, …, `"2.2.21"`); Kotlin below the table minimum throws "Kotlin X is not supported by Expo modules". `expoModule { enableCompileTimeOptimization }` toggles Pika. [source-code] `expo-modules-core@57.0.12/expo-module-gradle-plugin/src/main/kotlin/expo/modules/plugin/{ExpoModulesGradlePlugin,ProjectConfiguration}.kt`; `expo-modules-autolinking@57.0.10/.../KSPLookup.kt`
8. SDK 56 changelog: "Kotlin compiler plugin — A new Kotlin compiler plugin replaces reflection with build-time code generation for Expo Modules on Android … roughly 40% faster cold starts … no app-side changes required." [official-doc] https://expo.dev/changelog/sdk-56

### 1.2 create-expo-module layout (what you actually get in 2026)

9. `create-expo-module@57.0.1` renders the npm package `expo-module-template@57.0.8` (EJS). Generated files: `expo-module.config.json`, `ios/<Name>.podspec`, `ios/<Name>Module.swift`, `android/build.gradle`, `android/src/main/AndroidManifest.xml` (just `<manifest>\n</manifest>`), `android/src/main/java/<pkg>/<Name>Module.kt`, `src/index.ts`, `src/<Name>Module.ts`, `src/<Name>Module.web.ts`, `src/<Name>.types.ts`, `tsconfig.json`, `.npmignore`, `.gitignore`, `eslint.config.cjs`, `internal/module_scripts/{build,clean,prepare,test,open-ios,open-android,util}.js`, `example/`. **The template no longer depends on `expo-module-scripts`**: `"build": "node internal/module_scripts/build.js"` (runs `tsc`, adds `--watch` on a TTY), `"prepare": "node internal/module_scripts/prepare.js"` (rm `build/`, `tsc`, then for each of `plugin|cli|utils|scripts` that has a `tsconfig.json`: `tsc --build <dir>`), `"test": "node internal/module_scripts/test.js"` (`jest`; `test plugin` → `--rootDir plugin`). SDK-56 (56.0.18) and SDK-57 (57.0.8) templates are byte-identical for `ios/*.podspec`, `android/build.gradle` and the scripts. [source-code] `pk/emt/package/$package.json`, `internal/module_scripts/*.js`; `pk/emt56`
10. Template `package.json`: `"main": "build/index.js"`, `"types": "build/index.d.ts"`, `peerDependencies: { expo: "*", react: "*", react-native: "*" }`, `dependencies: {}`, devDeps `expo ^57.0.15`, `typescript ^5.9.2`, `jest-expo ~55.0.9`, `babel-preset-expo ~55.0.8`, `react-native 0.82.1` (the devDeps are visibly stale relative to SDK 57; they only matter for the module's own jest). `tsconfig.json`: `rootDir ./src`, `outDir ./build`, `module esnext`, `moduleResolution bundler`, `jsx react-native`, `strict`, `declaration`. [source-code] `pk/emt/package/$package.json`, `tsconfig.json`
11. Template `.npmignore` (exclude-list packaging): `/.*/`, `/*.tgz`, `__mocks__`, `__tests__`, `/babel.config.js`, `/internal/module_scripts/`, `/android/src/androidTest/`, `/android/src/test/`, `/android/build/`, `/example/`. expo-module-scripts README: "Expo modules use `.npmignore` instead of the `files` field in the package.json … Test which files get packaged by running `npm pack`." [source-code] `pk/emt/package/$.npmignore`; https://raw.githubusercontent.com/expo/expo/main/packages/expo-module-scripts/README.md
12. npm `files` semantics: "You can also provide a `.npmignore` file in the root of your package or in subdirectories … At the root of your package it will not override the "files" field, but in subdirectories it will." `.gitignore` is used when `.npmignore` is missing; `package.json`, README, LICENSE and `main` are always included. [official-doc] https://docs.npmjs.com/cli/v11/configuring-npm/package-json
13. Template podspec (remote type): `s.platforms = { :ios => '16.4', :tvos => '16.4' }`, `s.swift_version = '5.9'`, `s.static_framework = true`, `s.dependency 'ExpoModulesCore'`, `s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }`, `s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"`, version/summary/author read from `../package.json`. No `install_modules_dependencies` call (that helper is absent from the 57 tarballs). [source-code] `pk/emt/package/ios/{%- project.name %}.podspec`
14. Template `android/build.gradle`: `plugins { id 'com.android.library'; id 'expo-module-gradle-plugin' }`, `group = '<pkg>'`, `version = '<pkg version>'`, `android { namespace "<pkg>"; defaultConfig { versionCode 1; versionName "…" }; lintOptions { abortOnError false } }` — no SDK levels and no dependencies block (the plugin supplies them). [source-code] `pk/emt/package/android/build.gradle`
15. `expo-module.config.json` keys (autolinking 57 types): `platforms` (`android`, `apple` or granular `ios`/`macos`/`tvos`, `web`, `devtools`); `apple.modules` (Swift class names), `apple.appDelegateSubscribers`, `apple.reactDelegateHandlers`, `apple.podspecPath`, `apple.swiftModuleName`, `apple.debugOnly`; `ios` is a deprecated alias used as fallback for `apple`; `android.modules` (fully-qualified Kotlin class names) plus gradle-plugin/publication keys; `coreFeatures`; `devtools`. Autolinking "searches only for packages that contain … expo-module.config.json at the root directory, next to the package.json … if the platform … is not present in [`platforms`], it's just skipped". [source-code] `expo-modules-autolinking@57.0.10/build/types.d.ts` L146-265, `build/ExpoModuleConfig.js` L67-87; [official-doc] https://docs.expo.dev/modules/module-config/ , https://docs.expo.dev/modules/autolinking/
16. Expo's guidance for libraries: peer `"expo": "*"` (optional) "so as not to cause any duplicated packages"; `expo-modules-core` only as a devDependency — "it's already provided in the projects depending on your library by the `expo` package with the version of core that is compatible with the specific SDK used in the project." Gradle: `implementation project(':expo-modules-core')`; podspec: `s.dependency 'ExpoModulesCore'`. [official-doc] https://docs.expo.dev/modules/existing-library/

### 1.3 Swift DSL

17. Skeleton: `public class XModule: Module { public func definition() -> ModuleDefinition { Name("X") … } }`. Components: `Constant("PI") { Double.pi }` (`Constants` is deprecated), `Function`, `AsyncFunction` (≤ 8 args), `Property("p").get{}.set{}`, `Events("onA","onB")`, `sendEvent("onA", ["k": v])`, `OnCreate`, `OnDestroy`, `OnAppContextDestroys`, `OnAppEntersForeground/Background`, `OnAppBecomesActive`; `AsyncFunction(...).runOnQueue(.main)`. [official-doc] https://docs.expo.dev/modules/module-api/
18. Native async/await is supported by separate factories: `public func AsyncFunction<R>(_ name: String, _ closure: sending @escaping @Sendable () async throws -> sending R) -> ConcurrentFunctionDefinition<(), Void, R>` and `AsyncFunction<R, A0: AnyArgument, each A: AnyArgument>(_ name:, _ closure: @Sendable (A0, repeat each A) async throws -> sending R)`. The closure must spell `async throws` to pick this overload; shipped example: `AsyncFunction("getTitle") { (album: Album) async throws in … }` (expo-media-library 56). The closure is `@Sendable`, so captured state must be concurrency-safe (warnings only in Swift 5 mode). [source-code] `expo-modules-core@57.0.12/ios/Api/Factories/ConcurrentFunctionFactories.swift`, `ios/Core/Functions/ConcurrentFunctionDefinition.swift`; `expo-media-library@56.0.11/ios/next/MediaLibraryNextModule.swift` L212
19. Errors: `open class Exception: CodedError, ChainableException …` with `open var reason: String`, `open var code: String { customCode ?? errorCodeFromString(name) }`, `name` defaults to the class name. `errorCodeFromString` strips a trailing `Error|Exception` (and generic suffix), inserts `_` between camel-case words, uppercases and prefixes `ERR_` → `final class HealthUnavailableException: Exception` ⇒ `ERR_HEALTH_UNAVAILABLE`. Explicit codes: `Exception(name:description:code:)`; `GenericException<Param>` carries a typed param; `Promise.reject(_ code: String, _ description: String)` and `Promise.reject(_ error: Exception)`. Built-ins in `Exceptions`: `AppContextLost`, `RuntimeLost`, `AppContextNotFound`, `SimulatorNotSupported`, `PermissionsModuleNotFound`, `FileSystemModuleNotFound`. Non-`Exception` Swift errors become `UnexpectedException`. [source-code] `ios/Core/Exceptions/{Exception,CodedError,GenericException,CommonExceptions}.swift`, `ios/Core/Promise.swift`
20. Records / enums: `struct ReadOptions: Record { @Field var from: Date? ; @Field var limit: Int = 100 }`; `enum ActivityKind: String, Enumerable { case running, hiking, walking }`; `ValueOrUndefined<T>` distinguishes `undefined` from `null`. `Record` is both an argument and a return type (`Record: Convertible, JavaScriptDecodable, JavaScriptEncodable`). [official-doc] module-api; [source-code] `ios/Core/Records/Record.swift`, `ios/Core/Arguments/Enumerable.swift`
21. Swift language mode: core compiles with `swift_version '6.0'`, but the template module podspec sets `'5.9'`, and neither core nor autolinking injects `SWIFT_STRICT_CONCURRENCY`/`OTHER_SWIFT_FLAGS` into module pods → a module built from the template runs in Swift 5 mode with minimal strict-concurrency checking. [source-code] `ExpoModulesCore.podspec` L58, L88-89; `pk/emt/package/ios/*.podspec`; grep of 57 tarballs (no hits)

### 1.4 Kotlin DSL

22. Skeleton: `class XModule : Module() { override fun definition() = ModuleDefinition { Name("X") … } }`. Suspend bodies use the infix marker: `AsyncFunction("read") Coroutine { opts: ReadOptions -> … }` (`inline infix fun AsyncFunctionBuilder.Coroutine(block: suspend (P0…P7) -> R)`); docs: "`AsyncFunction` with a suspendable body can't receive `Promise` as an argument … immediately resolved with the returned value … or rejected if it throws". Promise style: `AsyncFunction("f") { a: A, promise: Promise -> promise.resolve(x) }`. Scopes on `appContext`: `mainQueue` (Dispatchers.Main), `backgroundCoroutineScope` (Dispatchers.IO), `modulesQueue`. [source-code] `android/src/main/java/expo/modules/kotlin/functions/AsyncFunctionBuilder.kt` L260-268, `objects/ObjectDefinitionBuilder.kt` L221-438, `AppContext.kt`; [official-doc] module-api
23. Errors: `open class CodedException(message, cause)`; `val code get() = providedCode ?: inferCode(javaClass)`; `inferCode` removes the `Exception` suffix, snake-cases, uppercases, prefixes `ERR_` ("`ModuleNotFoundException` becomes `ERR_MODULE_NOT_FOUND`"); `constructor(code: String?, message: String?, cause: Throwable?)` for explicit codes; `errorCodeOf<T>()`; `Throwable.toCodedException()` wraps anything else as `UnexpectedException`. Built-ins: `Exceptions.MissingActivity` ("The current activity is no longer available"), `Exceptions.MissingPermissions(vararg String)`, `AppContextLost`, `ReactContextLost`, `PermissionsModuleNotFound`. [source-code] `android/src/main/java/expo/modules/kotlin/exception/{CodedException,CommonExceptions}.kt`
24. Records / enums: `class ReadOptions : Record { @Field val limit: Int = 100 }` (`expo.modules.kotlin.records.Record`, `@Field(key = "")`), `enum class ActivityKind(val value: String) : Enumerable` (`expo.modules.kotlin.types.Enumerable`). [source-code] `records/Record.kt`, `records/Field.kt`, `types/Enumerable.kt`
25. Activity access: `appContext.currentActivity: Activity?` (= `activityProvider?.currentActivity ?: (reactContext as? ReactApplicationContext)?.currentActivity`), `appContext.throwingActivity` (throws `Exceptions.MissingActivity()`), `appContext.reactContext: Context?`, `appContext.permissions`. [source-code] `AppContext.kt`
26. Activity results, modern path: DSL `fun RegisterActivityContracts(body: suspend AppContextActivityResultCaller.() -> Unit)` — KDoc: "It's run after `OnCreate` block" (`ModuleHolder.registerContracts()` invoked by `ModuleRegistry`). Inside it: `suspend fun <I : Serializable, O> registerForActivityResult(contract: AppContextActivityResultContract<I, O>, fallbackCallback = NOOP): AppContextActivityResultLauncher<I, O>`. `AppContextActivityResultContract<I, O>` = `createIntent(context: Context, input: I): Intent` + `parseResult(input: I, resultCode: Int, intent: Intent?): O` ("differs from the original in terms of providing `input` parameter in the `parseResult`"). The launcher exposes `abstract fun launch(input: I, callback: ActivityResultCallback<O>)` and `suspend fun launch(input: I): O` (`suspendCancellableCoroutine`, resumes only if still active). The registry dispatches via `ActivityCompat.startActivityForResult` and persists launched inputs with `DataPersistor` (hence `I : Serializable`). KDoc on the default caller: "For the time being `fallbackCallback` is not working. There are some problems with saving and restoring the state … connected with Activity's lifecycle and AppContext lifespan." Docs present this as "the modern replacement for `startActivityForResult`". [source-code] `modules/ModuleDefinitionBuilder.kt` L112-117, `activityresult/{AppContextActivityResultCaller,AppContextActivityResultContract,AppContextActivityResultLauncher,AppContextActivityResultRegistry}.kt`, `ModuleHolder.kt` L126; [official-doc] module-api (RegisterActivityContracts)
27. Activity results, legacy path: `OnActivityResult { activity, payload -> payload.requestCode / payload.resultCode / payload.data }` paired with `activity.startActivityForResult(intent, code)`; also `OnNewIntent`, `OnActivityEntersForeground/Background`, `OnActivityDestroys`, `OnUserLeavesActivity`. [official-doc] module-api
28. Reference implementation (expo-image-picker 56): `private lateinit var cameraLauncher: AppContextActivityResultLauncher<CameraContractOptions, ImagePickerContractResult>`; `RegisterActivityContracts { cameraLauncher = registerForActivityResult(CameraContract(this@ImagePickerModule)) { input, result -> handleResultUponActivityDestruction(result, input.options) } }`; async function does `cameraLauncher.launch(contractOptions)`; `internal data class CameraContractOptions(val uri: String, val options: ImagePickerOptions) : Serializable`. [source-code] `expo-image-picker@56.0.24/android/.../ImagePickerModule.kt` L79-123, `contracts/CameraContract.kt`
29. Health Connect permission contract: `PermissionController.createRequestPermissionResultContract()` is an androidx `ActivityResultContract<Set<String>, Set<String>>` used via `registerForActivityResult` in Google's sample; react-native-health-connect wraps it with `ComponentActivity.registerForActivityResult` plus a coroutine `Channel`. [official-doc] https://developer.android.com/health-and-fitness/guides/health-connect/develop/get-started ; [source-code] https://raw.githubusercontent.com/matinzd/react-native-health-connect/main/android/src/main/java/dev/matinzd/healthconnect/permissions/HealthConnectPermissionDelegate.kt

### 1.5 JS side

30. `requireNativeModule<T>(name): T` throws `Cannot find native module '<name>'`; `requireOptionalNativeModule<T>(name): T | null` "returns `null` when the module cannot be found instead of throwing" (checks `globalThis.expo?.modules?.[name]`, then `NativeModulesProxy`, then `TurboModuleRegistry`). Both are re-exported from `expo` alongside `NativeModule`, `EventEmitter`, `SharedObject`, `registerWebModule`. [source-code] `expo-modules-core@56.0.24/src/requireNativeModule.ts`; `expo@57.0.15/src/Expo.ts` L10-19; [official-doc] https://docs.expo.dev/versions/latest/sdk/expo/
31. `declare class NativeModule<TEventsMap extends EventsMap = Record<never, never>> extends EventEmitter<TEventsMap>`; `EventEmitter.addListener(eventName, listener): EventSubscription` (`{ remove(): void }`), `removeListener`, `removeAllListeners`, `emit`, `listenerCount`, optional `startObserving/stopObserving`. Template wrapper: `declare class XModule extends NativeModule<XEvents> { fn(): Promise<…> }; export default requireNativeModule<XModule>('X');` and for web `export default registerWebModule(class XModule extends NativeModule<XEvents> {}, 'XModule')`. [source-code] `src/ts-declarations/{EventEmitter,NativeModule}.ts`; `pk/emt/package/src/*.ts`

### 1.6 Autolinking mechanics

32. Discovery order: (1) `react-native.config.js` dependencies with an explicit `root`; (2) `searchPaths`; (3) `nativeModulesDir` (default `./modules`); (4) "resolves the dependencies of your app and any dependency or peer dependency recursively. This matches the Node.js resolution algorithm". Source: traversal uses `Module._nodeModulePaths(packagePath)`, realpaths every `node_modules` dir and every candidate (`maybeRealpath`), includes `dependencies`, top-level `devDependencies`, and non-optional `peerDependencies` (optional peers are skipped), `MAX_DEPTH = 9`; duplicates are recorded when the same name resolves to different real paths. Before SDK 54 `searchPaths` defaulted to the app's `node_modules` directories. [source-code] `expo-modules-autolinking@57.0.10/build/dependencies/{resolution,scanning}.js`; [official-doc] https://docs.expo.dev/modules/autolinking/
33. App-side config (`package.json` → `expo.autolinking`): `searchPaths`, `nativeModulesDir`, `exclude`, `buildFromSource`/verification extras; `experiments.autolinkingModuleResolution` "will force dependencies that Metro resolves to match the native modules that autolinking resolves" (opt-in SDK 54, default for monorepo apps from SDK 55). CLI: `npx expo-modules-autolinking search | resolve --platform <apple|android> | verify | react-native-config`. [official-doc] autolinking.md
34. pnpm / symlink handling in source: for Android, when the realpath contains `.pnpm` **and** `=` (patched deps), autolinking uses the symlink path instead (Prefab cannot escape `=`; google/prefab#187); Gradle `includeBuild` plugin dirs are always realpath'd (IDEA-329756). Docs: "Expo Autolinking comes with built-in support for monorepos, package manager workspaces, transitive dependencies, and isolated dependencies installations." Monorepo guide: isolated installs supported from SDK 54 but "some React Native libraries may cause build or resolution errors"; fallback is `nodeLinker: hoisted` in `pnpm-workspace.yaml`. [source-code] `build/autolinking/findModules.js` L12-17, `build/platforms/android/android.js` L36-41; [official-doc] https://docs.expo.dev/guides/monorepos/
35. `file:` tarball in a pnpm consumer: pnpm extracts the tarball into the virtual store and symlinks `node_modules/<name>` to it; autolinking realpaths that symlink like any other dependency (no `=` in such paths unless the dep is also patched). Not exercised in this research — needs a hands-on test (see §5). [source-code inference from fact 32/34]

### 1.7 Config plugins

36. Plugin resolution: for a package import, `app.plugin.js` in the package root wins; otherwise the package `main`; deep imports are "not recommended". "The `app.plugin.js` approach is preferred … as it allows different transpilation settings from the main package code" (Node needs CJS). Standard TS layout: `plugin/src/index.ts`, `plugin/tsconfig.json` (`"outDir": "build"`), `app.plugin.js` = `module.exports = require('./plugin/build');`. The template's `prepare.js` builds `plugin/` automatically when `plugin/tsconfig.json` exists. [official-doc] https://docs.expo.dev/config-plugins/mods/ , https://docs.expo.dev/modules/config-plugin-and-native-module-tutorial/ ; [source-code] `pk/emt/package/internal/module_scripts/prepare.js`
37. Mods exported by `@expo/config-plugins@57.0.8` (re-exported from `expo/config-plugins`): `withInfoPlist: ConfigPlugin<Mod<InfoPlist>>`, `withEntitlementsPlist: ConfigPlugin<Mod<JSONObject>>`, `withPodfileProperties`, `withXcodeProject`, `withAppDelegate`, `withPodfile`; `withAndroidManifest: ConfigPlugin<Mod<Manifest.AndroidManifest>>` (xml2js JSON), `withGradleProperties: ConfigPlugin<Mod<Properties.PropertiesItem[]>>`, `withAppBuildGradle`, `withProjectBuildGradle`, `withSettingsGradle`, `withMainActivity`, `withMainApplication`, `withStringsXml`; plus `withDangerousMod`, `withPlugins`, `createRunOncePlugin(plugin, name, version?)`. Manifest typing: `manifest.queries: ManifestQuery[]` (`package[]`, `intent[]`, `provider[]`), `manifest['uses-permission']`, `application['activity-alias']: ManifestActivityAlias[]`, `application.activity`, `application['meta-data']`; helpers `AndroidConfig.Manifest.getMainApplicationOrThrow`, `addMetaDataItemToMainApplication`, `ensureToolsAvailable`, `AndroidConfig.Permissions.addPermission/ensurePermissions`. [source-code] `@expo/config-plugins@57.0.8/build/index.d.ts`, `build/plugins/{ios-plugins,android-plugins,withRunOnce}.d.ts`, `build/android/{Manifest,Permissions}.d.ts`
38. Test oracle: `npx expo prebuild --clean` regenerates `ios/`+`android/`; `npx expo config --type introspect` lets you "read the evaluated results of modifiers without generating any code" (works for static mods — Info.plist, entitlements, AndroidManifest, gradle.properties — not for dangerous mods); `npx expo config --type prebuild` shows `_internal.pluginHistory`; `EXPO_DEBUG=1 expo prebuild` prints the plugin stack; `EXPO_CONFIG_PLUGIN_VERBOSE_ERRORS=1` for authors. "Introspection is used by `eas-cli` to determine what the final iOS entitlements will be in a CNG project, so it can sync them with the Apple Developer Portal." [official-doc] https://docs.expo.dev/config-plugins/development-and-debugging/
39. Expo's manifest-merging advice: "Packages should attempt to use the built-in AndroidManifest.xml merging system before using a config plugin. This can be used for static, non-optional features like permissions … The drawback is that users cannot use introspection to preview the changes." [official-doc] same page
40. SDK 56: "Every Expo package that ships a config plugin now exports it with full TypeScript types. Import the plugin from `expo-<name>/plugin` into your `app.config.ts`"; "config plugins are now loaded with the same module loader that configs themselves use" (local `.ts`, `.mjs`, `.cjs` plugins). [official-doc] https://expo.dev/changelog/sdk-56
41. `expo-build-properties` writes `android.minSdkVersion`, `android.compileSdkVersion`, `android.targetSdkVersion`, `android.kotlinVersion`, `android.buildToolsVersion`, … into `android/gradle.properties` (`createBuildGradlePropsConfigPlugin`), and `ios.deploymentTarget` into `Podfile.properties.json`; via fact 5 these flow into `rootProject.ext` and therefore into every Expo library's `minSdk` too. [source-code] https://raw.githubusercontent.com/expo/expo/main/packages/expo-build-properties/src/android.ts L31-51; [official-doc] https://docs.expo.dev/versions/latest/sdk/build-properties/

### 1.8 Platform requirements relevant to the plugin

42. HealthKit: entitlement `com.apple.developer.healthkit` (Boolean; iOS 8+, "To add this entitlement to your app, enable the HealthKit capability in Xcode"); `com.apple.developer.healthkit.access` (array, only for FHIR clinical records — "App Review may reject apps that don't use the data appropriately"); Info.plist `NSHealthShareUsageDescription` ("required if your app uses APIs that access the someone's health data") and `NSHealthUpdateUsageDescription` ("required if your app uses APIs that update the user's health data"). [official-doc] https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.healthkit , …/com.apple.developer.healthkit.access , …/information-property-list/nshealthshareusagedescription , …/nshealthupdateusagedescription
43. EAS Build "automatically synchronizes capabilities on the Apple Developer Console with your local entitlements configuration when you run `eas build`"; HealthKit (`com.apple.developer.healthkit`) is in the supported list; entitlements are "read from the introspected app config"; opt out with `EXPO_NO_CAPABILITY_SYNC=1`. [official-doc] https://docs.expo.dev/build-reference/ios-capabilities/
44. Privacy manifest: "include a privacy manifest file in your third-party SDK if it's listed in 'SDKs that require a privacy manifest and signature' … Otherwise, include a privacy manifest file in your third-party SDK if it uses a required reasons API, collects data about the person using apps that include the third-party SDK, enables the app to collect data about people using the app, or contacts tracking domains." Static libraries bundle it as a resource; Expo packages do `s.resource_bundles = { 'ExpoConstants_privacy' => ['PrivacyInfo.xcprivacy'] }`. Since May 1 2024 apps using required-reason APIs without reasons are rejected. HealthKit reads are not in the required-reason API categories (file timestamp, system boot time, disk space, active keyboards, user defaults). [official-doc] https://developer.apple.com/documentation/bundleresources/privacy-manifest-files , https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api ; [source-code] `expo-constants@56/ios/EXConstants.podspec` L52-55; category list [secondary]
45. Health Connect manifest contract: `<queries><package android:name="com.google.android.apps.healthdata" /></queries>`; `<uses-permission android:name="android.permission.health.READ_…"/>`; rationale `<activity … android:exported="true"><intent-filter><action android:name="androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE" /></intent-filter></activity>` (Android 13-); and for Android 14+: `<activity-alias android:name="ViewPermissionUsageActivity" android:exported="true" android:targetActivity=".PermissionsRationaleActivity" android:permission="android.permission.START_VIEW_PERMISSION_USAGE"><intent-filter><action android:name="android.intent.action.VIEW_PERMISSION_USAGE" /><category android:name="android.intent.category.HEALTH_PERMISSIONS" /></intent-filter></activity-alias>`. "The Health Connect SDK supports Android 8 (API level 26) or higher, while the Health Connect app is only compatible with Android 9 (API level 28) or higher." "Your app's privacy policy in the manifest must match the policy provided in the Google Play Console." [official-doc] https://developer.android.com/health-and-fitness/guides/health-connect/develop/get-started
46. Health Connect client artifacts, verified from Google Maven: `androidx.health.connect:connect-client:1.1.0` (stable, Oct 8 2025) — AAR manifest `<uses-sdk android:minSdkVersion="26" />`, `aar-metadata` `minCompileSdk=36`, `minAndroidGradlePluginVersion=8.9.1`. `1.2.0-alpha05` (Aug 12 2026; release note says "The minimum SDK requirement for this library is now API 24 (minSdk 24)") — **the shipped AAR still declares `minSdkVersion="26"`** and `minCompileSdk=37`, `minAndroidGradlePluginVersion=9.1.0` (same for alpha04). With SDK 56/57 defaults (compileSdk 36, AGP 8.12.0) the 1.2.0-alpha line cannot be consumed; 1.1.0 is the usable version. The release-note claim is contradicted by the artifact; artifact wins. [source-code] https://dl.google.com/android/maven2/androidx/health/connect/connect-client/{1.1.0,1.2.0-alpha04,1.2.0-alpha05}/connect-client-*.aar (`AndroidManifest.xml`, `META-INF/com/android/build/gradle/aar-metadata.properties`); [official-doc] https://developer.android.com/jetpack/androidx/releases/health-connect
47. Manifest merger rule: "By default, when importing a library with a `minSdk` value that's higher than the main manifest file, an error occurs and the library cannot be imported." Workaround: `<uses-sdk tools:overrideLibrary="com.example.lib1, com.example.lib2"/>` in the app manifest (package names of the libraries), keeping the app's lower minSdk; "Build configurations from the build.gradle file override any corresponding attributes in the merged manifest file." [official-doc] https://developer.android.com/build/manage-manifests

### 1.9 Expo Go, dev client, tests, Metro

48. "If you are using Expo Go, you can only access native libraries that are included in the Expo SDK, or libraries that do not include any custom native code." Expo Go for SDK 56 "is not available on the Apple App Store or Google Play Store"; SDK 57 Expo Go "still waiting on approval" (available via `eas go` / Expo CLI); "Expo Go is not recommended as a development environment for production apps". A development build "is essentially your own version of Expo Go"; `npx expo run:ios|run:android` generates native dirs and builds locally. [official-doc] https://docs.expo.dev/workflow/customizing/ , https://docs.expo.dev/develop/development-builds/introduction/ , changelogs 56/57
49. Native unit tests: `ExpoModulesCore.podspec` and `Expo.podspec` declare `s.test_spec 'Tests' do |test_spec| test_spec.dependency 'ExpoModulesTestCore' …` — the `ExpoModulesTestCore` pod is Expo's internal test harness for pods' `test_spec`s; the module template and `expo-module-scripts` README define no `test:ios`/`test:android` scripts. [source-code] `ExpoModulesCore.podspec` L126-146, `Expo.podspec` L113-117; `expo-module-scripts@56.0.3/README.md`
50. `expo-module-scripts@56.0.3`: commands `configure`, `typecheck`, `build` (tsc), `test` (jest/ts-jest), `lint`, `clean`, `prepare` (= configure), `prepublishOnly` (= clean+build), `readme`; `tsconfig.base.json` (strict, `module esnext`, `moduleResolution bundler`, `verbatimModuleSyntax`, `declaration`), `tsconfig.plugin.json` → `tsconfig.node.json`; depends on `jest-expo ~56.0.4`, `@react-native/jest-preset 0.85.3`. [source-code] `pk/expo-module-scripts-56.0.3/package/{README.md,tsconfig.base.json,tsconfig.plugin.json,package.json}`
51. Metro: "Package Exports support has been enabled by default in Metro since 0.82 (or React Native 0.79)"; "Metro will always assert 'import' or 'require' condition, but never both … based on whether the dependency being resolved uses `import` … vs `require()`"; unmatched subpaths fall back to `main`/`react-native`/`browser` fields. Expo's Metro config sets `unstable_conditionsByPlatform: { ios: ['react-native'], android: ['react-native'], …, web: ['browser'] }` and `resolverMainFields: ['react-native','browser','main']`. [official-doc] https://metrobundler.dev/docs/package-exports/ ; [source-code] `@expo/metro-config@56.0.18/build/ExpoMetroConfig.js` L219-226

---

## 2. API sketch relevant to our library

Working name below: package `@gj-kit/expo-health`, native module name `GjKitHealth`, Swift class `GjKitHealthModule`, Kotlin `kit.gj.health.GjKitHealthModule`. (Names are placeholders.)

### 2.1 File tree (template-derived, adapted to the monorepo)

```
expo-health/
  package.json                 # main/types → build/ (or dist/, see §3.4), files allow-list
  expo-module.config.json
  app.plugin.js                # module.exports = require('./plugin/build');
  plugin/tsconfig.json         # outDir build, CJS for Node
  plugin/src/index.ts
  src/index.ts  src/GjKitHealthModule.ts  src/GjKitHealthModule.web.ts  src/types.ts
  ios/GjKitHealth.podspec  ios/GjKitHealthModule.swift  ios/PrivacyInfo.xcprivacy
  android/build.gradle  android/src/main/AndroidManifest.xml
  android/src/main/java/kit/gj/health/GjKitHealthModule.kt (+ contracts/)
  example/                     # optional; not packed
```

### 2.2 expo-module.config.json

```json
{
  "platforms": ["ios", "android"],
  "apple":   { "modules": ["GjKitHealthModule"] },
  "android": { "modules": ["kit.gj.health.GjKitHealthModule"] }
}
```
Use granular `ios` (not `apple`) because HealthKit does not exist on tvOS/macOS; keep the podspec to `:ios` only (facts 15, 13).

### 2.3 ios/GjKitHealth.podspec

```ruby
require 'json'
package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))
Pod::Spec.new do |s|
  s.name = 'GjKitHealth'; s.version = package['version']; s.summary = package['description']
  s.license = package['license']; s.author = package['author']; s.homepage = package['homepage']
  s.platforms = { :ios => '16.4' }          # SDK 56/57 floor (fact 3); drop :tvos
  s.swift_version = '5.9'                    # template default (fact 13/21)
  s.source = { git: 'https://github.com/gj-kit/gj-kit.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'HealthKit'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = 'ios/**/*.{h,m,mm,swift}'
  s.resource_bundles = { 'GjKitHealth_privacy' => ['ios/PrivacyInfo.xcprivacy'] }   # fact 44 pattern
end
```

### 2.4 android/build.gradle

```groovy
plugins { id 'com.android.library'; id 'expo-module-gradle-plugin' }
group = 'kit.gj.health'
version = '0.1.0'
android {
  namespace 'kit.gj.health'
  defaultConfig { versionCode 1; versionName '0.1.0' }   // minSdk/compileSdk come from rootProject.ext (fact 7)
  lintOptions { abortOnError false }
}
dependencies { implementation 'androidx.health.connect:connect-client:1.1.0' }  // not 1.2.0-alpha (fact 46)
```
`android/src/main/AndroidManifest.xml` (static parts only, merged at build time — fact 39/45):
```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <queries><package android:name="com.google.android.apps.healthdata" /></queries>
  <application>
    <activity android:name="kit.gj.health.HealthRationaleActivity" android:exported="true">
      <intent-filter><action android:name="androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE" /></intent-filter>
    </activity>
    <activity-alias android:name="ViewPermissionUsageActivity" android:exported="true"
        android:targetActivity="kit.gj.health.HealthRationaleActivity"
        android:permission="android.permission.START_VIEW_PERMISSION_USAGE">
      <intent-filter>
        <action android:name="android.intent.action.VIEW_PERMISSION_USAGE" />
        <category android:name="android.intent.category.HEALTH_PERMISSIONS" />
      </intent-filter>
    </activity-alias>
  </application>
</manifest>
```
(Whether Health Connect accepts a rationale activity contributed by a library manifest is untested — §5.)

### 2.5 Swift module (shape only)

```swift
import ExpoModulesCore
import HealthKit

struct WorkoutQuery: Record {
  @Field var from: Date? = nil
  @Field var to: Date? = nil
  @Field var kinds: [ActivityKind] = []
  @Field var limit: Int = 100
}
enum ActivityKind: String, Enumerable { case running, hiking, walking }

final class HealthUnavailableException: Exception {          // code → ERR_HEALTH_UNAVAILABLE (fact 19)
  override var reason: String { "Health data is not available on this device" }
}
final class HealthAuthorizationException: GenericException<String> {
  override var reason: String { "Authorization failed: \(param)" }
}

public class GjKitHealthModule: Module {
  private let store = HKHealthStore()
  public func definition() -> ModuleDefinition {
    Name("GjKitHealth")
    Constant("isAvailable") { HKHealthStore.isHealthDataAvailable() }
    Events("onAuthorizationChange")

    AsyncFunction("requestAuthorization") { (read: [String], write: [String]) async throws -> String in
      guard HKHealthStore.isHealthDataAvailable() else { throw HealthUnavailableException() }
      try await store.requestAuthorization(toShare: …, read: …)   // native async/await (fact 18)
      return "granted"
    }
    AsyncFunction("readWorkouts") { (query: WorkoutQuery) async throws -> [[String: Any]] in … }
    AsyncFunction("writeWorkout") { (workout: WorkoutInput) async throws -> String in … }
  }
}
```

### 2.6 Kotlin module (shape only)

```kotlin
package kit.gj.health

class HealthPermissionsInput(val permissions: ArrayList<String>) : java.io.Serializable

class HealthPermissionsContract : AppContextActivityResultContract<HealthPermissionsInput, Set<String>> {
  private val delegate = PermissionController.createRequestPermissionResultContract()   // fact 29
  override fun createIntent(context: Context, input: HealthPermissionsInput) =
    delegate.createIntent(context, input.permissions.toSet())
  override fun parseResult(input: HealthPermissionsInput, resultCode: Int, intent: Intent?) =
    delegate.parseResult(resultCode, intent)
}

class HealthUnavailableException : CodedException("Health Connect is not available")   // ERR_HEALTH_UNAVAILABLE (fact 23)

class GjKitHealthModule : Module() {
  private lateinit var permissionLauncher: AppContextActivityResultLauncher<HealthPermissionsInput, Set<String>>
  private val context get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("GjKitHealth")
    Constant("isAvailable") { HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE }
    Events("onAuthorizationChange")

    RegisterActivityContracts {                                             // runs after OnCreate (fact 26)
      permissionLauncher = registerForActivityResult(HealthPermissionsContract())
    }
    AsyncFunction("requestAuthorization") Coroutine { read: List<String>, write: List<String> ->
      val wanted = (read + write)
      val granted = permissionLauncher.launch(HealthPermissionsInput(ArrayList(wanted)))   // suspend launch
      if (granted.containsAll(wanted)) "granted" else "denied"
    }
    AsyncFunction("readWorkouts") Coroutine { query: WorkoutQuery -> … }   // HealthConnectClient.readRecords(...)
  }
}
```
Alternative without contracts: `appContext.throwingActivity.startActivityForResult(delegate.createIntent(ctx, set), REQ)` + `OnActivityResult { _, payload -> if (payload.requestCode == REQ) … }` (fact 27).

### 2.7 TypeScript wrapper

```ts
import { NativeModule, requireOptionalNativeModule } from 'expo';

type GjKitHealthEvents = { onAuthorizationChange: (e: { status: AuthorizationStatus }) => void };
declare class GjKitHealthNative extends NativeModule<GjKitHealthEvents> {
  readonly isAvailable: boolean;
  requestAuthorization(read: string[], write: string[]): Promise<AuthorizationStatus>;
  readWorkouts(query: WorkoutQuery): Promise<Workout[]>;
  writeWorkout(workout: WorkoutInput): Promise<string>;
}
const native = requireOptionalNativeModule<GjKitHealthNative>('GjKitHealth');   // null in Expo Go / web (fact 30)
```

### 2.8 Config plugin

```ts
import { ConfigPlugin, createRunOncePlugin, withInfoPlist, withEntitlementsPlist,
         withAndroidManifest, withGradleProperties, AndroidConfig } from 'expo/config-plugins';

type Props = { healthSharePermission?: string; healthUpdatePermission?: string;
               android?: { permissions: string[]; minSdkVersion?: 26 } };

const withGjKitHealth: ConfigPlugin<Props> = (config, props = {}) => {
  config = withInfoPlist(config, c => {
    c.modResults.NSHealthShareUsageDescription ??= props.healthSharePermission ?? '…';
    c.modResults.NSHealthUpdateUsageDescription ??= props.healthUpdatePermission ?? '…';
    return c;
  });
  config = withEntitlementsPlist(config, c => { c.modResults['com.apple.developer.healthkit'] = true; return c; });
  config = withAndroidManifest(config, c => {
    for (const p of props.android?.permissions ?? []) AndroidConfig.Permissions.addPermission(c.modResults, p);
    return c;
  });
  // optional, opt-in only (see §3.5): raise app minSdk through the same channel expo-build-properties uses
  if (props.android?.minSdkVersion) config = withGradleProperties(config, c => { … 'android.minSdkVersion' … });
  return config;
};
export default createRunOncePlugin(withGjKitHealth, '@gj-kit/expo-health', pkg.version);
```
Oracle during development: `npx expo config --type introspect` in the example/consumer app (shows the resulting `ios.infoPlist`, `ios.entitlements`, `android.manifest` JSON) and `npx expo prebuild --clean --no-install` to diff generated files (fact 38).

### 2.9 package.json packaging (allow-list style, monorepo convention)

```json
"files": ["build", "ios", "android/build.gradle", "android/src/main", "expo-module.config.json", "app.plugin.js", "plugin/build"]
```
Listing `android/src/main` and `android/build.gradle` instead of `android/` avoids shipping `android/build/`, `android/src/test`, `android/src/androidTest` without needing a subdirectory `.npmignore` (fact 12). Verify with `npm pack --dry-run`.

---

## 3. Design implications for a minimal-options unified API

### 3.1 Module/type surface
- Use `Record`/`Enumerable` on both platforms for every argument and result object; they are validated at the bridge, so JS-side parsing disappears and the TS `declare class … extends NativeModule<Events>` becomes the single typed contract (facts 20, 24, 31). Keep the JS wrapper a thin layer that maps native records to the public types and normalises platform differences (dates as ISO strings or epoch ms, distances in metres, durations in seconds).
- Return-first, throw-on-failure: use Swift `Exception` subclasses and Kotlin `CodedException` subclasses with the **same class names on both platforms** so inferred codes match (`ERR_HEALTH_UNAVAILABLE`, `ERR_HEALTH_NOT_AUTHORIZED`, `ERR_HEALTH_CANCELLED`, `ERR_HEALTH_INVALID_ARGUMENT`). Because both runtimes derive `ERR_*` from the class name with the same rule (facts 19, 23), a shared TS `HealthErrorCode` union plus an `isHealthError(e)` guard can be tested in unit tests without native code. Never let raw `HKError`/`RemoteException` escape (AGENTS.md §2): wrap as `cause`.
- Prefer Swift `async throws` closures and Kotlin `Coroutine` bodies; avoid `Promise` parameters so cancellation/throwing semantics stay uniform (facts 18, 22).
- Expose `isAvailable` as a `Constant` and a single `requestAuthorization(read, write)` → `'granted' | 'denied' | 'unavailable'`-style result; hide HealthKit's "read authorization is never disclosed" vs Health Connect's explicit grant set behind one normalised status — document the asymmetry rather than leaking per-platform enums.
- Events: declare only what is needed (`Events("onAuthorizationChange")` or none). Each declared event is part of the public contract.

### 3.2 Platform declaration
- `platforms: ["ios", "android"]`, podspec `:ios => '16.4'` only; do not copy the template's `:tvos`. A consumer building for tvOS/macOS would otherwise fail compiling `import HealthKit` (facts 13, 15).
- Peer deps: `"expo": ">=56.0.0 <58.0.0"` (narrower than Expo's `*` but consistent with the monorepo; `expo-modules-core` must stay a devDependency only, never a dependency, or two cores can be linked — fact 16).

### 3.3 Android permission flow
- Use `RegisterActivityContracts` + `AppContextActivityResultLauncher.launch(input)` (suspend) wrapped around `PermissionController.createRequestPermissionResultContract()`; input must be `Serializable` (facts 26, 29). Do not rely on the fallback callback (documented as non-functional) — if the Activity is destroyed mid-request, surface `ERR_HEALTH_CANCELLED` and let the app re-query `getGrantedPermissions()`.
- Ship `<queries>`, the rationale Activity and the Android-14 `activity-alias` in the library's own `AndroidManifest.xml` (static, always required) so consumers get them without the config plugin; keep the variable parts (`<uses-permission android:name="android.permission.health.READ_EXERCISE"…>` list, privacy-policy URL) in the plugin (facts 39, 45). Trade-off: library-manifest entries are invisible to `expo config --type introspect`.

### 3.4 Build output: `tsc → build/` vs tsup dual dist
- Metro resolves `exports` with conditions `react-native` + (`import` **or** `require`), and falls back to `main` (fact 51). A tsup ESM/CJS dual dist with `exports` therefore works for Metro as long as (a) the ESM entry is plain JS (Metro transpiles `import`/`export`), (b) the `react-native`/`default` branches point at files that `import { requireOptionalNativeModule } from 'expo'` (Metro resolves `expo` from the consumer), and (c) `.web.ts` platform splitting is done through `exports` conditions (`browser`) rather than Metro's file-suffix convention, which only applies to source files Metro itself resolves — the monorepo's `expo-media` already does exactly this. Expo's own template uses `tsc` + `main: build/index.js` with no `exports` at all; both are acceptable. Recommendation: keep the monorepo's tsup pipeline for JS, but keep `plugin/` on `tsc` (CJS, Node target) exactly like the template so `app.plugin.js` stays a plain `require`.
- Whatever the JS build, `ios/`, `android/`, `expo-module.config.json`, `app.plugin.js`, `plugin/build` must be in the tarball (fact 12, §2.9); autolinking reads the config from the installed package root (fact 15).

### 3.5 minSdk policy (needs a decision — §5)
- Health Connect 1.1.0 forces `minSdk 26` via its AAR manifest (fact 46); Expo apps default to 24 (fact 6). Three options: (A) document "set `expo-build-properties` → `android.minSdkVersion: 26`" and let the merger error be the signal; (B) have the plugin set `android.minSdkVersion=26` in gradle.properties (reliable, but a library silently raising an app's minSdk is the kind of hidden behaviour the goal statement rejects — make it an explicit prop); (C) keep the app at 24 with `tools:overrideLibrary="androidx.health.connect.client"` + a runtime `Build.VERSION.SDK_INT >= 26` guard returning `unavailable` (fact 47). Do **not** pick up `1.2.0-alpha0x`: its AAR needs compileSdk 37 / AGP 9.1.0, which SDK 56/57 toolchains do not provide (fact 46).

### 3.6 Graceful degradation
- Resolve the native module with `requireOptionalNativeModule` and expose `isSupported` so Expo Go / web / unit tests get deterministic `unavailable` behaviour instead of a throw at import time (fact 30). Provide `src/GjKitHealthModule.web.ts` via `registerWebModule` (fact 31) so web bundles do not need a Metro blocklist.

---

## 4. Pitfalls / gotchas

1. **Health Connect 1.2.0-alpha AAR metadata** (`minCompileSdk=37`, `minAndroidGradlePluginVersion=9.1.0`) breaks SDK 56/57 builds at dependency resolution; pin `1.1.0`. The release note's "minSdk 24" claim is not reflected in the shipped alpha05 manifest (fact 46).
2. **minSdk merger error** at the consumer (`uses-sdk:minSdkVersion 24 cannot be smaller than version 26 declared in library`) — exact wording [unverified]; behaviour official (fact 47). Decide policy up front (§3.5).
3. **tvOS in the podspec**: the template adds `:tvos => '16.4'`; HealthKit code will not compile there (fact 13).
4. **`expo-modules-core` as a dependency** (not devDependency) duplicates core and yields "duplicate native module" autolinking warnings; Expo's recursive resolution also follows non-optional peers, so mark `expo` optional only if you accept it being skipped (facts 16, 32).
5. **Config plugin must be CJS**: `app.plugin.js`/`plugin/build` are loaded by Node; an ESM-only `"type": "module"` package root needs `app.plugin.cjs`-style care — the monorepo's packages set `"type": "module"`, so `app.plugin.js` must either be renamed `.cjs` (and referenced accordingly) or the plugin build must stay inside a subfolder with its own `package.json` `{"type":"commonjs"}` [unverified — test in the consumer].
6. **`RegisterActivityContracts` fallback does nothing** on process death (fact 26); inputs must be `Serializable` or registration fails at runtime.
7. **`requireNativeModule` throws at import time** in Expo Go/web; use the optional variant (fact 30). Expo Go cannot load this module at all (fact 48).
8. **Introspection blind spot**: entries in the library `AndroidManifest.xml` are merged only at Gradle build time and do not appear in `expo config --type introspect` (fact 39).
9. **EAS capability sync**: once `com.apple.developer.healthkit` is in entitlements, `eas build` enables HealthKit on the Apple Developer Portal automatically; teams with locked portal permissions need `EXPO_NO_CAPABILITY_SYNC=1` and manual enabling (fact 43).
10. **App Review**: missing `NSHealthShareUsageDescription`/`NSHealthUpdateUsageDescription` crashes at authorization time; `com.apple.developer.healthkit.access` should stay absent unless clinical records are used (fact 42).
11. **pnpm paths with `=`** (patched deps) trigger the Android symlink-path workaround; the module itself will not have `=` unless patched, but consumers patching *it* would (fact 34).
12. **Swift concurrency**: concurrent `AsyncFunction` closures are `@Sendable`; capturing the module instance or `HKHealthStore` is fine in Swift 5 mode but will become errors if the podspec is ever moved to `swift_version '6.0'` (facts 18, 21).
13. **Template devDependencies are stale** (`jest-expo ~55`, `react-native 0.82.1`); do not copy them into the package — use the monorepo's versions (fact 10).
14. **`files` vs `.npmignore`**: with a root `files` allow-list a root `.npmignore` is ignored; `android/` must be listed at sub-path granularity or `android/build/` ships (fact 12).

---

## 5. Open questions

### Needs a USER decision
- minSdk policy for Android: (A) require consumers to set `expo-build-properties` `android.minSdkVersion: 26`; (B) plugin prop that sets it; (C) `tools:overrideLibrary` + runtime guard at 24 (§3.5).
- JS build: tsup dual dist + `exports` (monorepo convention) vs template `tsc → build/` + `main` (zero-risk for Metro). Recommendation: tsup for `src/`, `tsc` for `plugin/`.
- Where static Health Connect manifest pieces live: library `AndroidManifest.xml` (zero-config, not introspectable) vs plugin-written (introspectable, requires plugin use).
- Package name / native module name (`GjKitHealth`?) and whether write support ships in the first version (it changes entitlements text, `NSHealthUpdateUsageDescription`, and Play Console declarations).
- Peer range: `expo >=56 <58` (monorepo style) vs Expo's recommended `*`.

### Needs a hands-on device / build test
- Install the packed `.tgz` via `file:` in a pnpm consumer with default (isolated) `nodeLinker`, then run `npx expo-modules-autolinking search`/`resolve --platform apple|android` and `npx expo prebuild --clean` to confirm the realpath'd module links on both platforms (fact 35).
- Health Connect accepting a rationale Activity + `ViewPermissionUsageActivity` alias declared by a **library** manifest (Android 14 on the Pixel_9a AVD with the Health Connect APK).
- `RegisterActivityContracts` + `PermissionController.createRequestPermissionResultContract()` wrapped as `AppContextActivityResultContract` returns the granted set correctly, including the "user cancels" path.
- `app.plugin.js` under a `"type": "module"` package root (pitfall 5), and `expo config --type introspect` output for entitlements/Info.plist.
- iOS: `requestAuthorization` + reads on an iPhone 17 simulator (HealthKit works in Simulator; route samples need seeded data) with Xcode 26.6.
- `npm pack --dry-run` file list against the allow-list in §2.9.

### Needs more research
- Whether Health Connect will publish a 1.2.0 **stable** whose AAR drops to minSdk 24 and keeps `minCompileSdk ≤ 36` (track https://developer.android.com/jetpack/androidx/releases/health-connect).
- Exact manifest-merger error wording for the minSdk conflict (for README troubleshooting).
- Whether the Pika compile-time plugin imposes restrictions on `Record` declarations (e.g., `OptimizedRecord` annotation) that affect our Kotlin records (source grep showed only the annotation hook — fact 7).
- SDK 58 canary (`expo-module-template@58.0.0-canary-2026-08-12`) for upcoming template/API changes before 1.0.

---

## 6. Sources

npm registry (JSON): https://registry.npmjs.org/expo · https://registry.npmjs.org/expo-modules-core · https://registry.npmjs.org/expo-modules-autolinking · https://registry.npmjs.org/expo-module-scripts · https://registry.npmjs.org/create-expo-module · https://registry.npmjs.org/@expo/config-plugins · https://registry.npmjs.org/react-native · https://registry.npmjs.org/expo-module-template

Tarballs unpacked (scratchpad `pk/`): `expo-modules-core@57.0.12`, `expo-modules-autolinking@57.0.10`, `@expo/config-plugins@57.0.8`, `expo@57.0.15`, `create-expo-module@57.0.1`, `expo-module-template@57.0.8`, `expo-module-template@56.0.18`, `expo-module-scripts@56.0.3`, `expo-template-bare-minimum@56.0.34`, `expo-template-bare-minimum@57.0.17`; local `node_modules/.pnpm/{expo-modules-core@56.0.24,expo-modules-autolinking@56.0.22,expo-image-picker@56.0.24,expo-media-library@56.0.11,expo-constants@56.0.24,@expo+metro-config@56.0.18,react-native@0.85.3}`

Expo docs (Markdown endpoints): https://docs.expo.dev/modules/module-api.md · https://docs.expo.dev/modules/module-config.md · https://docs.expo.dev/modules/autolinking.md · https://docs.expo.dev/modules/existing-library.md · https://docs.expo.dev/modules/get-started.md · https://docs.expo.dev/modules/use-standalone-expo-module-in-your-project.md · https://docs.expo.dev/modules/config-plugin-and-native-module-tutorial/ · https://docs.expo.dev/modules/native-module-tutorial/ · https://docs.expo.dev/modules/design/ · https://docs.expo.dev/config-plugins/mods.md · https://docs.expo.dev/config-plugins/plugins.md · https://docs.expo.dev/config-plugins/development-and-debugging.md · https://docs.expo.dev/guides/monorepos.md · https://docs.expo.dev/guides/customizing-metro.md · https://docs.expo.dev/develop/development-builds/introduction.md · https://docs.expo.dev/workflow/customizing/ · https://docs.expo.dev/build-reference/ios-capabilities/ · https://docs.expo.dev/versions/latest/sdk/build-properties/ · https://docs.expo.dev/versions/latest/sdk/expo/

Expo changelogs: https://expo.dev/changelog/sdk-56 · https://expo.dev/changelog/sdk-57

expo/expo source: https://raw.githubusercontent.com/expo/expo/main/packages/expo-module-scripts/README.md · https://raw.githubusercontent.com/expo/expo/main/packages/expo-modules-core/android/src/main/java/expo/modules/kotlin/modules/ModuleDefinitionBuilder.kt · …/expo/modules/kotlin/AppContext.kt · …/expo/modules/kotlin/activityresult/AppContextActivityResultCaller.kt · https://raw.githubusercontent.com/expo/expo/main/packages/expo-build-properties/src/android.ts

React Native: https://raw.githubusercontent.com/facebook/react-native/v0.86.2/packages/react-native/gradle/libs.versions.toml · https://metrobundler.dev/docs/package-exports/ · https://reactnative.dev/docs/set-up-your-environment

Apple: https://developer.apple.com/documentation/bundleresources/privacy-manifest-files · https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api · https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.healthkit · https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.healthkit.access · https://developer.apple.com/documentation/bundleresources/information-property-list/nshealthshareusagedescription · https://developer.apple.com/documentation/bundleresources/information-property-list/nshealthupdateusagedescription

Android: https://developer.android.com/health-and-fitness/guides/health-connect/develop/get-started · https://developer.android.com/jetpack/androidx/releases/health-connect · https://developer.android.com/build/manage-manifests · https://dl.google.com/android/maven2/androidx/health/connect/connect-client/{1.1.0,1.2.0-alpha04,1.2.0-alpha05}/connect-client-*.aar (+ `.pom`, `maven-metadata.xml`)

Community: https://raw.githubusercontent.com/matinzd/react-native-health-connect/main/android/src/main/java/dev/matinzd/healthconnect/permissions/HealthConnectPermissionDelegate.kt · https://docs.npmjs.com/cli/v11/configuring-npm/package-json
