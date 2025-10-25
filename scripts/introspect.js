#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔍 Pulling database schema...\n');

try {
  // Run Drizzle Kit pull (introspection)
  execSync('drizzle-kit pull', { 
    stdio: 'inherit',
    env: process.env 
  });

  console.log('\n✅ Schema pull completed successfully!');
  console.log('📁 Generated files in: ./schema/\n');

  // Optional: Add post-processing
  const schemaDir = path.join(__dirname, '../schema');
  const files = fs.readdirSync(schemaDir);
  
  console.log('Generated schema files:');
  files.forEach(file => {
    if (file.endsWith('.ts')) {
      console.log(`  - ${file}`);
    }
  });

  console.log('\n💡 Next steps:');
  console.log('  1. Review generated schema files');
  console.log('  2. Add custom types/exports if needed');
  console.log('  3. Commit changes to git');

} catch (error) {
  console.error('\n❌ Schema pull failed:', error.message);
  process.exit(1);
}
