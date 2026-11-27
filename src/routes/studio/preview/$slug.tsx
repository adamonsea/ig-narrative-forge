import {createFileRoute,redirect} from '@tanstack/react-router';
import {useState} from 'react';
import {supabase} from '@/integrations/supabase/client';
import TopicFeed from '@/pages/TopicFeed';
import {Button} from '@/components/ui/button';
import {InlineError} from '@/components/ui/editorial';
import {WorkspaceDrawer} from '@/components/workspace/WorkspaceDrawer';
import {Input} from '@/components/ui/input';
import {ProGateDialog} from '@/components/billing/ProGateDialog';
import {useAuth} from '@/hooks/useAuth';
import {ArrowLeft,Send} from 'lucide-react';
export const Route=createFileRoute('/studio/preview/$slug')({
 ssr:false,
 head:()=>({meta:[{title:'Private feed preview | Curatr'},{name:'description',content:'Check your private Curatr feed before you decide to publish.'},{property:'og:title',content:'Private feed preview | Curatr'},{property:'og:description',content:'Check your private Curatr feed before you decide to publish.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary'},{name:'robots',content:'noindex,nofollow'}]}),
 beforeLoad:async({location})=>{const {data}=await supabase.auth.getSession();if(!data.session)throw redirect({href:`/auth?mode=signin&redirect=${encodeURIComponent(location.pathname)}`});},
 loader:async({params})=>{
  const {data:auth}=await supabase.auth.getUser();if(!auth.user)throw new Error('Sign in to preview your feed.');
  const {data,error}=await supabase.from('topics').select('id,name,slug,is_public').eq('slug',params.slug).eq('created_by',auth.user.id).eq('is_archived',false).single();
  if(error||!data)throw new Error('This preview is only available to its owner.');return data;
 },
 component:Preview,
 errorComponent:()=> <main className="min-h-dvh bg-background p-6"><InlineError message="This preview is only available to its owner."/></main>,
});
function Preview(){
 const feed=Route.useLoaderData();const {isAdmin,isSuperAdmin}=useAuth();
 const [gate,setGate]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState<string|null>(null);const [handover,setHandover]=useState(false);const [link,setLink]=useState('');
 async function publish(){setBusy(true);setError(null);const {data,error:e}=await supabase.rpc('set_topic_distribution',{p_topic_id:feed.id,p_field:'is_public',p_enabled:true});setBusy(false);if(e){setError('Could not publish. Try again.');return;}const result=data as {success?:boolean;error?:string};if(result.error==='pro_required'){setGate(true);return;}if(!result.success){setError('Could not publish. Try again.');return;}window.location.href=`/@${feed.slug}`;}
 async function handOver(){setBusy(true);setError(null);const {data,error:e}=await supabase.rpc('create_feed_handover',{p_topic_id:feed.id});setBusy(false);if(e||!data){setError('Only a private demo feed can be handed over.');return;}setLink(`${window.location.origin}/studio/handover/${data}`);setHandover(true);}
 return <>
  <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 text-foreground">
   <Button asChild variant="ghost"><a href={`/dashboard/topic/${feed.slug}`}><ArrowLeft className="mr-2 h-4 w-4"/>Desk</a></Button>
   <div className="flex items-center gap-3">
    {(isAdmin||isSuperAdmin)&&!feed.is_public&&<Button variant="ghost" disabled={busy} onClick={()=>void handOver()}><Send className="mr-2 h-4 w-4"/>Hand over</Button>}
    {!feed.is_public&&<Button disabled={busy} onClick={()=>void publish()}>Publish</Button>}
   </div>
  </header>
  {error&&<div className="px-4 py-3"><InlineError message={error}/></div>}
  <TopicFeed privatePreview/>
  <ProGateDialog open={gate} onOpenChange={setGate} returnTo={`/studio/preview/${feed.slug}`}/>
  <WorkspaceDrawer open={handover} onOpenChange={setHandover} title="Hand over" srDescription="A private invitation for this feed" size="md">
   <div className="space-y-4"><label htmlFor="handover-link" className="text-base">Private link</label><Input id="handover-link" readOnly value={link}/><p className="text-sm text-muted-foreground">Expires in seven days. Used once.</p><Button variant="outline" onClick={()=>void navigator.clipboard.writeText(link)}>Copy</Button></div>
  </WorkspaceDrawer>
 </>;
}
