import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing required environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get parameters from request (optional)
    const { maxAgeHours = 24, dryRun = false } = await req.json().catch(() => ({}));

    console.log(`🧹 Starting temp-uploads cleanup (max age: ${maxAgeHours}h, dry run: ${dryRun})`);

    // Calculate cutoff timestamp
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - maxAgeHours);
    const cutoffTimestamp = cutoffDate.getTime() / 1000; // Unix timestamp in seconds

    // List all files in temp-uploads bucket
    const { data: files, error: listError } = await supabase
      .storage
      .from('temp-uploads')
      .list('', {
        limit: 1000,
        sortBy: { column: 'created_at', order: 'asc' }
      });

    if (listError) {
      console.error('❌ Error listing files:', listError);
      throw listError;
    }

    if (!files || files.length === 0) {
      console.log('✅ No files found in temp-uploads');
      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'No files to clean up',
          filesDeleted: 0,
          spaceFreed: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Filter files older than cutoff
    const filesToDelete = files.filter(file => {
      const fileTimestamp = new Date(file.created_at).getTime() / 1000;
      return fileTimestamp < cutoffTimestamp;
    });

    console.log(`📋 Found ${files.length} total files, ${filesToDelete.length} older than ${maxAgeHours}h`);

    if (filesToDelete.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'No old files to clean up',
          filesDeleted: 0,
          spaceFreed: 0,
          totalFiles: files.length
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate total space to be freed
    const spaceToFree = filesToDelete.reduce((sum, file) => sum + (file.metadata?.size || 0), 0);
    const spaceInMB = spaceToFree / 1024 / 1024;

    console.log(`💾 Space to free: ${spaceInMB.toFixed(2)} MB`);

    if (dryRun) {
      console.log('🔍 Dry run - no files deleted');
      return new Response(
        JSON.stringify({ 
          success: true,
          dryRun: true,
          message: 'Dry run completed',
          filesWouldDelete: filesToDelete.length,
          spaceWouldFree: spaceInMB,
          files: filesToDelete.map(f => ({ name: f.name, size: f.metadata?.size, created: f.created_at }))
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Delete files
    const filePaths = filesToDelete.map(file => file.name);
    
    const { data: deleteData, error: deleteError } = await supabase
      .storage
      .from('temp-uploads')
      .remove(filePaths);

    if (deleteError) {
      console.error('❌ Error deleting files:', deleteError);
      throw deleteError;
    }

    console.log(`✅ Deleted ${filesToDelete.length} files, freed ${spaceInMB.toFixed(2)} MB`);

    // Log to system_logs
    await supabase.from('system_logs').insert({
      log_type: 'cleanup',
      message: `Cleaned up ${filesToDelete.length} temp uploads (${spaceInMB.toFixed(2)} MB)`,
      metadata: {
        filesDeleted: filesToDelete.length,
        spaceFreed: spaceInMB,
        maxAgeHours
      }
    });

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Cleanup completed successfully',
        filesDeleted: filesToDelete.length,
        spaceFreedMB: parseFloat(spaceInMB.toFixed(2)),
        totalFilesRemaining: files.length - filesToDelete.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error in cleanup-temp-uploads:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : String(error) 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
