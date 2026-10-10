"""Verify a native Mac package and run its Electron UI startup smoke check."""
import hashlib
import json
import os
from pathlib import Path
import plistlib
import subprocess
import sys

arch = sys.argv[1]
name = '红果短剧Mac客户端SAF版'
root = Path(__file__).resolve().parent
app = root.parent / 'outputs/macos' / ('mac-arm64' if arch == 'arm64' else 'mac') / (name + '.app')
info = plistlib.loads((app / 'Contents/Info.plist').read_bytes())
assert info['CFBundleName'] == name, info
assert info['CFBundleDisplayName'] == name, info
assert info['CFBundleShortVersionString'] == json.loads((root / 'package.json').read_text())['version']
icon = app / 'Contents/Resources' / info['CFBundleIconFile']
if not icon.suffix:
    icon = icon.with_suffix('.icns')
assert icon.read_bytes() == (root / 'build/app.icns').read_bytes(), 'Mac icon mismatch'
binary = app / 'Contents/MacOS' / info['CFBundleExecutable']
native = subprocess.check_output(['lipo', '-archs', str(binary)], text=True).strip()
assert native == ('arm64' if arch == 'arm64' else 'x86_64'), native
subprocess.run(['codesign', '--verify', '--deep', '--strict', str(app)], check=True)
result_path = root.parent / ('mac-smoke-' + arch + '.json')
env = {**os.environ, 'HONGGUO_SMOKE_OUTPUT': str(result_path)}
subprocess.run([str(binary), '--smoke-test'], env=env, check=True, timeout=60)
report = json.loads(result_path.read_text())
assert report['passed'] and report['platform'] == 'darwin' and report['arch'] == arch, report
report.update(minimumSystemVersion=info.get('LSMinimumSystemVersion'), iconSha256=hashlib.sha256(icon.read_bytes()).hexdigest())
result_path.write_text(json.dumps(report, ensure_ascii=False, indent=2))
print(json.dumps(report, ensure_ascii=False))
