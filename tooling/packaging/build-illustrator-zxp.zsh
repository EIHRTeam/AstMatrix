#!/usr/bin/env zsh
# Run with pnpm build:illustrator:zxp. Password comes from ASTMATRIX_P12_PASSWORD
# or a hidden prompt; optional path overrides are defined below.
emulate -L zsh
setopt errexit nounset pipefail

die() {
  print -u2 -- "Illustrator ZXP: $*"
  exit 1
}

script_dir=$(cd -- "$(dirname -- "$0")" && pwd -P)
repo_dir=$(cd -- "$script_dir/../.." && pwd -P)
cd -- "$repo_dir"

certificate=${ASTMATRIX_P12_PATH:-$repo_dir/AstMatrix.p12}
signer=${ASTMATRIX_ZXPSIGNCMD:-$repo_dir/ZXPSignCmd}
[[ -s "$certificate" ]] || die "Certificate not found: $certificate"
[[ -x "$signer" ]] || die "Signing tool is not executable: $signer"

version=$(node -p "JSON.parse(require('node:fs').readFileSync('package.json', 'utf8')).version")
source_dir="$repo_dir/apps/illustrator-cep/dist"
output_path=${ASTMATRIX_ZXP_OUTPUT:-$repo_dir/release/AstMatrix-Illustrator-$version.zxp}
mkdir -p -- "$(dirname -- "$output_path")"
output_dir=$(cd -- "$(dirname -- "$output_path")" && pwd -P)
output_path="$output_dir/$(basename -- "$output_path")"

stage_dir=''
stage_zxp=''
password=''
cleanup() {
  unset password
  if [[ -n "$stage_dir" && -d "$stage_dir" ]]; then
    if [[ -n "$stage_zxp" && -e "$stage_zxp" ]]; then
      rm -f -- "$stage_zxp"
    fi
    rmdir -- "$stage_dir" 2>/dev/null || true
  fi
}
trap cleanup EXIT

print -r -- 'Building Illustrator extension...'
pnpm build:illustrator
[[ -s "$source_dir/CSXS/manifest.xml" ]] || die 'Built extension is missing CSXS/manifest.xml'
grep -Fq "ExtensionBundleVersion=\"$version\"" "$source_dir/CSXS/manifest.xml" ||
  die 'Illustrator manifest version does not match package.json'
grep -Fq 'ExtensionBundleId="com.adobeexchange.AstMatrix.1792169245.e017c631301fdefb23c93aef4e971dd1"' \
  "$source_dir/CSXS/manifest.xml" || die 'Illustrator bundle ID does not match Adobe Exchange'

if [[ -n ${ASTMATRIX_P12_PASSWORD:-} ]]; then
  password=$ASTMATRIX_P12_PASSWORD
  unset ASTMATRIX_P12_PASSWORD
else
  [[ -r /dev/tty ]] || die 'Set ASTMATRIX_P12_PASSWORD for non-interactive use'
  read -r -s "password?P12 password: " </dev/tty || die 'Could not read certificate password'
  print -r -- '' >/dev/tty
fi
[[ -n "$password" ]] || die 'Certificate password is empty'

stage_dir=$(mktemp -d "$output_dir/.astmatrix-zxp.XXXXXX")
stage_zxp="$stage_dir/AstMatrix-Illustrator-$version.zxp"
"$signer" -sign "$source_dir" "$stage_zxp" "$certificate" "$password" \
  -tsa http://timestamp.digicert.com || die 'ZXP signing failed'

verification=$("$signer" -verify "$stage_zxp" -certInfo 2>&1) || {
  print -r -- "$verification" >&2
  die 'ZXP signature verification failed'
}
print -r -- "$verification"
print -r -- "$verification" | grep -Eq '^[[:space:]]*Timestamp:[[:space:]]*Valid([[:space:]]|$)' ||
  die 'ZXP has no valid trusted timestamp'
[[ -s "$stage_zxp" ]] || die 'Signed ZXP is empty'

mv -f -- "$stage_zxp" "$output_path"
print -r -- "Signed ZXP: $output_path"
shasum -a 256 -- "$output_path"
