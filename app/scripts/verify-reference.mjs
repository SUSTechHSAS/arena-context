import { verifyReference } from './reference.mjs';
const manifest = verifyReference();
console.log(`Verified ${manifest.files.length} reference files at ${manifest.commit}`);
