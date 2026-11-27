import {defineTool} from '@lovable.dev/mcp-js';
import {z} from 'zod';
import {londonToday} from '@/lib/whatsOn';
import {beginWrite,ownFeed,previewUrl,toolFailure} from '../write';
export default defineTool({name:'get_preview',title:'Preview your feed',description:'Return your private preview and a short summary of its sources, stories, events and look.',inputSchema:{feed_id:z.string().uuid()},annotations:{readOnlyHint:true,idempotentHint:true,openWorldHint:false},handler:async({feed_id},ctx)=>{
 const db=await beginWrite(ctx,'get_preview',feed_id);
 try{
  const feed=await ownFeed(db,feed_id,ctx);
  const [news,events,stories]=await Promise.all([
   db.from('topic_sources').select('source_id,content_sources(source_name,feed_url)').eq('topic_id',feed_id).eq('is_active',true),
   db.from('events').select('id,title,start_date,status').eq('topic_id',feed_id).neq('status','excluded').or(`start_date.gte.${londonToday()},end_date.gte.${londonToday()}`).order('start_date').limit(20),
   db.from('stories').select('id,title,status,is_published,topic_articles!inner(topic_id)').eq('topic_articles.topic_id',feed_id).order('created_at',{ascending:false}).limit(20),
  ]);
  for(const r of [news,events,stories])if(r.error)throw r.error;
  const storyRows=(stories.data??[]).map(s=>({id:String(s.id),title:String(s.title),status:String(s.status),ready:Boolean(s.is_published)}));
  const eventRows=(events.data??[]).map(e=>({id:String(e.id),title:String(e.title),date:String(e.start_date),status:String(e.status)}));
  const preview=previewUrl(feed.slug);
  return {content:[{type:'text',text:`${feed.name}: ${news.data?.length??0} news sources, ${storyRows.length} latest stories and ${eventRows.length} events. ${feed.is_public?'Live':'Private draft'}. Check it in Curatr: ${preview}`}],structuredContent:{feed:{id:feed_id,name:String(feed.name),is_public:Boolean(feed.is_public)},preview_url:preview,stories:storyRows,events:eventRows,look:{logo_url:String(feed.branding_config?.['logo_url']??''),top_bar:String(feed.branding_config?.['top_bar_color']??''),background:String(feed.branding_config?.['feed_background_color']??'')}}};
 }catch(error){toolFailure(error);}
}});
