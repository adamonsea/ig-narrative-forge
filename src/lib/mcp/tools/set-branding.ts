import {defineTool} from '@lovable.dev/mcp-js';
import {z} from 'zod';
import {beginWrite,ownFeed,logResult,previewUrl,toolFailure} from '../write';
import {colour,remoteUrl} from '../inputRules';
import {saveFeedLook} from '@/lib/feedSetup/services';
export default defineTool({name:'set_branding',title:'Set feed look',description:'Set your feed name, logo and existing Look colours. You can check the result in Curatr.',
 inputSchema:{feed_id:z.string().uuid(),name:z.string().trim().min(3).max(60).optional(),logo_url:remoteUrl.optional(),colours:z.object({brand:colour.optional(),top_bar:colour.or(z.literal('brand')).optional(),background:colour.or(z.literal('brand')).optional()}).optional()},
 annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:false},
 handler:async({feed_id,name,logo_url,colours},ctx)=>{
  const db=await beginWrite(ctx,'set_branding',feed_id);
  try{
   const feed=await ownFeed(db,feed_id,ctx);
   const config={...(feed.branding_config??{}),...(logo_url?{logo_url}:{}),...(colours?.top_bar?{top_bar_color:colours.top_bar}:{}),...(colours?.background?{feed_background_color:colours.background}:{})};
   const patch={...(name?{name}:{}),...(colours?.brand?{illustration_primary_color:colours.brand}:{}),branding_config:config};
   const {error}=await saveFeedLook(db,feed_id,patch);if(error) throw error;
   await logResult(db,'set_branding',feed_id);
   return {content:[{type:'text',text:`Look saved. Check your feed: ${previewUrl(feed.slug)}`}],structuredContent:{feed_id,preview_url:previewUrl(feed.slug)}};
  }catch(error){toolFailure(error);}
 },
});
