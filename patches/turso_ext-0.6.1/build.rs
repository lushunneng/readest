// Local patch of turso_ext 0.6.1.
//
// Upstream's build.rs guards the advapi32 link with `cfg!(target_os =
// "windows")`. A build script is compiled for and runs on the HOST, so that
// `cfg!` reports the host OS, not the crate's target. Cross-compiling from a
// Windows host to aarch64-linux-android therefore emits
// `cargo:rustc-link-lib=advapi32` into the Android link line and fails with
// `ld.lld: error: unable to find library -ladvapi32`.
//
// Cargo sets CARGO_CFG_TARGET_OS for build scripts to the OS actually being
// targeted, so read that instead.
fn main() {
    println!("cargo:rerun-if-changed=build.rs");

    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    if target_os == "windows" {
        println!("cargo:rustc-link-lib=advapi32");
    }
}
