// swift-tools-version: 5.9
//
// TEST HARNESS ONLY — this package is not how the module ships.
//
// `@gj-kit/expo-workouts` ships to consumers as a CocoaPods pod (`ios/GjKitWorkouts.podspec`) that
// Expo autolinking installs. This manifest exists so `xcodebuild test` can drive the HealthKit seam
// on a simulator without a pod install, an app target or a HealthKit entitlement — the whole point
// of the `HealthStoring` protocol (index f56).
//
// It compiles `ios/` MINUS the two files that import ExpoModulesCore, which is not an SPM package.
// Everything with logic in it is on this side of that line: `GjKitWorkoutsModule.swift` decodes a
// dictionary, calls one seam member and encodes the result, and `WorkoutsExceptions.swift` is a
// table of 14 class names that `error-code-parity` already checks from TypeScript.
//
// It is deliberately NOT in `package.json`'s `files` list, so it never reaches the published
// tarball; `check-pack-contents.mjs` asserts what does.
//
//   open -a Simulator          # f126 — otherwise a HealthKit sheet never enters the XCUI hierarchy
//   xcodebuild test -scheme GjKitWorkoutsSeam-Package \
//     -destination 'platform=iOS Simulator,id=<udid>' -parallel-testing-enabled NO
//
// `-parallel-testing-enabled NO` is not optional either: parallel testing runs in a throwaway clone
// whose container is not the one under test (f125).

import PackageDescription

let package = Package(
  name: "GjKitWorkoutsSeam",
  platforms: [.iOS(.v16)],
  products: [
    .library(name: "GjKitWorkoutsSeam", targets: ["GjKitWorkoutsSeam"])
  ],
  targets: [
    .target(
      name: "GjKitWorkoutsSeam",
      path: "ios",
      exclude: [
        "GjKitWorkoutsModule.swift",
        "WorkoutsExceptions.swift",
        "GjKitWorkouts.podspec",
        "PrivacyInfo.xcprivacy",
      ]
    ),
    .testTarget(
      name: "GjKitWorkoutsSeamTests",
      dependencies: ["GjKitWorkoutsSeam"],
      path: "ios-tests"
    ),
  ]
)
