/**
 * @fileoverview Sync-to-Source Tool.
 * 
 * Reads the AI-healed selectors from selector-memory.json and 
 * automatically updates the .spec.js files in the tests/ directory.
 * 
 * Usage: node src/tools/sync-to-source.js
 */

const fs = require('fs');
const path = require('path');

// Load config for memory path
const frameworkConfig = require('../../config/framework.config');
const MEMORY_FILE = path.resolve(frameworkConfig.memory.selectorStorePath);
const TESTS_DIR = path.resolve(__dirname, '../../tests');

// Helper to recursively find .spec.js files
function findTestFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.resolve(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(findTestFiles(file));
    } else if (file.endsWith('.spec.js')) {
      results.push(file);
    }
  });
  return results;
}

async function sync() {
  console.log('🚀 Starting Zero-Touch Sync-to-Source...');
  
  if (!fs.existsSync(MEMORY_FILE)) {
    console.warn(`Memory file not found at ${MEMORY_FILE}. No heals to sync.`);
    return;
  }

  const memoryRaw = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf-8'));
  const testFiles = findTestFiles(TESTS_DIR);

  let totalReplacements = 0;

  for (const [key, entries] of Object.entries(memoryRaw)) {
    // We only care about entries that have a high score and are 'healed'
    const bestHeal = entries.sort((a, b) => b.score - a.score)[0];
    
    if (!bestHeal || !bestHeal.originalSelector) continue;

    const original = bestHeal.originalSelector;
    const healed = bestHeal.selector;

    if (original === healed) continue;

    console.log(`\n🔍 Checking for: ${original}`);

    for (const file of testFiles) {
      let content = fs.readFileSync(file, 'utf-8');
      
      // We look for patterns like:
      // await orchestrator.click('OLD_SELECTOR')
      // await orchestrator.fill('OLD_SELECTOR', ...)
      
      if (content.includes(`'${original}'`) || content.includes(`"${original}"`)) {
        console.log(`  ✅ Found in ${path.basename(file)}`);
        
        // Safety: Only replace if it's within quotes
        const escapedOriginal = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(['"])${escapedOriginal}(['"])`, 'g');
        
        const newContent = content.replace(regex, `$1${healed}$2`);
        
        if (newContent !== content) {
          fs.writeFileSync(file, newContent, 'utf-8');
          console.log(`  ✨ Patched: ${original} → ${healed}`);
          totalReplacements++;
        }
      }
    }
  }

  console.log(`\n🎉 Done! Updated ${totalReplacements} selector(s) across your test suite.`);
  console.log('💡 TIP: Review the changes with `git diff` before committing.');
}

sync().catch(err => {
  console.error('❌ Sync failed:', err);
  process.exit(1);
});
