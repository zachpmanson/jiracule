{ pkgs ? import <nixpkgs> {}, lib }:

let
  pnpmDeps = pkgs.fetchPnpmDeps {
    pname = "jiracule";
    version = "0.0.0";
    src = ../.;
    fetcherVersion = 3;
    # Update on lockfile changes: `nix build` prints the expected hash on mismatch.
    hash = "sha256-GqycPGz0ViP0eEOaB8EZYaT6mlQnENRn9NCRdkxEpME=";
  };
in

pkgs.stdenv.mkDerivation {
  pname = "jiracule";
  version = "0.0.0";
  src = ../.;

  nativeBuildInputs = [ pkgs.nodejs_24 pkgs.pnpm pkgs.pnpmConfigHook ];

  inherit pnpmDeps;

  buildPhase = ''
    runHook preBuild
    pnpm build
    runHook postBuild
  '';

  # Nitro node-server output; run with: node $out/server/index.mjs
  installPhase = ''
    runHook preInstall
    mkdir -p $out
    cp -r .output/. $out/
    runHook postInstall
  '';
}
