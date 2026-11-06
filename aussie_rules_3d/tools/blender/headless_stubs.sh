#!/usr/bin/env bash
# Build stub shared libraries so Blender (bpy) can run on headless Linux
# machines that lack an X11/Mesa stack. The stubs only satisfy the dynamic
# linker: a background-mode Blender never calls into X/GL.
#
# Usage: ./headless_stubs.sh [stubs_dir]
set -eu
cd "$(dirname "$0")"
STUBS="${1:-$PWD/stubs}"
mkdir -p "$STUBS"

SITE=$(ls -d .venv/lib/python*/site-packages/bpy 2>/dev/null | head -1)
if [ -z "${SITE:-}" ]; then
  SITE=$(python3 -c "import bpy,os;print(os.path.dirname(bpy.__file__))")
fi

python3 - "$SITE" "$STUBS" <<'PY'
import subprocess, sys, os, glob, collections

site, stubs = sys.argv[1], sys.argv[2]

# symbols provided by every real library we can see (plus Blender's own
# bundled libraries, which are loaded into the same address space)
provided = set()
search = ["/lib/x86_64-linux-gnu", "/usr/lib/x86_64-linux-gnu", "/usr/lib", "/lib"]
libs = []
for d in search:
    libs += glob.glob(os.path.join(d, "lib*.so*"))

bundled = [p for p in glob.glob(os.path.join(site, "lib", "*")) + glob.glob(os.path.join(site, "*"))
           if os.path.isfile(p) and ".so" in os.path.basename(p)]
seen = set()
for lib in libs + bundled:
    real = os.path.realpath(lib)
    if real in seen or not os.path.isfile(real):
        continue
    seen.add(real)
    try:
        out = subprocess.run(["readelf", "-W", "--dyn-syms", real],
                             capture_output=True, text=True, timeout=30).stdout
    except Exception:
        continue
    for line in out.splitlines():
        parts = line.split()
        if len(parts) >= 8 and parts[3] in ("FUNC","IFUNC") and parts[6] != "UND":
            provided.add(parts[7].split("@")[0])

# undefined symbols in Blender's own libraries
missing = set()
for so in bundled:
    out = subprocess.run(["readelf", "-W", "--dyn-syms", so],
                         capture_output=True, text=True, timeout=60).stdout
    for line in out.splitlines():
        parts = line.split()
        if len(parts) >= 8 and parts[3] in ("FUNC","IFUNC") and parts[6] == "UND":
            missing.add(parts[7].split("@")[0])

missing -= provided
missing -= {"__ard_stub"}

def bucket_of(name):
    n = name
    if n.startswith(("XRender",)):
        return "libXrender.so.1"
    if n.startswith(("XFixes",)):
        return "libXfixes.so.3"
    if n.startswith(("XI", "_Xi", "XListInputDevices", "XSelectExtensionEvent",
                     "XGetDeviceDontPropagateList", "XChangeFeedbackControl",
                     "XGetExtensionVersion", "XOpenDevice", "XCloseDevice")):
        return "libXi.so.6"
    if n.startswith(("xkb_", "_xkb")):
        return "libxkbcommon.so.0"
    if n.startswith(("Ice", "_Ice")):
        return "libICE.so.6"
    if n.startswith(("Smc", "Sms", "_Smc", "_Sms")):
        return "libSM.so.6"
    return "libGL.so.1"   # GL/GLX & friends

buckets = collections.defaultdict(list)
for name in sorted(missing):
    buckets[bucket_of(name)].append(name)

specs = ["libXrender.so.1", "libXfixes.so.3", "libXi.so.6", "libxkbcommon.so.0",
         "libICE.so.6", "libSM.so.6", "libGL.so.1"]
for spec in specs:
    syms = buckets.get(spec, [])
    src = os.path.join(stubs, spec + ".c")
    with open(src, "w") as f:
        f.write("/* auto-generated headless stub for %s */\n" % spec)
        for s in syms:
            f.write("void %s(void){}\n" % s)
    out = os.path.join(stubs, spec)
    cmd = ["gcc", "-shared", "-fPIC", "-Wl,-soname," + spec]
    if spec == "libxkbcommon.so.0":
        # glibc asserts when a versioned lookup (V_0.5.0) hits an unversioned
        # definition from the map named in the VERNEED entry, so version it.
        ver = os.path.join(stubs, spec + ".ver")
        with open(ver, "w") as f:
            f.write("V_0.5.0 { global: *; };\n")
        cmd += ["-Wl,--version-script=" + ver]
    cmd += ["-o", out, src]
    subprocess.run(cmd, check=True)
    print(f"stub {spec}: {len(syms)} symbols")
print("total stubbed symbols:", len(missing))
PY
