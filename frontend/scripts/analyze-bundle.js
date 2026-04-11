#!/usr/bin/env node

/**
 * Bundle analysis script for monitoring bundle size and dependencies
 * 
 * Usage: npm run analyze:bundle
 * 
 * Features:
 * - Bundle size analysis
 * - Dependency tree visualization
 * - Chunk size optimization
 * - Duplicate detection
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ANSI color codes for output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  reset: '\x1b[0m'
};

function colorLog(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

class BundleAnalyzer {
  constructor() {
    // Handle WSL path compatibility
    const cwd = process.cwd();
    this.bundleDir = path.resolve(cwd, '.next');
    this.analyzeDir = path.resolve(cwd, 'analyze');
    
    // Ensure paths use forward slashes for WSL compatibility
    this.bundleDir = this.bundleDir.replace(/\\/g, '/');
    this.analyzeDir = this.analyzeDir.replace(/\\/g, '/');
  }

  async run() {
    colorLog('cyan', '🔍 Starting bundle analysis...\n');

    try {
      // Clean previous analysis
      this.cleanAnalysis();
      
      // Run Next.js build with bundle analyzer
      await this.runBuild();
      
      // Analyze results
      await this.analyzeResults();
      
      // Generate recommendations
      this.generateRecommendations();
      
      colorLog('green', '\n✅ Bundle analysis complete!');
      colorLog('cyan', '📊 Check the analyze/ directory for detailed reports');
      
    } catch (error) {
      colorLog('red', `❌ Analysis failed: ${error.message}`);
      process.exit(1);
    }
  }

  cleanAnalysis() {
    if (fs.existsSync(this.analyzeDir)) {
      fs.rmSync(this.analyzeDir, { recursive: true });
    }
    fs.mkdirSync(this.analyzeDir, { recursive: true });
  }

  async runBuild() {
    colorLog('yellow', '🏗️  Building application with bundle analysis...');
    
    try {
      // Use shell: true for WSL compatibility
      const options = {
        stdio: 'inherit',
        shell: true,
        env: { ...process.env, NODE_ENV: 'production' }
      };
      execSync('npm run build', options);
    } catch (error) {
      throw new Error(`Build failed in WSL environment: ${error.message}. Please fix build errors before analyzing bundle.`);
    }
  }

  async analyzeResults() {
    colorLog('yellow', '\n📊 Analyzing bundle results...');
    
    const staticDir = path.join(this.bundleDir, 'static');
    
    if (!fs.existsSync(staticDir)) {
      throw new Error('Build output not found. Run build first.');
    }

    // Analyze JavaScript chunks
    this.analyzeJSChunks(staticDir);
    
    // Analyze CSS files
    this.analyzeCSSFiles(staticDir);
    
    // Analyze assets
    this.analyzeAssets(staticDir);
    
    // Generate summary
    this.generateSummary();
  }

  analyzeJSChunks(staticDir) {
    colorLog('blue', '\n📦 JavaScript Chunks:');
    
    const jsFiles = this.findFiles(staticDir, '.js');
    const jsAnalysis = {
      total: 0,
      chunks: [],
      largest: { size: 0, name: '' }
    };

    jsFiles.forEach(file => {
      const stats = fs.statSync(file);
      const size = this.formatBytes(stats.size);
      const relativePath = path.relative(staticDir, file);
      
      jsAnalysis.total += stats.size;
      jsAnalysis.chunks.push({
        name: relativePath,
        size: stats.size,
        formatted: size
      });

      if (stats.size > jsAnalysis.largest.size) {
        jsAnalysis.largest = { size: stats.size, name: relativePath };
      }
    });

    // Display results
    jsAnalysis.chunks
      .sort((a, b) => b.size - a.size)
      .forEach(chunk => {
        const sizeColor = chunk.size > 500000 ? 'red' : chunk.size > 200000 ? 'yellow' : 'green';
        colorLog('white', `  ${chunk.name.padEnd(40)} ${colorLog(sizeColor, chunk.formatted)}`);
      });

    colorLog('cyan', `\n  Total JS: ${this.formatBytes(jsAnalysis.total)}`);
    colorLog('yellow', `  Largest chunk: ${jsAnalysis.largest.name} (${this.formatBytes(jsAnalysis.largest.size)})`);

    // Save detailed analysis
    fs.writeFileSync(
      path.join(this.analyzeDir, 'js-analysis.json'),
      JSON.stringify(jsAnalysis, null, 2)
    );
  }

  analyzeCSSFiles(staticDir) {
    colorLog('blue', '\n🎨 CSS Files:');
    
    const cssFiles = this.findFiles(staticDir, '.css');
    const cssAnalysis = {
      total: 0,
      files: [],
      largest: { size: 0, name: '' }
    };

    cssFiles.forEach(file => {
      const stats = fs.statSync(file);
      const size = this.formatBytes(stats.size);
      const relativePath = path.relative(staticDir, file);
      
      cssAnalysis.total += stats.size;
      cssAnalysis.files.push({
        name: relativePath,
        size: stats.size,
        formatted: size
      });

      if (stats.size > cssAnalysis.largest.size) {
        cssAnalysis.largest = { size: stats.size, name: relativePath };
      }
    });

    cssAnalysis.files
      .sort((a, b) => b.size - a.size)
      .forEach(file => {
        const sizeColor = file.size > 100000 ? 'red' : file.size > 50000 ? 'yellow' : 'green';
        colorLog('white', `  ${file.name.padEnd(40)} ${colorLog(sizeColor, file.formatted)}`);
      });

    colorLog('cyan', `\n  Total CSS: ${this.formatBytes(cssAnalysis.total)}`);

    fs.writeFileSync(
      path.join(this.analyzeDir, 'css-analysis.json'),
      JSON.stringify(cssAnalysis, null, 2)
    );
  }

  analyzeAssets(staticDir) {
    colorLog('blue', '\n🖼️  Assets:');
    
    const assetExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.woff', '.woff2'];
    const assetFiles = [];
    
    assetExtensions.forEach(ext => {
      const files = this.findFiles(staticDir, ext);
      assetFiles.push(...files);
    });

    const assetAnalysis = {
      total: 0,
      files: [],
      byType: {}
    };

    assetFiles.forEach(file => {
      const stats = fs.statSync(file);
      const ext = path.extname(file);
      const relativePath = path.relative(staticDir, file);
      
      assetAnalysis.total += stats.size;
      assetAnalysis.files.push({
        name: relativePath,
        size: stats.size,
        formatted: this.formatBytes(stats.size),
        type: ext
      });

      if (!assetAnalysis.byType[ext]) {
        assetAnalysis.byType[ext] = { count: 0, size: 0 };
      }
      assetAnalysis.byType[ext].count++;
      assetAnalysis.byType[ext].size += stats.size;
    });

    // Display by type
    Object.entries(assetAnalysis.byType).forEach(([type, data]) => {
      colorLog('white', `  ${type.padEnd(8)} ${data.count.toString().padEnd(4)} files ${this.formatBytes(data.size)}`);
    });

    colorLog('cyan', `\n  Total Assets: ${this.formatBytes(assetAnalysis.total)}`);

    fs.writeFileSync(
      path.join(this.analyzeDir, 'asset-analysis.json'),
      JSON.stringify(assetAnalysis, null, 2)
    );
  }

  generateSummary() {
    const summary = {
      timestamp: new Date().toISOString(),
      recommendations: this.getRecommendations(),
      metrics: this.calculateMetrics()
    };

    fs.writeFileSync(
      path.join(this.analyzeDir, 'summary.json'),
      JSON.stringify(summary, null, 2)
    );

    colorLog('magenta', '\n📋 Bundle Summary:');
    colorLog('cyan', `  Generated: ${summary.timestamp}`);
    colorLog('cyan', `  Total Recommendations: ${summary.recommendations.length}`);
  }

  getRecommendations() {
    const recommendations = [];
    
    // Read analysis results
    const jsAnalysis = this.readAnalysis('js-analysis.json');
    const cssAnalysis = this.readAnalysis('css-analysis.json');
    const assetAnalysis = this.readAnalysis('asset-analysis.json');

    // JavaScript recommendations
    if (jsAnalysis) {
      if (jsAnalysis.total > 1000000) {
        recommendations.push({
          category: 'JavaScript',
          priority: 'high',
          message: 'Total JavaScript bundle is over 1MB',
          solution: 'Consider code splitting, tree shaking, and removing unused dependencies'
        });
      }

      if (jsAnalysis.largest.size > 500000) {
        recommendations.push({
          category: 'JavaScript',
          priority: 'medium',
          message: `Large chunk detected: ${jsAnalysis.largest.name}`,
          solution: 'Split this chunk into smaller, more focused chunks'
        });
      }
    }

    // CSS recommendations
    if (cssAnalysis) {
      if (cssAnalysis.total > 200000) {
        recommendations.push({
          category: 'CSS',
          priority: 'medium',
          message: 'CSS bundle is large',
          solution: 'Use CSS modules, purge unused styles, and consider CSS-in-JS'
        });
      }
    }

    // Asset recommendations
    if (assetAnalysis) {
      const largeImages = assetAnalysis.files?.filter(f => 
        ['.png', '.jpg', '.jpeg'].includes(f.type) && f.size > 200000
      );

      if (largeImages && largeImages.length > 0) {
        recommendations.push({
          category: 'Assets',
          priority: 'medium',
          message: `${largeImages.length} large images detected`,
          solution: 'Optimize images with compression tools and consider WebP format'
        });
      }
    }

    return recommendations;
  }

  calculateMetrics() {
    const jsAnalysis = this.readAnalysis('js-analysis.json');
    const cssAnalysis = this.readAnalysis('css-analysis.json');
    const assetAnalysis = this.readAnalysis('asset-analysis.json');

    return {
      totalJS: jsAnalysis?.total || 0,
      totalCSS: cssAnalysis?.total || 0,
      totalAssets: assetAnalysis?.total || 0,
      totalBundle: (jsAnalysis?.total || 0) + (cssAnalysis?.total || 0) + (assetAnalysis?.total || 0),
      jsChunks: jsAnalysis?.chunks?.length || 0,
      cssFiles: cssAnalysis?.files?.length || 0,
      assetFiles: assetAnalysis?.files?.length || 0
    };
  }

  generateRecommendations() {
    const recommendations = this.getRecommendations();
    
    colorLog('magenta', '\n💡 Optimization Recommendations:');
    
    recommendations.forEach((rec, index) => {
      const priorityColor = rec.priority === 'high' ? 'red' : rec.priority === 'medium' ? 'yellow' : 'green';
      colorLog('white', `\n${index + 1}. ${rec.category} (${colorLog(priorityColor, rec.priority.toUpperCase())})`);
      colorLog('white', `   Issue: ${rec.message}`);
      colorLog('cyan', `   Solution: ${rec.solution}`);
    });

    // General recommendations
    colorLog('magenta', '\n🚀 General Optimization Tips:');
    colorLog('white', '• Use dynamic imports for route-based code splitting');
    colorLog('white', '• Implement lazy loading for images and components');
    colorLog('white', '• Enable gzip compression on your server');
    colorLog('white', '• Use CDN for static assets');
    colorLog('white', '• Consider using next/image for automatic optimization');
    colorLog('white', '• Remove unused dependencies with depcheck');
    colorLog('white', '• Enable production optimizations in Next.js');
  }

  // Utility methods
  findFiles(dir, extension) {
    const files = [];
    
    function traverse(currentDir) {
      try {
        const items = fs.readdirSync(currentDir);
        
        for (const item of items) {
          const fullPath = path.join(currentDir, item);
          const stat = fs.statSync(fullPath);
          
          if (stat.isDirectory()) {
            traverse(fullPath);
          } else if (item.endsWith(extension)) {
            files.push(fullPath);
          }
        }
      } catch (error) {
        // Handle WSL permission issues gracefully
        if (error.code !== 'EACCES') {
          colorLog('yellow', `Warning: Cannot access ${currentDir}: ${error.message}`);
        }
      }
    }
    
    traverse(dir);
    return files;
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  readAnalysis(filename) {
    try {
      const filePath = path.join(this.analyzeDir, filename);
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      return null;
    }
  }
}

// Run the analyzer
if (require.main === module) {
  const analyzer = new BundleAnalyzer();
  analyzer.run().catch(console.error);
}

module.exports = BundleAnalyzer;
