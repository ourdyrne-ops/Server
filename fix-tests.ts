import * as fs from 'fs';
import * as path from 'path';

function fixTests(dir: string) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      fixTests(fullPath);
    } else if (fullPath.endsWith('.spec.ts')) {
      let content = fs.readFileSync(fullPath, 'utf-8');
      
      // Replace jest with vi
      if (content.includes('jest.')) {
        if (!content.includes(`import { vi }`)) {
          content = `import { vi } from 'vitest';\n` + content;
        }
        content = content.replace(/jest\./g, 'vi.');
      }
      
      // Replace expect.objectContaining and expect.anything
      if (content.includes('expect.')) {
        if (!content.includes(`import { expect }`)) {
          content = `import { expect } from 'vitest';\n` + content;
        }
      }

      fs.writeFileSync(fullPath, content);
    }
  }
}

fixTests(path.join(process.cwd(), 'src'));
