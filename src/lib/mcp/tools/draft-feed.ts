import { defineTool, ToolError } from '@lovable.dev/mcp-js';
import { z } from 'zod';
import { beginWrite,logResult,previewUrl,toolFailure } from '../write';
import { draftFromSuggestion,slugify } from '@/lib/feedSetup';
import { createFeedFromDraft } from '@/lib/feedSetup/createFeed';
import { findSetupEvents,findSetupNews,freeFeedName,suggestFeedSetup } from '@/lib/feedSetup/prepareFeed';
import { callFeedService,queueFirstGather } from '@/lib/feedSetup/services';
export default defineTool({
 name:'draft_feed',title:'Draft a feed',
 description:'Set up a private feed from your description, with sources and its own look, for you to check in Curatr.',
 inputSchema:{description:z.string().trim().min(2).max(1500),name:z.string().trim().min(3).max(60).optional(),area:z.string().trim().min(2).max(120).optional()},
 annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:true},
 handler:async ({description,name,area},ctx)=>{
  const db=await beginWrite(ctx,'draft_feed',undefined,2);
  const ownerId=ctx.getUserId(); if(!ownerId) throw new ToolError('Sign in to Curatr first.');
  let feedId:string | undefined;
  try {
   await ctx.progress({progress:1,total:4,message:'Preparing your feed'});
   const setup=await suggestFeedSetup(db,area?`${description}. Area: ${area}`:description);
   const resolvedName=await freeFeedName(db,name??setup.name);
   const draft=draftFromSuggestion(setup,resolvedName);
   if(area){draft.region=area;draft.topic_type='regional';}
   await ctx.progress({progress:2,total:4,message:'Finding sources'});
   const news=await findSetupNews(db,draft);
   const warnings:string[]=[];
   let events:Awaited<ReturnType<typeof findSetupEvents>>={list:[],picked:new Set()};
   if(draft.topic_type==='regional'){
    const {data:status}=await db.rpc('mcp_studio_account');
    if(status && ((status as {balance?:number;exempt?:boolean}).exempt || ((status as {balance?:number}).balance??0)>=3)) {
      try {events=await findSetupEvents(db,draft);} catch {warnings.push('Event sources could not be found.');}
    } else warnings.push('More credits are needed to find event sources: https://curatr.pro/usage');
   }
   const selectedNews=news.list.filter(s=>news.picked.has(s.url));
   const selectedEvents=events.list.filter(s=>events.picked.has(s.url));
   const result=await createFeedFromDraft(db,draft,{ownerId,slug:slugify(resolvedName),isPublic:false,news:selectedNews,hasEvents:selectedEvents.length>0});
   feedId=result.feed.id;
   warnings.push(...result.warnings);
   await ctx.progress({progress:3,total:4,message:'Connecting your sources'});
   const connectedEvents: {id:string;name:string;url:string;kind:string}[]=[];
   for(const source of selectedEvents){
    try {const saved=await callFeedService<{sourceId:string}>(db,'scrape-whats-on',{action:'save',topicId:feedId,url:source.url,name:source.name,kind:source.kind});connectedEvents.push({id:saved.sourceId,name:source.name,url:source.url,kind:'events'});} catch {warnings.push(`Could not connect ${source.name}.`);}
   }
   await queueFirstGather(db,feedId);
   await logResult(db,'draft_feed',feedId);
   await ctx.progress({progress:4,total:4,message:'Your private draft is ready'});
   const sources=result.connectedNews;
   const preview=previewUrl(result.feed.slug);
   return {content:[{type:'text',text:`${resolvedName} is private. ${result.sourceIds.length} news sources and ${connectedEvents.length} event sources connected. First stories are queued for gathering. Check it and publish in Curatr: ${preview}${warnings.length?'\n'+warnings.join('\n'):''}`}],structuredContent:{feed:{...result.feed,is_public:false},sources:[...sources,...connectedEvents],preview_url:preview,gathering:'queued',warnings}};
  }catch(error){if(feedId) await logResult(db,'draft_feed',feedId,'partial');toolFailure(error);}
 },
});
