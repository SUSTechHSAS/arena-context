import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const referenceRoot = new URL('../../reference/chinese-dungeon/', import.meta.url);
export const upstreamCommit = '8d80b5a4dd3d737ed6d3060f05611eaa3de611ab';

export function verifyReference(root = referenceRoot) {
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));
  if (manifest.commit !== upstreamCommit) throw new Error('Unexpected upstream commit');
  if (manifest.files.map(file => file.path).join(',') !== 'ChineseDungeon.html,LICENSE') {
    throw new Error('Unexpected reference file list');
  }
  for (const file of manifest.files) {
    const bytes = readFileSync(new URL(file.path, root));
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (bytes.length !== file.bytes || sha256 !== file.sha256) {
      throw new Error(`Reference checksum mismatch: ${file.path}`);
    }
  }
  return manifest;
}
