const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Function to find all dependencies of a package
function findDependencies(packageName, visited = new Set()) {
  if (visited.has(packageName)) {
    return [];
  }
  
  visited.add(packageName);
  
  try {
    const packageJsonPath = require.resolve(`${packageName}/package.json`);
    const packageDir = path.dirname(packageJsonPath);
    const packageJson = require(packageJsonPath);
    
    const dependencies = packageJson.dependencies || {};
    const dependencyNames = Object.keys(dependencies);
    
    const allDependencies = [...dependencyNames];
    
    for (const dep of dependencyNames) {
      const nestedDeps = findDependencies(dep, visited);
      allDependencies.push(...nestedDeps);
    }
    
    return [...new Set(allDependencies)];
  } catch (error) {
    console.error(`Error processing ${packageName}: ${error.message}`);
    return [];
  }
}

// Main packages to analyze
const mainPackages = [
  'ibmmq',
  'amqplib',
  'kafkajs',
  'stompit',
  '@azure/service-bus',
  '@azure/identity',
  '@aws-sdk/client-sqs',
  'uuid'
];

// Find all dependencies
const allDependencies = new Set();
for (const pkg of mainPackages) {
  console.log(`Finding dependencies for ${pkg}...`);
  const deps = findDependencies(pkg);
  deps.forEach(dep => allDependencies.add(dep));
  allDependencies.add(pkg);
}

// Generate .vscodeignore entries
const vscodeignoreEntries = [...allDependencies].map(dep => `!node_modules/${dep}/**`);

// Update webpack.config.js externals
const webpackExternals = [...allDependencies].reduce((acc, dep) => {
  // Handle scoped packages
  const key = dep.includes('/') ? `'${dep}'` : dep;
  acc[key] = `commonjs ${dep}`;
  return acc;
}, {});

// Output results
console.log('\n--- .vscodeignore entries ---');
console.log(vscodeignoreEntries.join('\n'));

console.log('\n--- webpack.config.js externals ---');
console.log('externals: {');
console.log('  vscode: \'commonjs vscode\', // the vscode-module is created on-the-fly and must be excluded');
Object.entries(webpackExternals).forEach(([key, value]) => {
  console.log(`  ${key}: '${value}',`);
});
console.log('},');

// Write to files
const vscodeignoreContent = fs.readFileSync('.vscodeignore', 'utf8');
const newVscodeignoreContent = vscodeignoreContent.replace(
  /# Include only necessary files from node_modules[\s\S]*?(?=\n\n|$)/,
  `# Include only necessary files from node_modules\n${vscodeignoreEntries.join('\n')}`
);

fs.writeFileSync('.vscodeignore.new', newVscodeignoreContent);
console.log('\nGenerated .vscodeignore.new file');
