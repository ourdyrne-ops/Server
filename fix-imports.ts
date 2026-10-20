import * as fs from 'fs';
import * as path from 'path';

function fixImports(dir: string) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      fixImports(fullPath);
    } else if (fullPath.endsWith('.ts') && !fullPath.endsWith('.d.ts')) {
      let content = fs.readFileSync(fullPath, 'utf-8');
      
      // Replace imports starting with ./ or ../ and not ending with .js or .json or similar, 
      // adding .js to them.
      content = content.replace(/(from\s+['"]\.\.?\/[^'"]+)(?<!\.js)(?<!\.json)(['"])/g, '$1.js$2');
      
      // Fix pg-boss import
      content = content.replace(/import\s+PgBoss\s+from\s+['"]pg-boss['"]/g, 'import PgBossModule from "pg-boss";\nconst PgBoss = (PgBossModule as any).default || PgBossModule;');
      
      // Fix fluent-ffmpeg import
      content = content.replace(/import\s+\*\s+as\s+ffmpeg\s+from\s+['"]fluent-ffmpeg['"]/g, 'import ffmpegModule from "fluent-ffmpeg";\nconst ffmpeg = (ffmpegModule as any).default || ffmpegModule;');
      
      // Fix e and err types
      content = content.replace(/\(error\)\s*=>/g, '(error: any) =>');
      content = content.replace(/\(e\)\s*=>/g, '(e: any) =>');
      content = content.replace(/\(err\)\s*=>/g, '(err: any) =>');
      content = content.replace(/catch\s*\(\s*e\s*\)/g, 'catch (e: any)');
      content = content.replace(/catch\s*\(\s*error\s*\)/g, 'catch (error: any)');
      content = content.replace(/catch\s*\(\s*err\s*\)/g, 'catch (err: any)');
      
      fs.writeFileSync(fullPath, content);
    }
  }
}

fixImports(path.join(process.cwd(), 'src'));
