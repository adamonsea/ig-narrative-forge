import {createFileRoute,redirect} from '@tanstack/react-router';
import {useState} from 'react';
import {supabase} from '@/integrations/supabase/client';
import {Button} from '@/components/ui/button';
import {InlineError} from '@/components/ui/editorial';
import {CuratrLogo} from '@/components/brand/CuratrLogo';
export const Route=createFileRoute('/studio/handover/$token')({ssr:false,
 head:()=>({meta:[{title:'Accept a private feed | Curatr'},{name:'description',content:'Accept a private Curatr feed into your own account.'},{property:'og:title',content:'Accept a private feed | Curatr'},{property:'og:description',content:'Accept a private Curatr feed into your own account.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary'},{name:'robots',content:'noindex,nofollow'}]}),
 beforeLoad:async({location})=>{const {data}=await supabase.auth.getSession();if(!data.session)throw redirect({href:`/auth?mode=signin&redirect=${encodeURIComponent(location.pathname)}`});},component:Accept,
});
function Accept(){const {token}=Route.useParams();const [busy,setBusy]=useState(false);const [error,setError]=useState<string|null>(null);
 async function accept(){setBusy(true);setError(null);const {data,error:e}=await supabase.rpc('claim_feed_handover',{p_token:token});setBusy(false);if(e||!data){setError(e?.message??'This link is no longer available.');return;}window.location.href=`/studio/preview/${data}`;}
 return <main className="flex min-h-dvh items-center justify-center bg-background p-6"><section className="w-full max-w-md space-y-6"><CuratrLogo className="text-[32px]"/><h1 className="text-2xl font-semibold text-foreground">Accept this feed</h1>{error&&<InlineError message={error}/>}<div className="flex gap-3"><Button disabled={busy} onClick={()=>void accept()}>Accept</Button><Button asChild variant="ghost"><a href="/dashboard">Cancel</a></Button></div></section></main>;
}
