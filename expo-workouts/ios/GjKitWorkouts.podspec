require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'GjKitWorkouts'
  s.version        = package['version']
  # A short summary keeps `pod lib lint` quiet; the long form stays the package description.
  s.summary        = 'HealthKit workout and GPS-route bridge for Expo.'
  s.description    = package['description']
  s.license        = package['license']
  s.author         = { 'gj-kit' => 'https://github.com/gj-kit' }
  s.homepage       = package['homepage']

  # HealthKit does NOT exist on tvOS, so the template's `:tvos` line is dropped on purpose.
  # 16.4 is the deployment target the design fixed (index f1) — every async HealthKit descriptor
  # we use is available there unconditionally, so no `#available` guard is needed anywhere except
  # the ONE narrow `iOS 18.0` amendment for `.distanceRowing` (design section 8.1 step 3 / 8.3 C1).
  s.platforms      = {
    :ios => '16.4'
  }
  s.swift_version  = '5.9'
  # npm writes `git+https://…` into repository.url; CocoaPods wants the bare git URL.
  s.source         = { git: package['repository']['url'].sub(/\Agit\+/, '') }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # HealthKit is linked, not weak-linked: the deployment target already guarantees the framework
  # exists on every supported device. `HKHealthStore.isHealthDataAvailable()` — not framework
  # presence — is what tells us whether this particular device (e.g. iPad) has a store.
  s.frameworks = 'HealthKit'

  # Apple privacy manifest, carried as a resource bundle (design section 10.5).
  # CocoaPods' documented convention is `<PodName>_privacy` so the bundle name can never collide
  # with the framework/module name that `DEFINES_MODULE` creates.
  s.resource_bundles = {
    'GjKitWorkouts_privacy' => ['PrivacyInfo.xcprivacy']
  }

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
