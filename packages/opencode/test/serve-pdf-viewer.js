#!/usr/bin/env bun

import path from 'path';
import { writeFile, unlink } from 'fs/promises';
import { processPdfFile } from '../src/tool/pdf.ts';

// Get script directory
const scriptDir = path.dirname(import.meta.path);
const htmlPath = path.join(scriptDir, 'pdf-viewer.html');
const tempDir = path.join(scriptDir, '.temp');

// Ensure temp directory exists
await Bun.write(path.join(tempDir, '.keep'), '');

// Simple HTTP server for pdf-viewer.html
const server = Bun.serve({
  port: 3456,
  async fetch(req) {
    const url = new URL(req.url);

    // Serve HTML
    if (url.pathname === '/' || url.pathname === '/index.html') {
      const file = Bun.file(htmlPath);
      if (!(await file.exists())) {
        return new Response('pdf-viewer.html not found!', { status: 404 });
      }
      return new Response(file, {
        headers: { 'Content-Type': 'text/html' }
      });
    }

    // API: Process PDF
    if (url.pathname === '/api/process-pdf' && req.method === 'POST') {
      try {
        const formData = await req.formData();
        const pdfFile = formData.get('pdf');

        if (!pdfFile || !(pdfFile instanceof File)) {
          return Response.json({ error: 'No PDF file provided' }, { status: 400 });
        }

        // Save to temp file
        const tempPath = path.join(tempDir, `temp-${Date.now()}.pdf`);
        const buffer = await pdfFile.arrayBuffer();
        await writeFile(tempPath, new Uint8Array(buffer));

        // Process using actual processPdfFile function
        const mockContext = {
          sessionID: 'browser-test',
          messageID: 'browser-test',
          agent: 'browser',
          abort: new AbortController().signal,
          metadata: () => {},
          extra: {
            supportsPdf: true,
            supportsImages: true,
            bypassCwdCheck: true,
          }
        };

        const structuredContent = await processPdfFile(tempPath, mockContext, true);

        // Clean up temp file
        await unlink(tempPath).catch(() => {});

        return Response.json({
          success: true,
          filename: pdfFile.name,
          structuredContent
        });

      } catch (error) {
        console.error('PDF processing error:', error);
        return Response.json({
          error: error.message || 'Failed to process PDF'
        }, { status: 500 });
      }
    }

    return new Response('Not Found', { status: 404 });
  }
});

console.log(`✅ PDF Viewer running at http://localhost:${server.port}`);
console.log(`📁 Serving: ${htmlPath}`);
console.log(`🔧 API: POST /api/process-pdf`);
console.log('📄 Upload a PDF or click "Load Showcase Example"');
console.log('\n⏹️  Press Ctrl+C to stop\n');
