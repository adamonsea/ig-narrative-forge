import {defineTool,ToolError} from '@lovable.dev/mcp-js';
import {z} from 'zod';
import {beginWrite,ownFeed,logResult,previewUrl,toolFailure} from '../write';
import {ownerStory,pinHours} from '../inputRules';
import {readOwnerStory,commitOwnerStory} from '@/lib/feedSetup/addStory';
import {setFeedPin,queueFirstGather} from '@/lib/feedSetup/services';
export default defineTool({name:'pin_stories',title:'Pin or add a story',description:'Pin a live story from your own feed, or add your text or link through Add story for review in Curatr.',inputSchema:{feed_id:z.string().uuid(),story_ids:z.array(z.string().uuid()).min(1).max(1).optional(),add_story:ownerStory.optional(),hours:pinHours},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:true},handler:async({feed_id,story_ids,add_story,hours},ctx)=>{
 if(Boolean(story_ids?.length)===Boolean(add_story))throw new ToolError('Choose a story to pin or a story to add, not both.');
 const db=await beginWrite(ctx,'pin_stories',feed_id,add_story?1:0);
 try{
  const feed=await ownFeed(db,feed_id,ctx);
  let articleId:string | null=null;
  if(add_story){
   const mode=add_story.link?'link':'paste';
   const read=await readOwnerStory(db,{mode,topicId:feed_id,...(add_story.link?{url:add_story.link}:{text:add_story.text})});
   const saved=await commitOwnerStory(db,{mode,topicId:feed_id,story:read.draft});articleId=saved.articleId;
   await queueFirstGather(db,feed_id);
  }else{
   for(const storyId of story_ids??[]) await setFeedPin(db,feed_id,storyId,hours);
  }
  await logResult(db,'pin_stories',feed_id);
  return {content:[{type:'text',text:`${add_story?'Story added to your Story pool.':'Story pinned.'} Check it in Curatr: ${previewUrl(feed.slug)}`}],structuredContent:{feed_id,article_id:articleId,pinned_story_ids:story_ids??[],preview_url:previewUrl(feed.slug)}};
 }catch(error){toolFailure(error);}
}});
