import {describe,it,expect,vi} from 'vitest';
import {grantAllowsWrites,STUDIO_WRITE_VERSION} from '@/lib/mcp/allowance';
import {usableRemoteUrl,ownerStory,pinHours} from '@/lib/mcp/inputRules';
import {createFeedFromDraft} from '@/lib/feedSetup/createFeed';
import {rankSetupSources} from '@/lib/feedSetup/prepareFeed';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {FeedSetupDraft} from '@/lib/feedSetup';

const draft:FeedSetupDraft={name:'Pokemon',topic_type:'keyword',region:null,description:'Pokemon news',keywords:['pokemon'],negative_keywords:[],colour:'#0F766E',pictures:'source',welcome:'Pokemon highlights',brand_or_fandom:true,family_safe:false,autopilot:true};
describe('Studio Phase 2 rules',()=>{
 it('needs access level 2',()=>{expect(STUDIO_WRITE_VERSION).toBe(2);expect(grantAllowsWrites(1)).toBe(false);expect(grantAllowsWrites(2)).toBe(true);});
 it('rejects local or credential-bearing URLs',()=>{for(const url of ['http://127.0.0.1/a','http://10.0.0.1','https://localhost','http://[::1]','https://news.internal','https://user:password@news.example.com'])expect(usableRemoteUrl(url)).toBe(false);expect(usableRemoteUrl('https://www.pokemon.com')).toBe(true);});
 it('allows one Add story input, text or link',()=>{expect(ownerStory.safeParse({text:'Pokemon '.repeat(10)}).success).toBe(true);expect(ownerStory.safeParse({link:'https://pokemon.com/news',text:'Pokemon '.repeat(10)}).success).toBe(false);expect(ownerStory.safeParse({}).success).toBe(false);});
 it('uses the app pin durations',()=>{for(const hours of [24,48,168])expect(pinHours.safeParse(hours).success).toBe(true);expect(pinHours.safeParse(72).success).toBe(false);});
 it('starts with the same five highest-ranked sources as onboarding',()=>{const {picked,list}=rankSetupSources(Array.from({length:7},(_,i)=>({url:`https://news${i}.example.com`,source_name:`News ${i}`,type:'News',confidence_score:40+i})));expect(picked.size).toBe(5);expect(list[0]?.confidence_score).toBe(46);expect(picked.has('https://news0.example.com')).toBe(false);});
 it('excludes social-media sources',()=>{const {list}=rankSetupSources([{url:'https://instagram.com/pokemon',source_name:'Social',type:'News',confidence_score:95}]);expect(list).toHaveLength(0);});
 it('creates Studio drafts privately and disables public channels',async()=>{
  const inserted:Record<string,unknown>[]=[];
  const client={from:(table:string)=>({insert:(value:Record<string,unknown>)=>{inserted.push(value);return{select:()=>({single:async()=>({data:{id:'feed',name:'Pokemon',slug:'pokemon'},error:null})})};},update:()=>({eq:async()=>({error:null})})}),rpc:vi.fn()} as unknown as SupabaseClient;
  const result=await createFeedFromDraft(client,draft,{ownerId:'caller',slug:'pokemon',isPublic:false,news:[],hasEvents:false});
  expect(inserted[0]?.['is_public']).toBe(false);expect(inserted[0]?.['created_by']).toBe('caller');expect(inserted[0]?.['rss_enabled']).toBe(false);expect(inserted[0]?.['mcp_enabled']).toBe(false);expect(result.feed.id).toBe('feed');
 });
 it('keeps app onboarding public when requested',async()=>{
  const inserted:Record<string,unknown>[]=[];
  const client={from:()=>({insert:(v:Record<string,unknown>)=>{inserted.push(v);return{select:()=>({single:async()=>({data:{id:'feed',name:'Pokemon',slug:'pokemon'},error:null})})};},update:()=>({eq:async()=>({error:null})})})} as unknown as SupabaseClient;
  await createFeedFromDraft(client,draft,{ownerId:'caller',slug:'pokemon',isPublic:true,news:[],hasEvents:false});expect(inserted[0]?.['is_public']).toBe(true);
 });
});
