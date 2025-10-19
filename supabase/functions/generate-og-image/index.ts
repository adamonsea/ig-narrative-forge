import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const title = url.searchParams.get('title') || 'Curated News';
    const subtitle = url.searchParams.get('subtitle') || '';
    const theme = url.searchParams.get('theme') || 'light';

    // Generate SVG-based OG image
    const svg = `
      <svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:rgb(59,130,246);stop-opacity:1" />
            <stop offset="100%" style="stop-color:rgb(147,51,234);stop-opacity:1" />
          </linearGradient>
        </defs>
        
        <!-- Background -->
        <rect width="1200" height="630" fill="${theme === 'dark' ? '#1a1a1a' : '#ffffff'}"/>
        
        <!-- Gradient accent bar -->
        <rect width="1200" height="8" fill="url(#grad)"/>
        
        <!-- Content container -->
        <g>
          <!-- Subtitle -->
          ${subtitle ? `
          <text x="60" y="80" font-family="system-ui, -apple-system, sans-serif" font-size="32" font-weight="600" fill="${theme === 'dark' ? '#9ca3af' : '#6b7280'}">
            ${subtitle.substring(0, 50)}
          </text>
          ` : ''}
          
          <!-- Main title -->
          <text x="60" y="${subtitle ? '180' : '140'}" font-family="system-ui, -apple-system, sans-serif" font-size="56" font-weight="700" fill="${theme === 'dark' ? '#ffffff' : '#1f2937'}">
            ${wrapText(title, 40).map((line, i) => `
            <tspan x="60" dy="${i === 0 ? 0 : 70}">${line}</tspan>
            `).join('')}
          </text>
          
          <!-- Branding footer -->
          <text x="60" y="580" font-family="system-ui, -apple-system, sans-serif" font-size="28" font-weight="500" fill="${theme === 'dark' ? '#6b7280' : '#9ca3af'}">
            curatr.pro
          </text>
        </g>
      </svg>
    `;

    // Convert SVG to PNG would require a library, so for now return SVG
    // Social platforms generally support SVG for OG images
    return new Response(svg, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });

  } catch (error) {
    console.error('Error generating OG image:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

function wrapText(text: string, maxLength: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if ((currentLine + ' ' + word).trim().length <= maxLength) {
      currentLine = (currentLine + ' ' + word).trim();
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  
  if (currentLine) lines.push(currentLine);
  return lines.slice(0, 3); // Max 3 lines
}
