import {defineTool} from '@lovable.dev/mcp-js';
import {z} from 'zod';
import {beginWrite,ownFeed,logResult,previewUrl,toolFailure} from '../write';
import {remoteUrl} from '../inputRules';
import {detectSourceKind,isEventsSourceKind} from '@/lib/whatsOn';
import {callFeedService,queueFirstGather} from '@/lib/feedSetup/services';
import {createNewsSource} from '@/lib/feedSetup/newsSources';
export default defineTool({name:'update_sources',title:'Change sources',description:'Check each link as news or events before adding it to your feed, or remove a source from this feed only.',inputSchema:{feed_id:z.string().uuid(),add:z.array(remoteUrl).max(10).optional(),remove:z.array(z.string().uuid()).max(10).optional()},annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:true,openWorldHint:true},handler:async({feed_id,add,remove},ctx)=>{
 const db=await beginWrite(ctx,'update_sources',feed_id);
 try{
  const feed=await ownFeed(db,feed_id,ctx);
  const checked:{url:string;kind:string;name:string;eventKind?:string}[]=[];
  // All reads and membership checks precede writes, including every removal.
  for(const id of remove??[]){
   const [n,e]=await Promise.all([db.from('topic_sources').select('source_id').eq('topic_id',feed_id).eq('source_id',id).maybeSingle(),db.from('event_sources').select('id').eq('topic_id',feed_id).eq('id',id).maybeSingle()]);
   if(n.error||e.error) throw n.error??e.error;
   if(!n.data&&!e.data) throw new Error('That source is not in your feed.');
  }
  for(const url of add??[]){
   const kind=detectSourceKind(url);
   if(isEventsSourceKind(kind)){
    const result=await callFeedService<{name:string;kind:string;found:number}>(db,'scrape-whats-on',{action:'preview',topicId:feed_id,url});
    if(!result.found) throw new Error(`No upcoming events were found at ${url}.`);
    checked.push({url,name:result.name||new URL(url).hostname,kind:'events',eventKind:result.kind});
   }else{
    await callFeedService(db,'validate-content-source',{url,sourceType:'News',topicType:feed.topic_type,region:feed.region??'general',topicId:feed_id});
    checked.push({url,name:new URL(url).hostname.replace(/^www\./,''),kind:'news'});
   }
  }
  await ctx.progress({progress:1,total:2,message:checked.map(s=>`${s.name}: ${s.kind}`).join('; ')||'Checking your sources'});
  const changes:{id:string;name:string;url:string;kind:string;action:string}[]=[];
  for(const source of checked){
   if(source.kind==='events'){
    const result=await callFeedService<{sourceId:string}>(db,'scrape-whats-on',{action:'save',topicId:feed_id,url:source.url,name:source.name,kind:source.eventKind});
    changes.push({id:result.sourceId,...source,action:'added'});
   }else{
    const {data:existing,error}=await db.from('content_sources').select('id').eq('topic_id',feed_id).eq('feed_url',source.url).maybeSingle();
    if(error) throw error;
    const sourceId=existing?.id??await createNewsSource(db,{source_name:source.name,feed_url:source.url,canonical_domain:new URL(source.url).hostname.replace(/^www\./,''),content_type:'news',source_type:detectSourceKind(source.url),is_active:true,region:feed.region,scraping_config:{trust_content_relevance:false}},feed_id);
    const {error:linkError}=await db.rpc('add_source_to_topic',{p_topic_id:feed_id,p_source_id:sourceId,p_source_config:{}});if(linkError)throw linkError;
    changes.push({id:String(sourceId),name:source.name,url:source.url,kind:'news',action:'added'});
   }
  }
  for(const id of remove??[]){
   const {data:e,error:readError}=await db.from('event_sources').select('id').eq('topic_id',feed_id).eq('id',id).maybeSingle();if(readError)throw readError;
   if(e){const {error}=await db.from('event_sources').update({is_active:false,updated_at:new Date().toISOString()}).eq('topic_id',feed_id).eq('id',id);if(error)throw error;}
   else {const {error}=await db.rpc('remove_source_from_topic',{p_topic_id:feed_id,p_source_id:id});if(error)throw error;}
   changes.push({id,name:'',url:'',kind:e?'events':'news',action:'removed'});
  }
  if(checked.some(s=>s.kind==='events')){const {error}=await db.from('topics').update({events_enabled:true}).eq('id',feed_id);if(error)throw error;}
  if(checked.length) await queueFirstGather(db,feed_id);
  await logResult(db,'update_sources',feed_id);
  return {content:[{type:'text',text:`Sources saved. ${checked.map(s=>`${s.name}: ${s.kind}`).join('; ')}\nCheck your feed: ${previewUrl(feed.slug)}`}],structuredContent:{changes,preview_url:previewUrl(feed.slug)}};
 }catch(error){await logResult(db,'update_sources',feed_id,'failed');toolFailure(error);}
}});
